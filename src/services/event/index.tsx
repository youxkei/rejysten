import type { JSXElement } from "solid-js";

import { createContext, createSignal, useContext } from "solid-js";

export type Event = { type: "initial" } | { type: "pane"; event: PaneEvent };

export type PaneEvent = ActionLogListPaneEvent | ActionLogPaneEvent;
export type ActionLogListPaneEvent =
  | { pane: "actionLogList"; type: "add" | "enter" | "leaveInsertMode" }
  | { pane: "actionLogList"; type: "enterInsertMode"; initialPosition: "start" | "end" }
  | { pane: "actionLogList"; type: "changeText"; newText: string };
export type ActionLogPaneEvent =
  | {
      pane: "actionLog";
      type: "indent" | "dedent" | "addPrev" | "addNext" | "moveAbove" | "moveBelow" | "leaveInsertMode";
    }
  | { pane: "actionLog"; type: "enterInsertMode"; initialPosition: "start" | "end" }
  | { pane: "actionLog"; type: "changeText"; newText: string };

export type EventService = {
  currentEvent$: () => Event;
  emitEvent: (event: Event) => void;
};

const context = createContext<EventService>();

export function EventServiceProvider(props: { children: JSXElement }) {
  const [currentEvent$, emitEvent] = createSignal<Event>({ type: "initial" });

  return <context.Provider value={{ currentEvent$, emitEvent }}>{props.children}</context.Provider>;
}

export function useEventService() {
  const service = useContext(context);
  if (!service) throw new Error("useEventService must be used within EventServiceProvider");

  return service;
}
