import type { JSXElement } from "solid-js";

import { createContext, createSignal, useContext } from "solid-js";

export type Event = { kind: "initial" } | ({ kind: "pane" } & PaneEvent);

export type PaneEvent = ActionLogListPaneEvent | ActionLogPaneEvent;

export type ActionLogListPaneEvent = { pane: "actionLogList" } & (
  | ({ mode: "normal" } & (
      | { type: "moveAbove" | "moveBelow" | "add" | "enterActionLogPane" }
      | { type: "focus"; actionLogId: string }
      | { type: "enterInsertMode"; focus: "text" | "startAt" | "endAt"; initialPosition: "start" | "end" }
    ))
  | ({ mode: "insert" } & ({ type: "leaveInsertMode" | "rotateFocus" } | { type: "changeEditorText"; newText: string }))
);

export type ActionLogPaneEvent = { pane: "actionLog" } & (
  | ({ mode: "normal" } & (
      | { type: "indent" | "dedent" | "addPrev" | "addNext" | "moveAbove" | "moveBelow" }
      | { type: "enterInsertMode"; initialPosition: "start" | "end" }
    ))
  | ({ mode: "insert" } & ({ type: "leaveInsertMode" } | { type: "changeEditorText"; newText: string }))
);

export type EventService = {
  currentEvent$: () => Event;
  emitEvent: (event: Event) => void;
};

const context = createContext<EventService>();

export function EventServiceProvider(props: { children: JSXElement }) {
  const [currentEvent$, emitEvent] = createSignal<Event>({ kind: "initial" });

  return <context.Provider value={{ currentEvent$, emitEvent }}>{props.children}</context.Provider>;
}

export function useEventService() {
  const service = useContext(context);
  if (!service) throw new Error("useEventService must be used within EventServiceProvider");

  return service;
}
