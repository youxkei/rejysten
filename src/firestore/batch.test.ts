import { doc, getDocFromServer } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  hasOptimisticCommitFailure,
  waitForPendingOptimisticCommits,
  optimisticBatch,
} from "@/firestore/batch";
import { createFirestoreClient, type FirestoreClient } from "@/firestore/client";
import {
  createTestFirestore,
  seedDocs,
  testCollection,
  timestampForCreatedAt,
  type FirestoreTestDoc,
} from "@/firestore/testUtils";
import { acquireEmulator, releaseEmulator } from "@/test";

let emulatorPort: number;
let firestore: ReturnType<typeof createTestFirestore>;

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  firestore = createTestFirestore(emulatorPort, "firestore-batch-lib-test");
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

describe("optimisticBatch", () => {
  it("has the Firestore batch shape and applies overlay synchronously on commit", async () => {
    const client = createFirestoreClient(firestore);
    const col = testCollection(firestore, "optimistic_batch_sync_apply");
    await seedDocs(col, {
      existing: { text: "server", value: 1 },
      deleted: { text: "server", value: 1 },
    });
    const batch = optimisticBatch(client);

    const result = batch
      .set(doc(col, "doc1"), { text: "created", value: 1 })
      .update(doc(col, "existing"), { text: "updated", value: 2 })
      .delete(doc(col, "deleted"));

    expect(result).toBe(batch);

    batch.commit();

    expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "doc1", undefined)).toEqual({
      id: "doc1",
      text: "created",
      value: 1,
    });
    expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "existing", {
      id: "existing",
      text: "server",
      value: 1,
    })).toEqual({
      id: "existing",
      text: "updated",
      value: 2,
    });
    expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "deleted", {
      id: "deleted",
      text: "server",
      value: 1,
    })).toBeUndefined();

    await waitForPendingOptimisticCommits({ client });
    expect(hasOptimisticCommitFailure(client)).toBe(false);
  });

  it("rolls back overlay when the wrapped commit rejects", async () => {
    const client = createFirestoreClient(firestore);
    const col = testCollection(firestore, "optimistic_batch_rollback");
    client.overlay.acknowledgeDocument(`${col.id}/missing`, { text: "base", value: 0 });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const batch = optimisticBatch(client);

    try {
      batch.update(doc(col, "missing"), { text: "optimistic", value: 1 });
      batch.commit();

      expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "missing", undefined)).toEqual({
        id: "missing",
        text: "optimistic",
        value: 1,
      });

      await waitForPendingOptimisticCommits({ client });

      expect(hasOptimisticCommitFailure(client)).toBe(true);
      expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "missing", undefined)).toBeUndefined();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("creates the underlying Firestore WriteBatch internally", async () => {
    const client = createFirestoreClient(firestore);
    const col = testCollection(firestore, "optimistic_batch_internal_write_batch");
    const batch = optimisticBatch(client);

    batch.set(doc(col, "doc1"), { text: "optimistic", value: 1 });
    batch.commit();

    expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "doc1", undefined)).toEqual({
      id: "doc1",
      text: "optimistic",
      value: 1,
    });

    await waitForPendingOptimisticCommits({ client });

    expect(hasOptimisticCommitFailure(client)).toBe(false);
  });

  it("queues consecutive commits and keeps the latest optimistic value", async () => {
    const client = createFirestoreClient(firestore);
    const col = testCollection(firestore, "optimistic_batch_consecutive_commits");

    const firstBatch = optimisticBatch(client);
    firstBatch.set(doc(col, "doc1"), { text: "first", value: 1 });
    firstBatch.commit();

    const secondBatch = optimisticBatch(client);
    secondBatch.update(doc(col, "doc1"), { text: "second", value: 2 });
    secondBatch.commit();

    expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "doc1", undefined)).toEqual({
      id: "doc1",
      text: "second",
      value: 2,
    });

    await waitForPendingOptimisticCommits({ client });

    const persisted = await getDocFromServer(doc(col, "doc1"));
    expect(persisted.data()).toMatchObject({ text: "second", value: 2 });
    expect(hasOptimisticCommitFailure(client)).toBe(false);
  });

  it("marks successful commits and clears the failure state", async () => {
    const client = createFirestoreClient(firestore);
    const col = testCollection(firestore, "optimistic_batch_success_after_failure");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      client.overlay.acknowledgeDocument(`${col.id}/failed`, { text: "base", value: 0 });
      const failingBatch = optimisticBatch(client);
      failingBatch.update(doc(col, "failed"), { text: "failed", value: 1 });
      failingBatch.commit();
      await waitForPendingOptimisticCommits({ client });
      expect(hasOptimisticCommitFailure(client)).toBe(true);

      const successfulBatch = optimisticBatch(client);
      successfulBatch.set(doc(col, "success"), { text: "success", value: 2 });
      successfulBatch.commit();
      await waitForPendingOptimisticCommits({ client });

      expect(hasOptimisticCommitFailure(client)).toBe(false);
      expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "success", undefined)).toEqual({
        id: "success",
        text: "success",
        value: 2,
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses client-level ignoredFieldsForOverlay", async () => {
    const client: FirestoreClient = createFirestoreClient(firestore, {
      optimisticBatch: {
        ignoredFieldsForOverlay: ["createdAt", "updatedAt"],
      },
    });
    const col = testCollection(firestore, "optimistic_batch_ignored_fields");
    const batch = optimisticBatch(client);

    batch.set(doc(col, "doc1"), {
      text: "created",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    batch.commit();

    expect(client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "doc1", undefined)).toEqual({
      id: "doc1",
      text: "created",
      value: 1,
    });

    await waitForPendingOptimisticCommits({ client });
  });
});
