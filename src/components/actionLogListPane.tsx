import type { ActionLogDocument } from "@/services/rxdb/collections/actionLog";
import type { Temporal } from "@js-temporal/polyfill";

import { Index, Match, Show, Switch, createEffect } from "solid-js";

import { Editor } from "@/components/editor";
import { createDouble } from "@/components/event";
import { useEventService } from "@/services/event";
import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeAllSignal } from "@/services/rxdb/subscribe";
import { useStoreService } from "@/services/store";
import { renderWithServicesForTest } from "@/services/test";
import { matches } from "@/solid/switch";
import { styles } from "@/styles.css";
import { durationTextBetweenEpochMs, epochMsToPlainDateTime, epochMsToTimeText } from "@/temporal";
import { shortenClassName } from "@/test";

type ActionLog = { type: "actionLog"; value: ActionLogDocument };
type DateSeparator = { type: "dateSeparator"; value: Temporal.PlainDate };
type ActionLogOrDateSeparator = ActionLog | DateSeparator;

function isActionLog(actionLogOrDateSeparator: ActionLogOrDateSeparator): actionLogOrDateSeparator is ActionLog {
  return actionLogOrDateSeparator.type === "actionLog";
}

function isDateSeparator(
  actionLogOrDateSeparator: ActionLogOrDateSeparator
): actionLogOrDateSeparator is DateSeparator {
  return actionLogOrDateSeparator.type === "dateSeparator";
}

function ActionLog(props: { actionLog: ActionLogDocument }) {
  const { state } = useStoreService();
  const lock = useLockService();
  const { emitEvent } = useEventService();

  let container: HTMLDivElement | undefined;

  const isSelected$ = createSignalWithLock(
    lock,
    () => props.actionLog.id === state.actionLogListPane.currentActionLogId,
    false,
    true
  );
  const isEditor$ = createSignalWithLock(lock, () => isSelected$() && state.mode === "insert", false);

  createEffect(() => {
    if (!isSelected$() || !container || !container.parentElement) return;

    const parentRect = container.parentElement.getBoundingClientRect();
    const rect = container.getBoundingClientRect();

    if (rect.top < parentRect.top) {
      container.scrollIntoView({ block: "start" });
    }

    if (rect.bottom > parentRect.bottom) {
      container.scrollIntoView({ block: "end" });
    }
  });

  const onClick$ = () => {
    const actionLogId = props.actionLog.id;
    return () => {
      emitEvent({
        pane: "actionLogList",
        mode: "normal",
        type: "focus",
        actionLogId,
      });
    };
  };

  function createOnDoubleClick(focus: "text" | "startAt" | "endAt") {
    const onClick = onClick$();

    return createDouble(300, (_, isDouble) => {
      if (isDouble) {
        emitEvent({
          pane: "actionLogList",
          mode: "normal",
          type: "enterInsertMode",
          focus,
          cursorPosition: -1,
        });
      } else {
        onClick();
      }
    });
  }

  return (
    <div
      ref={container}
      classList={{
        [styles.actionLogListPane.actionLogList.actionLog.container]: true,
        [styles.selected]: isSelected$(),
      }}
      onClick={onClick$()}
    >
      <div class={styles.actionLogListPane.actionLogList.actionLog.startAt} onClick={createOnDoubleClick("startAt")}>
        <Show
          when={isEditor$() && state.actionLogListPane.focus === "startAt"}
          fallback={epochMsToTimeText(props.actionLog.startAt) || "N/A"}
        >
          <Editor />
        </Show>
      </div>
      <div class={styles.actionLogListPane.actionLogList.actionLog.endAt} onClick={createOnDoubleClick("endAt")}>
        <Show
          when={isEditor$() && state.actionLogListPane.focus === "endAt"}
          fallback={epochMsToTimeText(props.actionLog.endAt) || "N/A"}
        >
          <Editor />
        </Show>
      </div>
      <div class={styles.actionLogListPane.actionLogList.actionLog.duration}>
        {durationTextBetweenEpochMs(props.actionLog.startAt, props.actionLog.endAt) || "N/A"}
      </div>
      <div class={styles.actionLogListPane.actionLogList.actionLog.text} onClick={createOnDoubleClick("text")}>
        <Show when={isEditor$() && state.actionLogListPane.focus === "text"} fallback={props.actionLog.text}>
          <Editor />
        </Show>
      </div>
    </div>
  );
}

function DateSeparator(props: { date: Temporal.PlainDate }) {
  return <div class={styles.actionLogListPane.actionLogList.separator}>{props.date.toString()}</div>;
}

function Buttons() {
  const { state } = useStoreService();
  const lock = useLockService();
  const { emitEvent } = useEventService();

  const mode$ = createSignalWithLock(lock, () => state.mode, "normal");

  return (
    <div class={styles.actionLogListPane.buttons}>
      <Switch>
        <Match when={mode$() === "normal"}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLogList", mode: "normal", type: "moveAbove" });
            }}
          >
            ⬆
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLogList", mode: "normal", type: "moveBelow" });
            }}
          >
            ⬇
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLogList", mode: "normal", type: "moveToActionLogPane" });
            }}
          >
            ➡
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({
                pane: "actionLogList",
                mode: "normal",
                type: "enterInsertMode",
                focus: "text",
                cursorPosition: -1,
              });
            }}
          >
            📝
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({
                pane: "actionLogList",
                mode: "normal",
                type: "enterInsertMode",
                focus: "startAt",
                cursorPosition: -1,
              });
            }}
          >
            ⏪
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({
                pane: "actionLogList",
                mode: "normal",
                type: "enterInsertMode",
                focus: "endAt",
                cursorPosition: -1,
              });
            }}
          >
            ⏩
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLogList", mode: "normal", type: "start" });
            }}
          >
            ▶️
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLogList", mode: "normal", type: "finish" });
            }}
          >
            ⏹️
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLogList", mode: "normal", type: "add" });
            }}
          >
            🆕
          </button>
        </Match>
        <Match when={mode$() === "insert"}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) =>
              emitEvent({
                pane: "actionLogList",
                mode: "insert",
                type: "delete",
                preventDefault: () => e.preventDefault(),
              })
            }
          >
            🗑️
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => emitEvent({ pane: "actionLogList", mode: "insert", type: "leaveInsertMode" })}
          >
            🔙
          </button>
        </Match>
      </Switch>
    </div>
  );
}

export function ActionLogListPane() {
  return (
    <div class={styles.actionLogListPane.container}>
      <ActionLogList />
      <Buttons />
    </div>
  );
}

function ActionLogList() {
  const { collections } = useRxDBService();
  const lock = useLockService();

  const finishedActionLogs$ = createSignalWithLock(
    lock,
    createSubscribeAllSignal(() =>
      collections.actionLogs.find({
        selector: { startAt: { $gt: 0 }, endAt: { $gt: 0 } },
        sort: [{ startAt: "asc" }],
      })
    ),
    []
  );

  const finishedActionLogsWithDateSeparators$ = () => {
    const actionLogs = finishedActionLogs$();
    if (actionLogs.length === 0) return [];

    const actionLogsWithSeparators = [
      {
        type: "dateSeparator",
        value: epochMsToPlainDateTime(actionLogs[0].startAt).toPlainDate(),
      },
      { type: "actionLog", value: actionLogs[0] },
    ] as ActionLogOrDateSeparator[];

    for (let i = 1; i < actionLogs.length; i++) {
      const beforeDate = epochMsToPlainDateTime(actionLogs[i - 1].startAt).toPlainDate();
      const afterDate = epochMsToPlainDateTime(actionLogs[i].startAt).toPlainDate();

      if (beforeDate.until(afterDate).days > 0) {
        actionLogsWithSeparators.push({
          type: "dateSeparator",
          value: afterDate,
        });
      }

      actionLogsWithSeparators.push({
        type: "actionLog",
        value: actionLogs[i],
      });
    }

    return actionLogsWithSeparators;
  };

  const ongoingActionLogs$ = createSignalWithLock(
    lock,
    createSubscribeAllSignal(() =>
      collections.actionLogs.find({
        selector: { startAt: { $gt: 0 }, endAt: 0 },
        sort: [{ startAt: "asc" }],
      })
    ),
    []
  );

  const tentativeActionLogs$ = createSignalWithLock(
    lock,
    createSubscribeAllSignal(() => collections.actionLogs.find({ selector: { startAt: 0 } })),
    []
  );

  return (
    <div class={styles.actionLogListPane.actionLogList.container}>
      <Index each={finishedActionLogsWithDateSeparators$()}>
        {(actionLogOrDateSeparator) => (
          <Switch>
            <Match when={matches(actionLogOrDateSeparator(), isActionLog)}>
              {(actionLog) => <ActionLog actionLog={actionLog().value} />}
            </Match>
            <Match when={matches(actionLogOrDateSeparator(), isDateSeparator)}>
              {(dateSeparator) => <DateSeparator date={dateSeparator().value} />}
            </Match>
          </Switch>
        )}
      </Index>

      <Show when={ongoingActionLogs$().length > 0}>
        <div class={styles.actionLogListPane.actionLogList.separator}>ongoing</div>
      </Show>
      <Index each={ongoingActionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog()} />}</Index>

      <Show when={tentativeActionLogs$().length > 0}>
        <div class={styles.actionLogListPane.actionLogList.separator}>tentative</div>
      </Show>
      <Index each={tentativeActionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog()} />}</Index>
    </div>
  );
}

if (import.meta.vitest) {
  describe("display", () => {
    test("finished actionLogs are sorted by startAt", async (ctx) => {
      const { container, unmount } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ActionLogList />
            {props.children}
          </>
        ),
        ({ rxdb: { collections } }) =>
          // prettier-ignore
          collections.actionLogs.bulkInsert([
            { id: "1", text: "1", startAt: 4, endAt: 9, updatedAt: 9 },
            { id: "2", text: "2", startAt: 3, endAt: 9, updatedAt: 9 },
            { id: "3", text: "3", startAt: 1, endAt: 9, updatedAt: 9 },
            { id: "4", text: "4", startAt: 2, endAt: 9, updatedAt: 9 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("ongoing actionLogs follows finished actionLogs and sorted by startAt", async (ctx) => {
      const { container, unmount } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ActionLogList />
            {props.children}
          </>
        ),
        ({ rxdb: { collections } }) =>
          // prettier-ignore
          collections.actionLogs.bulkInsert([
            // ongoing actionLogs
            { id: "1", text: "1", startAt: 6, endAt: 0, updatedAt: 6 },
            { id: "2", text: "2", startAt: 8, endAt: 0, updatedAt: 8 },
            { id: "3", text: "3", startAt: 7, endAt: 0, updatedAt: 7 },
            { id: "4", text: "4", startAt: 5, endAt: 0, updatedAt: 5 },

            // finished actionLogs
            { id: "5", text: "5", startAt: 4, endAt: 9, updatedAt: 9 },
            { id: "6", text: "6", startAt: 3, endAt: 9, updatedAt: 9 },
            { id: "7", text: "7", startAt: 1, endAt: 9, updatedAt: 9 },
            { id: "8", text: "8", startAt: 2, endAt: 9, updatedAt: 9 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("tentative actionLogs follows ongoing actionLogs and sorted by id", async (ctx) => {
      const { container, unmount } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ActionLogList />
            {props.children}
          </>
        ),
        ({ rxdb: { collections } }) =>
          // prettier-ignore
          collections.actionLogs.bulkInsert([
            // tentative actionLogs
            { id: "02", text: "02", startAt: 0, endAt: 0, updatedAt: 10 },
            { id: "03", text: "03", startAt: 0, endAt: 0, updatedAt: 10 },
            { id: "04", text: "04", startAt: 0, endAt: 0, updatedAt: 10 },
            { id: "01", text: "01", startAt: 0, endAt: 0, updatedAt: 10 },

            // ongoing actionLogs
            { id: "05", text: "05", startAt: 4, endAt: 0, updatedAt: 4 },
            { id: "06", text: "06", startAt: 3, endAt: 0, updatedAt: 3 },
            { id: "07", text: "07", startAt: 1, endAt: 0, updatedAt: 1 },
            { id: "08", text: "08", startAt: 2, endAt: 0, updatedAt: 2 },

            // finished actionLogs
            { id: "09", text: "09", startAt: 6, endAt: 9, updatedAt: 9 },
            { id: "10", text: "10", startAt: 8, endAt: 9, updatedAt: 9 },
            { id: "11", text: "11", startAt: 7, endAt: 9, updatedAt: 9 },
            { id: "12", text: "12", startAt: 5, endAt: 9, updatedAt: 9 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("finished actionLog is selected", async (ctx) => {
      const { container, unmount } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ActionLogList />
            {props.children}
          </>
        ),
        async ({ rxdb: { collections }, store: { updateState } }) => {
          // prettier-ignore
          await collections.actionLogs.bulkInsert([
            { id: "finished",  text: "finished",  startAt: 1, endAt: 2, updatedAt: 2 },
            { id: "ongoing",   text: "ongoing",   startAt: 3, endAt: 0, updatedAt: 3 },
            { id: "tentative", text: "tentative", startAt: 0, endAt: 0, updatedAt: 4 },
          ]);

          updateState((state) => {
            state.actionLogListPane.currentActionLogId = "finished";
          });
        }
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test.todo("ongoing actionLog is selected", async (_ctx) => {
      // TODO
    });

    test.todo("tentative actionLog is selected", async (_ctx) => {
      // TODO
    });

    test.todo("date separators", async (_ctx) => {
      // TODO
    });
  });

  describe("RxDB changes", () => {
    test("text changes", async (ctx) => {
      const {
        container,
        unmount,
        rxdb: { collections },
        lock,
      } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ActionLogList />
            {props.children}
          </>
        ),
        ({ rxdb: { collections } }) =>
          // prettier-ignore
          collections.actionLogs.bulkInsert([
            { id: "finished",  text: "finished",  startAt: 1, endAt: 2, updatedAt: 2 },
            { id: "ongoing",   text: "ongoing",   startAt: 3, endAt: 0, updatedAt: 3 },
            { id: "tentative", text: "tentative", startAt: 0, endAt: 0, updatedAt: 4 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await runWithLock(lock, async () => {
        await collections.actionLogs.upsert({
          id: "finished",
          text: "changed finished",
          startAt: 1,
          endAt: 2,
          updatedAt: 5,
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("text of finished changed");

      await runWithLock(lock, async () => {
        await collections.actionLogs.upsert({
          id: "ongoing",
          text: "changed ongoing",
          startAt: 3,
          endAt: 0,
          updatedAt: 6,
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("text of ongoing changed");

      await runWithLock(lock, async () => {
        await collections.actionLogs.upsert({
          id: "tentative",
          text: "changed tentative",
          startAt: 0,
          endAt: 0,
          updatedAt: 7,
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("text of tentative changed");

      unmount();
    });

    test("startAt changes", async (ctx) => {
      const {
        container,
        unmount,
        rxdb: { collections },
        lock,
      } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ActionLogList />
            {props.children}
          </>
        ),
        ({ rxdb: { collections } }) =>
          // prettier-ignore
          collections.actionLogs.bulkInsert([
            { id: "finished 1",  text: "finished 1",  startAt: 2, endAt: 4, updatedAt: 4 },
            { id: "finished 2",  text: "finished 2",  startAt: 3, endAt: 4, updatedAt: 4 },
            { id: "ongoing 1",   text: "ongoing 1",   startAt: 5, endAt: 0, updatedAt: 5 },
            { id: "ongoing 2",   text: "ongoing 2",   startAt: 6, endAt: 0, updatedAt: 6 },
            { id: "tentative 1", text: "tentative 1", startAt: 0, endAt: 0, updatedAt: 7 },
            { id: "tentative 2", text: "tentative 2", startAt: 0, endAt: 0, updatedAt: 7 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await runWithLock(lock, async () => {
        await collections.actionLogs.upsert({
          id: "finished 2",
          text: "finished 2",
          startAt: 1,
          endAt: 4,
          updatedAt: 8,
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("startAt of finished 2 changed");

      await runWithLock(lock, async () => {
        await collections.actionLogs.upsert({
          id: "ongoing 2",
          text: "ongoing 2",
          startAt: 3,
          endAt: 0,
          updatedAt: 9,
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("startAt of ongoing 2 changed");

      await runWithLock(lock, async () => {
        await collections.actionLogs.upsert({
          id: "tentative 2",
          text: "tentative 2",
          startAt: 4,
          endAt: 0,
          updatedAt: 10,
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("startAt of tentative 2 changed");

      unmount();
    });

    test("endAt changes", async (ctx) => {
      const {
        container,
        unmount,
        rxdb: { collections },
        lock,
      } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ActionLogList />
            {props.children}
          </>
        ),
        ({ rxdb: { collections } }) =>
          // prettier-ignore
          collections.actionLogs.bulkInsert([
            { id: "finished 1", text: "finished 1", startAt: 1, endAt: 4, updatedAt: 4 },
            { id: "finished 2", text: "finished 2", startAt: 3, endAt: 4, updatedAt: 4 },
            { id: "ongoing",    text: "ongoing",    startAt: 2, endAt: 0, updatedAt: 5 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await runWithLock(lock, async () => {
        await collections.actionLogs.upsert({
          id: "ongoing",
          text: "ongoing",
          startAt: 2,
          endAt: 6,
          updatedAt: 6,
        });
      });

      ctx.expect(shortenClassName(container)).toMatchSnapshot("endAt of ongoing changed");

      unmount();
    });
  });

  describe("PC operations", () => {
    describe("keyboard operation", () => {
      test.skip("press o to add actionLog", () => {
        // TODO
      });

      test.skip("press backspace to delete actionLog", () => {
        // TODO
      });

      test.skip("press L to move to ActionLogPane", () => {
        // TODO
      });
    });

    describe("mouse operation", () => {
      test.skip("click to focus actionLog", () => {
        // TODO
      });

      test.skip("double click to edit text", () => {
        // TODO
      });

      test.skip("double click to edit startAt", () => {
        // TODO
      });

      test.skip("double click to edit endAt", () => {
        // TODO
      });
    });
  });

  describe.skip("mobile operations", () => {
    // TODO
  });
}
