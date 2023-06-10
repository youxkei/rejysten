import type { JSXElement } from "solid-js";

import { useKeyDownEvent } from "@solid-primitives/keyboard";
import { createEffect, untrack } from "solid-js";

import { NeverErrorWithFields } from "@/error";
import { useEventService } from "@/services/event";
import { emitActionLogListPaneEvent } from "@/services/eventEmitter/actionLogListPane";
import { emitActionLogPaneEvent } from "@/services/eventEmitter/actionLogPane";
import { useStoreService } from "@/services/store";

export function EventEmitterServiceProvider(props: { children: JSXElement }) {
  const { store } = useStoreService();
  const { emitEvent } = useEventService();

  const keyDownEvent$ = useKeyDownEvent();

  createEffect(() => {
    const event = keyDownEvent$();
    if (!event) return;

    if (event.code === "AltLeft" || event.code === "AltRight") {
      // disable alt key to avoid browser menu
      event.preventDefault();
      return;
    }

    untrack(() => {
      const ctx = { store, emitEvent };

      switch (store.currentPane) {
        case "actionLogList": {
          emitActionLogListPaneEvent(ctx, event);
          break;
        }

        case "actionLog": {
          emitActionLogPaneEvent(ctx, event);
          break;
        }

        default: {
          throw new NeverErrorWithFields("unknown store.currentPane", { store }, store.currentPane);
        }
      }
    });
  });

  return props.children;
}
