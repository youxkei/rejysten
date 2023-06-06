import type { JSXElement } from "solid-js";

import { createContext, createSignal, useContext } from "solid-js";

import { ServiceNotAvailable } from "@/services/error";

export type Event = { kind: "initial" } | PaneEvent;

export type PaneEvent = ActionLogListPaneEvent | ActionLogPaneEvent;

export type ActionLogListPaneEvent = { kind: "pane"; pane: "actionLogList" } & (
  | ({ mode: "normal" } & (
      | { type: "moveAbove" | "moveBelow" | "add" | "start" | "finish" | "moveToActionLogPane" }
      | { type: "focus"; actionLogId: string }
      | { type: "enterInsertMode"; focus: "text" | "startAt" | "endAt"; initialPosition: "start" | "end" }
    ))
  | ({ mode: "insert" } & ({ type: "rotateFocus" | "delete" | "leaveInsertMode" } | { type: "changeEditorText"; newText: string }))
);

export type ActionLogPaneEvent = { kind: "pane"; pane: "actionLog" } & (
  | ({ mode: "normal" } & (
      | { type: "indent" | "dedent" | "addPrev" | "addNext" | "moveAbove" | "moveBelow" | "moveToActionLogListPane" }
      | { type: "enterInsertMode"; initialPosition: "start" | "end" }
    ))
  | ({ mode: "insert" } & ({ type: "indent" | "dedent" | "delete" | "leaveInsertMode" } | { type: "changeEditorText"; newText: string }))
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
  if (!service) throw new ServiceNotAvailable("Event");

  return service;
}
