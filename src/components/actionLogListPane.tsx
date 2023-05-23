import type { ActionLogDocument } from "@/services/rxdb/collections/actionLog";

import { Temporal } from "@js-temporal/polyfill";
import { For } from "solid-js";

import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeAllSignal } from "@/services/rxdb/subscribe";
import { useStoreService } from "@/services/store";
import { renderWithServicesForTest } from "@/services/test";
import { styles } from "@/styles.css";
import { shortenClassName } from "@/test";

function epochMillisecondsToString(epochMilliseconds: number) {
  if (epochMilliseconds === 0) {
    return "N/A";
  }

  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainTime()
    .toString({ smallestUnit: "second" });
}

function ActionLog(props: { actionLog: ActionLogDocument }) {
  const { store } = useStoreService();
  const lockService = useLockService();

  const isSelected$ = createSignalWithLock(lockService, () => props.actionLog.id === store.actionLogListPane.currentActionLogId, false);

  return (
    <div classList={{ [styles.actionLog.container]: true, [styles.selected]: isSelected$() }}>
      <span class={styles.actionLog.beginAt}>{epochMillisecondsToString(props.actionLog.beginAt)}</span>
      <span class={styles.actionLog.waveDash}>～</span>
      <span class={styles.actionLog.endAt}>{epochMillisecondsToString(props.actionLog.endAt)}</span>
      <span class={styles.actionLog.text}>{props.actionLog.text}</span>
    </div>
  );
}

export function ActionLogListPane() {
  const { collections } = useRxDBService();
  const lockService = useLockService();

  const actionLogs$ = createSignalWithLock(
    lockService,
    createSubscribeAllSignal(() =>
      collections.actionLogs.find({
        selector: { beginAt: { $gt: 0 }, endAt: { $gt: 0 } },
        sort: [{ beginAt: "asc" }],
      })
    ),
    []
  );

  const ongoingActionLogs$ = createSignalWithLock(
    lockService,
    createSubscribeAllSignal(() =>
      collections.actionLogs.find({
        selector: { beginAt: { $gt: 0 }, endAt: 0 },
        sort: [{ beginAt: "asc" }],
      })
    ),
    []
  );

  const tentativeActionLogs$ = createSignalWithLock(
    lockService,
    createSubscribeAllSignal(() => collections.actionLogs.find({ selector: { beginAt: 0 } })),
    []
  );

  return (
    <div class={styles.actionLogList.container}>
      <For each={actionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
      <For each={ongoingActionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
      <For each={tentativeActionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
    </div>
  );
}

if (import.meta.vitest) {
  describe("display", () => {
    test("finished actionLogs are sorted by beginAt", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        lockService,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ActionLogListPane />
          {props.children}
        </>
      ));

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkInsert([
          { id: "1", text: "1", beginAt: 4, endAt: 9, updatedAt: 9 },
          { id: "2", text: "2", beginAt: 3, endAt: 9, updatedAt: 9 },
          { id: "3", text: "3", beginAt: 1, endAt: 9, updatedAt: 9 },
          { id: "4", text: "4", beginAt: 2, endAt: 9, updatedAt: 9 },
        ]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("ongoing actionLogs follows finished actionLogs and sorted by beginAt", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        lockService,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ActionLogListPane />
          {props.children}
        </>
      ));

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkInsert([
          // ongoing actionLogs
          { id: "1", text: "1", beginAt: 6, endAt: 0, updatedAt: 6 },
          { id: "2", text: "2", beginAt: 8, endAt: 0, updatedAt: 8 },
          { id: "3", text: "3", beginAt: 7, endAt: 0, updatedAt: 7 },
          { id: "4", text: "4", beginAt: 5, endAt: 0, updatedAt: 5 },

          // finished actionLogs
          { id: "5", text: "5", beginAt: 4, endAt: 9, updatedAt: 9 },
          { id: "6", text: "6", beginAt: 3, endAt: 9, updatedAt: 9 },
          { id: "7", text: "7", beginAt: 1, endAt: 9, updatedAt: 9 },
          { id: "8", text: "8", beginAt: 2, endAt: 9, updatedAt: 9 },
        ]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("tentative actionLogs follows ongoing actionLogs and sorted by id", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        lockService,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ActionLogListPane />
          {props.children}
        </>
      ));

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkInsert([
          // tentative actionLogs
          { id: "02", text: "02", beginAt: 0, endAt: 0, updatedAt: 10 },
          { id: "03", text: "03", beginAt: 0, endAt: 0, updatedAt: 10 },
          { id: "04", text: "04", beginAt: 0, endAt: 0, updatedAt: 10 },
          { id: "01", text: "01", beginAt: 0, endAt: 0, updatedAt: 10 },

          // ongoing actionLogs
          { id: "05", text: "05", beginAt: 4, endAt: 0, updatedAt: 4 },
          { id: "06", text: "06", beginAt: 3, endAt: 0, updatedAt: 3 },
          { id: "07", text: "07", beginAt: 1, endAt: 0, updatedAt: 1 },
          { id: "08", text: "08", beginAt: 2, endAt: 0, updatedAt: 2 },

          // finished actionLogs
          { id: "09", text: "09", beginAt: 6, endAt: 9, updatedAt: 9 },
          { id: "10", text: "10", beginAt: 8, endAt: 9, updatedAt: 9 },
          { id: "11", text: "11", beginAt: 7, endAt: 9, updatedAt: 9 },
          { id: "12", text: "12", beginAt: 5, endAt: 9, updatedAt: 9 },
        ]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("finished actionLog is selected", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        lockService,
        storeService: { updateStore },
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ActionLogListPane />
          {props.children}
        </>
      ));

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkInsert([
          { id: "finished", text: "finished", beginAt: 1, endAt: 2, updatedAt: 2 },
          { id: "ongoing", text: "ongoing", beginAt: 3, endAt: 0, updatedAt: 3 },
          { id: "tentative", text: "tentative", beginAt: 0, endAt: 0, updatedAt: 4 },
        ]);

        await updateStore((store) => {
          store.actionLogListPane.currentActionLogId = "finished";
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test.todo("ongoing actionLog is selected", async (_ctx) => {
      // TODO
    });

    test.todo("tentative actionLog is selected", async (_ctx) => {
      // TODO
    });
  });

  describe("RxDB changes", () => {
    test("text changes", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        lockService,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ActionLogListPane />
          {props.children}
        </>
      ));

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkInsert([
          { id: "finished", text: "finished", beginAt: 1, endAt: 2, updatedAt: 2 },
          { id: "ongoing", text: "ongoing", beginAt: 3, endAt: 0, updatedAt: 3 },
          { id: "tentative", text: "tentative", beginAt: 0, endAt: 0, updatedAt: 4 },
        ]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkUpsert([{ id: "finished", text: "changed finished", beginAt: 1, endAt: 2, updatedAt: 5 }]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("text of finished changed");

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkUpsert([{ id: "ongoing", text: "changed ongoing", beginAt: 3, endAt: 0, updatedAt: 6 }]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("text of ongoing changed");

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkUpsert([{ id: "tentative", text: "changed tentative", beginAt: 0, endAt: 0, updatedAt: 7 }]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("text of tentative changed");

      unmount();
    });

    test("beginAt changes", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        lockService,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ActionLogListPane />
          {props.children}
        </>
      ));

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkInsert([
          { id: "finished 1", text: "finished 1", beginAt: 2, endAt: 4, updatedAt: 4 },
          { id: "finished 2", text: "finished 2", beginAt: 3, endAt: 4, updatedAt: 4 },
          { id: "ongoing 1", text: "ongoing 1", beginAt: 5, endAt: 0, updatedAt: 5 },
          { id: "ongoing 2", text: "ongoing 2", beginAt: 6, endAt: 0, updatedAt: 6 },
          { id: "tentative 1", text: "tentative 1", beginAt: 0, endAt: 0, updatedAt: 7 },
          { id: "tentative 2", text: "tentative 2", beginAt: 0, endAt: 0, updatedAt: 7 },
        ]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkUpsert([{ id: "finished 2", text: "finished 2", beginAt: 1, endAt: 4, updatedAt: 8 }]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("beginAt of finished 2 changed");

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkUpsert([{ id: "ongoing 2", text: "ongoing 2", beginAt: 3, endAt: 0, updatedAt: 9 }]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("beginAt of ongoing 2 changed");

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkUpsert([{ id: "tentative 2", text: "tentative 2", beginAt: 4, endAt: 0, updatedAt: 10 }]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("beginAt of tentative 2 changed");

      unmount();
    });

    test("endAt changes", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        lockService,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ActionLogListPane />
          {props.children}
        </>
      ));

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkInsert([
          { id: "finished 1", text: "finished 1", beginAt: 1, endAt: 4, updatedAt: 4 },
          { id: "finished 2", text: "finished 2", beginAt: 3, endAt: 4, updatedAt: 4 },
          { id: "ongoing", text: "ongoing", beginAt: 2, endAt: 0, updatedAt: 5 },
        ]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await runWithLock(lockService, async () => {
        await collections.actionLogs.bulkUpsert([{ id: "ongoing", text: "ongoing", beginAt: 2, endAt: 6, updatedAt: 6 }]);
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("endAt of ongoing changed");

      unmount();
    });
  });
}
