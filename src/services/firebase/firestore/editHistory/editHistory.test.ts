import {
  type CollectionReference,
  type Firestore,
  collection,
  doc,
  getDoc as getDocOriginal,
  getDocs as getDocsOriginal,
} from "firebase/firestore";
import { describe, it, vi, beforeAll, afterAll, expect } from "vitest";

import {
  singletonDocumentId,
  type Timestamps,
  type FirestoreService,
  type DocumentData,
} from "@/services/firebase/firestore";
import { runBatch, runTransaction } from "@/services/firebase/firestore/batch";
import { undo, redo, jumpTo, getChildren } from "@/services/firebase/firestore/editHistory";
import "@/services/firebase/firestore/editHistory/schema";
import { type Schema } from "@/services/firebase/firestore/schema";
import { createTestFirestoreService, timestampForServerTimestamp } from "@/services/firebase/firestore/test";
import { acquireEmulator, releaseEmulator, getEmulatorPort } from "@/test";

type TestDoc = Timestamps & { text: string; value: number };

let baseService: ReturnType<typeof createTestFirestoreService>;
let firestore: Firestore;
let service: FirestoreService;

function createFullTestService(base: ReturnType<typeof createTestFirestoreService>): FirestoreService {
  let batchVersion: DocumentData<Schema["batchVersion"]> | undefined;
  let editHistoryHead: DocumentData<Schema["editHistoryHead"]> | undefined;
  let lock = false;

  return {
    firestore: base.firestore,
    clock$: () => false,
    setClock: () => undefined,
    resolve: undefined,
    batchVersion$: () => batchVersion,
    editHistoryHead$: () => editHistoryHead,
    services: {
      firebase: {} as FirestoreService["services"]["firebase"],
      store: {
        state: {
          servicesFirestoreBatch: {
            get lock() {
              return lock;
            },
            set lock(v: boolean) {
              lock = v;
            },
          },
        } as FirestoreService["services"]["store"]["state"],
        updateState: (updater: (state: unknown) => void) => {
          updater({
            servicesFirestoreBatch: {
              get lock() {
                return lock;
              },
              set lock(v: boolean) {
                lock = v;
              },
            },
          });
        },
      },
    },
    // Refresh cached values from Firestore
    async _refreshSignals() {
      const batchVersionCol = collection(base.firestore, "batchVersion") as CollectionReference<Schema["batchVersion"]>;
      const snap = await getDocOriginal(doc(batchVersionCol, singletonDocumentId));
      batchVersion = snap.exists() ? { ...snap.data(), id: singletonDocumentId } : undefined;

      const editHistoryHeadCol = collection(base.firestore, "editHistoryHead") as CollectionReference<
        Schema["editHistoryHead"]
      >;
      const headSnap = await getDocOriginal(doc(editHistoryHeadCol, singletonDocumentId));
      editHistoryHead = headSnap.exists() ? { ...headSnap.data(), id: singletonDocumentId } : undefined;
    },
  } as FirestoreService & { _refreshSignals: () => Promise<void> };
}

beforeAll(async () => {
  await acquireEmulator();
  const emulatorPort = await getEmulatorPort();
  baseService = createTestFirestoreService(emulatorPort, "editHistory-test");
  firestore = baseService.firestore;
  service = createFullTestService(baseService);
});

afterAll(async () => {
  await releaseEmulator();
});

vi.mock(import("firebase/firestore"), async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    serverTimestamp: () => timestampForServerTimestamp,
  };
});

async function refreshSignals() {
  await (service as FirestoreService & { _refreshSignals: () => Promise<void> })._refreshSignals();
}

async function getEditHistoryEntries(): Promise<DocumentData<Schema["editHistory"]>[]> {
  const col = collection(firestore, "editHistory") as CollectionReference<Schema["editHistory"]>;
  const snap = await getDocsOriginal(col);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

async function getEditHistoryHead(): Promise<DocumentData<Schema["editHistoryHead"]> | undefined> {
  const col = collection(firestore, "editHistoryHead") as CollectionReference<Schema["editHistoryHead"]>;
  const snap = await getDocOriginal(doc(col, singletonDocumentId));
  return snap.exists() ? { ...snap.data(), id: singletonDocumentId } : undefined;
}

describe("editHistory creation in runBatch", () => {
  it("creates editHistory entry when batch has operations", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "hello", value: 1 });
    });

    const entries = await getEditHistoryEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const entry = entries[entries.length - 1];
    expect(entry.parentId).toBe("");
    expect(entry.operations).toEqual([{ type: "set", collection: tid, id: "doc1", data: { text: "hello", value: 1 } }]);
    expect(entry.inverseOperations).toEqual([{ type: "delete", collection: tid, id: "doc1" }]);
  });

  it("creates editHistoryHead singleton pointing to new entry", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "test", value: 1 });
    });

    const head = await getEditHistoryHead();
    expect(head).toBeTruthy();
    expect(head!.entryId).toBeTruthy();

    const entries = await getEditHistoryEntries();
    const latestEntry = entries.find((e) => e.id === head!.entryId);
    expect(latestEntry).toBeTruthy();
  });

  it("chains entries: second batch has parentId = first entry's id", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA", text: "first", value: 1 });
    });

    const headAfterFirst = await getEditHistoryHead();
    const firstEntryId = headAfterFirst!.entryId;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB", text: "second", value: 2 });
    });

    const headAfterSecond = await getEditHistoryHead();
    const secondEntryId = headAfterSecond!.entryId;
    expect(secondEntryId).not.toBe(firstEntryId);

    const entries = await getEditHistoryEntries();
    const secondEntry = entries.find((e) => e.id === secondEntryId);
    expect(secondEntry!.parentId).toBe(firstEntryId);
  });

  it("does not create editHistory when skipHistory is true", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    const entriesBefore = await getEditHistoryEntries();

    await refreshSignals();
    await runBatch(
      service,
      async (batch) => {
        batch.set(col, { id: "skipped", text: "skip", value: 0 });
      },
      { skipHistory: true },
    );

    const entriesAfter = await getEditHistoryEntries();
    expect(entriesAfter.length).toBe(entriesBefore.length);
  });

  it("stores description in editHistory entry", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(
      service,
      async (batch) => {
        batch.set(col, { id: "described", text: "desc", value: 1 });
      },
      { description: "テキスト編集" },
    );

    const head = await getEditHistoryHead();
    const entries = await getEditHistoryEntries();
    const entry = entries.find((e) => e.id === head!.entryId);
    expect(entry!.description).toBe("テキスト編集");
  });
});

describe("undo", () => {
  it("undoes a set by deleting the created document", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    const headBefore = await getEditHistoryHead();
    const parentId = headBefore?.entryId ?? "";

    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "hello", value: 1 });
    });

    // Verify doc exists
    const before = await getDocOriginal(doc(col, "doc1"));
    expect(before.exists()).toBe(true);

    await refreshSignals();
    await undo(service);

    // Verify doc no longer exists
    const after = await getDocOriginal(doc(col, "doc1"));
    expect(after.exists()).toBe(false);

    // Head should be at pre-test state
    const head = await getEditHistoryHead();
    expect(head!.entryId).toBe(parentId);
  });

  it("undoes an update by restoring old field values", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create initial doc
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "old", value: 1 });
    });

    // Update it
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.update(col, { id: "doc1", text: "new" });
    });

    const before = await getDocOriginal(doc(col, "doc1"));
    expect(before.data()!.text).toBe("new");

    // Undo update
    await refreshSignals();
    await undo(service);

    const after = await getDocOriginal(doc(col, "doc1"));
    expect(after.data()!.text).toBe("old");
  });

  it("undoes a delete by recreating the document", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create doc
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "hello", value: 42 });
    });

    // Delete it
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.delete(col, "doc1");
    });

    const deleted = await getDocOriginal(doc(col, "doc1"));
    expect(deleted.exists()).toBe(false);

    // Undo delete
    await refreshSignals();
    await undo(service);

    const restored = await getDocOriginal(doc(col, "doc1"));
    expect(restored.exists()).toBe(true);
    expect(restored.data()!.text).toBe("hello");
    expect(restored.data()!.value).toBe(42);
  });

  it("does not create a new editHistory entry (skipHistory)", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    const entriesBefore = await getEditHistoryEntries();

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "test", value: 1 });
    });

    const entriesAfterCreate = await getEditHistoryEntries();
    expect(entriesAfterCreate.length).toBe(entriesBefore.length + 1);

    await refreshSignals();
    await undo(service);

    const entriesAfterUndo = await getEditHistoryEntries();
    expect(entriesAfterUndo.length).toBe(entriesAfterCreate.length);
  });

  it("moves head to parent after undo", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Record starting head
    await refreshSignals();
    const startHead = await getEditHistoryHead();
    const startEntryId = startHead?.entryId ?? "";

    // Create entry A
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA", text: "a", value: 1 });
    });
    const headA = await getEditHistoryHead();
    const entryAId = headA!.entryId;

    // Create entry B
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB", text: "b", value: 2 });
    });

    // Undo B → head should be at A
    await refreshSignals();
    await undo(service);
    const headAfterUndo1 = await getEditHistoryHead();
    expect(headAfterUndo1!.entryId).toBe(entryAId);

    // Undo A → head should be at starting state
    await refreshSignals();
    await undo(service);
    const headAfterUndo2 = await getEditHistoryHead();
    expect(headAfterUndo2!.entryId).toBe(startEntryId);
  });
});

describe("redo", () => {
  it("redoes an undone set", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "hello", value: 1 });
    });

    await refreshSignals();
    await undo(service);
    const deleted = await getDocOriginal(doc(col, "doc1"));
    expect(deleted.exists()).toBe(false);

    await refreshSignals();
    await redo(service);
    const restored = await getDocOriginal(doc(col, "doc1"));
    expect(restored.exists()).toBe(true);
    expect(restored.data()!.text).toBe("hello");
  });

  it("redoes an undone update", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "old", value: 1 });
    });

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.update(col, { id: "doc1", text: "new" });
    });

    await refreshSignals();
    await undo(service);
    expect((await getDocOriginal(doc(col, "doc1"))).data()!.text).toBe("old");

    await refreshSignals();
    await redo(service);
    expect((await getDocOriginal(doc(col, "doc1"))).data()!.text).toBe("new");
  });

  it("does nothing when no children exist at current head", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create an entry — this is the head, it has no children
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "test", value: 1 });
    });

    const headBefore = await getEditHistoryHead();

    // Redo should be no-op since there are no children of current head
    await refreshSignals();
    await redo(service);

    const headAfter = await getEditHistoryHead();
    expect(headAfter!.entryId).toBe(headBefore!.entryId);
  });
});

describe("branching", () => {
  it("new edit after undo creates a branch", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create entry A
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA", text: "a", value: 1 });
    });
    const headA = await getEditHistoryHead();
    const entryAId = headA!.entryId;

    // Undo A
    await refreshSignals();
    await undo(service);

    // Create entry B (branch)
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB", text: "b", value: 2 });
    });
    const headB = await getEditHistoryHead();
    const entryBId = headB!.entryId;

    // Both A and B should have same parentId
    const entries = await getEditHistoryEntries();
    const entryA = entries.find((e) => e.id === entryAId);
    const entryB = entries.find((e) => e.id === entryBId);
    expect(entryA!.parentId).toBe(entryB!.parentId);

    // docB should exist, docA should not
    expect((await getDocOriginal(doc(col, "docB"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docA"))).exists()).toBe(false);
  });
});

describe("jumpTo", () => {
  it("jumps backward in linear history", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create chain: A → B → C
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA", text: "a", value: 1 });
    });
    const headA = await getEditHistoryHead();
    const entryAId = headA!.entryId;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB", text: "b", value: 2 });
    });

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docC", text: "c", value: 3 });
    });

    // Jump from C to A → should undo C and B
    await refreshSignals();
    await jumpTo(service, entryAId);

    const head = await getEditHistoryHead();
    expect(head!.entryId).toBe(entryAId);

    // Only docA should exist
    expect((await getDocOriginal(doc(col, "docA"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docB"))).exists()).toBe(false);
    expect((await getDocOriginal(doc(col, "docC"))).exists()).toBe(false);
  });

  it("jumping to current position is no-op", async () => {
    const head = await getEditHistoryHead();
    if (!head || head.entryId === "") return;

    await refreshSignals();
    await jumpTo(service, head.entryId);

    const headAfter = await getEditHistoryHead();
    expect(headAfter!.entryId).toBe(head.entryId);
  });

  it("jumps forward in linear history", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA", text: "a", value: 1 });
    });
    const headA = await getEditHistoryHead();
    const entryAId = headA!.entryId;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB", text: "b", value: 2 });
    });

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docC", text: "c", value: 3 });
    });
    const headC = await getEditHistoryHead();
    const entryCId = headC!.entryId;

    // Jump backward to A first
    await refreshSignals();
    await jumpTo(service, entryAId);
    expect((await getDocOriginal(doc(col, "docB"))).exists()).toBe(false);
    expect((await getDocOriginal(doc(col, "docC"))).exists()).toBe(false);

    // Jump forward to C
    await refreshSignals();
    await jumpTo(service, entryCId);

    const head = await getEditHistoryHead();
    expect(head!.entryId).toBe(entryCId);
    expect((await getDocOriginal(doc(col, "docA"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docB"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docC"))).exists()).toBe(true);
  });

  it("jumps across branches", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create A
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA", text: "a", value: 1 });
    });

    // Create B (child of A)
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB", text: "b", value: 2 });
    });
    const headB = await getEditHistoryHead();
    const entryBId = headB!.entryId;

    // Undo B to get back to A
    await refreshSignals();
    await undo(service);

    // Create C (branch from A, sibling of B)
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docC", text: "c", value: 3 });
    });

    // Head is at C. docB should not exist, docC should exist
    expect((await getDocOriginal(doc(col, "docB"))).exists()).toBe(false);
    expect((await getDocOriginal(doc(col, "docC"))).exists()).toBe(true);

    // Jump to B (across branches)
    await refreshSignals();
    await jumpTo(service, entryBId);

    const head = await getEditHistoryHead();
    expect(head!.entryId).toBe(entryBId);
    expect((await getDocOriginal(doc(col, "docB"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docC"))).exists()).toBe(false);
  });

  it("returns target's nextSelection for selection restore", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create A with explicit nextSelection
    await refreshSignals();
    await runBatch(
      service,
      async (batch) => {
        batch.set(col, { id: "docA", text: "a", value: 1 });
      },
      {
        description: "create A",
        prevSelection: { lifeLogs: "prev" },
        nextSelection: { lifeLogs: "A" },
      },
    );
    const headA = await getEditHistoryHead();
    const entryAId = headA!.entryId;

    // Create B with different nextSelection
    await refreshSignals();
    await runBatch(
      service,
      async (batch) => {
        batch.set(col, { id: "docB", text: "b", value: 2 });
      },
      {
        description: "create B",
        prevSelection: { lifeLogs: "A" },
        nextSelection: { lifeLogs: "B" },
      },
    );

    // Jump back to A — should return A's nextSelection
    await refreshSignals();
    const result = await jumpTo(service, entryAId);
    expect(result).toEqual({ lifeLogs: "A" });
  });
});

describe("getChildren", () => {
  it("returns children sorted ascending by ID", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create parent entry (E1)
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "a", value: 1 });
    });
    const parentId = (await getEditHistoryHead())!.entryId;

    // Create 3 branches from E1 by: create child → undo back to E1 → repeat
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "branch1", text: "b1", value: 1 });
    });
    await refreshSignals();
    await undo(service);

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "branch2", text: "b2", value: 1 });
    });
    await refreshSignals();
    await undo(service);

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "branch3", text: "b3", value: 1 });
    });

    await refreshSignals();
    const children = await getChildren(service, parentId);

    expect(children.length).toBe(3);
    // Should be sorted ascending by ID (uuidv7 = chronological)
    expect(children[0].id.localeCompare(children[1].id)).toBeLessThan(0);
    expect(children[1].id.localeCompare(children[2].id)).toBeLessThan(0);
  });

  it("returns empty array for leaf node", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "leaf", text: "leaf", value: 1 });
    });
    const leafId = (await getEditHistoryHead())!.entryId;

    await refreshSignals();
    const children = await getChildren(service, leafId);
    expect(children.length).toBe(0);
  });
});

describe("editHistory creation in runBatch - edge cases", () => {
  it("does not create editHistory when batch has no user operations", async () => {
    const entriesBefore = await getEditHistoryEntries();

    await refreshSignals();
    await runBatch(service, async () => {
      // No operations — only batchVersion update happens internally
    });

    const entriesAfter = await getEditHistoryEntries();
    expect(entriesAfter.length).toBe(entriesBefore.length);
  });
});

describe("editHistory creation in runTransaction", () => {
  it("creates editHistory entry in transaction", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create doc first for update
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "txDoc", text: "before", value: 1 });
    });
    const headBeforeTx = await getEditHistoryHead();

    await refreshSignals();
    await runTransaction(service, (batch) => {
      batch.update(col, { id: "txDoc", text: "after" });
    });

    const headAfterTx = await getEditHistoryHead();
    expect(headAfterTx!.entryId).not.toBe(headBeforeTx!.entryId);

    const entries = await getEditHistoryEntries();
    const txEntry = entries.find((e) => e.id === headAfterTx!.entryId);
    expect(txEntry).toBeTruthy();
    expect(txEntry!.operations).toEqual([{ type: "update", collection: tid, id: "txDoc", data: { text: "after" } }]);
  });

  it("does not create editHistory when skipHistory is true in transaction", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create doc first
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "txDoc2", text: "original", value: 1 });
    });

    const entriesBefore = await getEditHistoryEntries();

    await refreshSignals();
    await runTransaction(
      service,
      (batch) => {
        batch.update(col, { id: "txDoc2", text: "skipped" });
      },
      { skipHistory: true },
    );

    const entriesAfter = await getEditHistoryEntries();
    expect(entriesAfter.length).toBe(entriesBefore.length);
  });
});

describe("undo - edge cases", () => {
  it("does nothing when head entry does not exist", async () => {
    // Verify undo() handles gracefully without crashing
    const entriesBefore = await getEditHistoryEntries();

    // If head is already at "", undo should be no-op
    // If head points to an entry, that's fine — this test verifies no crash
    await refreshSignals();
    await undo(service);

    // Should not throw and entries count should not increase
    const entriesAfter = await getEditHistoryEntries();
    expect(entriesAfter.length).toBeLessThanOrEqual(entriesBefore.length);
  });

  it("undoes multiple operations in a single batch", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create initial docs
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docX", text: "x", value: 1 });
      batch.set(col, { id: "docY", text: "y", value: 2 });
    });

    // Single batch with multiple ops: update one, delete the other
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.update(col, { id: "docX", text: "x-updated" });
      batch.delete(col, "docY");
    });

    expect((await getDocOriginal(doc(col, "docX"))).data()!.text).toBe("x-updated");
    expect((await getDocOriginal(doc(col, "docY"))).exists()).toBe(false);

    // Undo — should restore both
    await refreshSignals();
    await undo(service);

    expect((await getDocOriginal(doc(col, "docX"))).data()!.text).toBe("x");
    expect((await getDocOriginal(doc(col, "docY"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docY"))).data()!.text).toBe("y");
  });
});

describe("redo - edge cases", () => {
  it("redoes an undone delete", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "doc1", text: "hello", value: 1 });
    });

    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.delete(col, "doc1");
    });

    // Undo the delete
    await refreshSignals();
    await undo(service);
    expect((await getDocOriginal(doc(col, "doc1"))).exists()).toBe(true);

    // Redo the delete
    await refreshSignals();
    await redo(service);
    expect((await getDocOriginal(doc(col, "doc1"))).exists()).toBe(false);
  });

  it("picks latest child when multiple branches exist", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Record starting head
    // Create branch A
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA", text: "a", value: 1 });
    });

    // Undo A
    await refreshSignals();
    await undo(service);

    // Create branch B (later uuidv7 than A)
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB", text: "b", value: 2 });
    });
    const headB = await getEditHistoryHead();
    const entryBId = headB!.entryId;

    // Undo B to get back to root
    await refreshSignals();
    await undo(service);

    // Redo without childId — should pick latest (B)
    await refreshSignals();
    await redo(service);
    const headAfterRedo = await getEditHistoryHead();
    expect(headAfterRedo!.entryId).toBe(entryBId);
    expect((await getDocOriginal(doc(col, "docB"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docA"))).exists()).toBe(false);
  });

  it("redo with specific childId picks that branch", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create branch A
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docA2", text: "a2", value: 1 });
    });
    const headA = await getEditHistoryHead();
    const entryAId = headA!.entryId;

    // Undo A
    await refreshSignals();
    await undo(service);

    // Create branch B
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docB2", text: "b2", value: 2 });
    });

    // Undo B
    await refreshSignals();
    await undo(service);

    // Redo with specific childId = A
    await refreshSignals();
    await redo(service, entryAId);
    const headAfterRedo = await getEditHistoryHead();
    expect(headAfterRedo!.entryId).toBe(entryAId);
    expect((await getDocOriginal(doc(col, "docA2"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docB2"))).exists()).toBe(false);
  });
});

describe("branching - edge cases", () => {
  it("original branch remains accessible via redo with childId", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

    // Create A
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docOrig", text: "original", value: 1 });
    });
    const headA = await getEditHistoryHead();
    const entryAId = headA!.entryId;

    // Undo A
    await refreshSignals();
    await undo(service);

    // Create B (branch)
    await refreshSignals();
    await runBatch(service, async (batch) => {
      batch.set(col, { id: "docBranch", text: "branch", value: 2 });
    });

    // Undo B
    await refreshSignals();
    await undo(service);

    // Redo to original branch A
    await refreshSignals();
    await redo(service, entryAId);
    expect((await getDocOriginal(doc(col, "docOrig"))).exists()).toBe(true);
    expect((await getDocOriginal(doc(col, "docBranch"))).exists()).toBe(false);
  });
});
