import type { JSXElement } from "solid-js";

import { createContext, useContext } from "solid-js";

import { ServiceNotAvailable } from "@/services/error";

export type Event = ActionLogListPaneEvent | ActionLogPaneEvent;

export type ActionLogListPaneEvent = { pane: "actionLogList" } & (
  | ({ mode: "normal" } & (
      | { type: "moveAbove" | "moveBelow" | "add" | "start" | "finish" | "moveToActionLogPane" }
      | { type: "focus"; actionLogId: string }
      | { type: "enterInsertMode"; focus: "text" | "startAt" | "endAt"; initialPosition: "start" | "end" }
    ))
  | ({ mode: "insert" } & ({ type: "rotateFocus" | "delete" | "leaveInsertMode" } | { type: "changeEditorText"; newText: string }))
);

export type ActionLogPaneEvent = { pane: "actionLog" } & (
  | ({ mode: "normal" } & (
      | { type: "indent" | "dedent" | "addPrev" | "addNext" | "moveAbove" | "moveBelow" | "moveToActionLogListPane" }
      | { type: "enterInsertMode"; initialPosition: "start" | "end" }
    ))
  | ({ mode: "insert" } & (
      | { type: "indent" | "dedent" | "delete" | "deleteAndMoveToActionLogListPane" | "leaveInsertMode" }
      | { type: "changeEditorText"; newText: string }
    ))
);

export type EventService = {
  registerEventHandler: (handler: (event: Event) => unknown) => void;
  emitEvent: (event: Event) => void;
};

const context = createContext<EventService>();

export function EventServiceProvider(props: { children: JSXElement }) {
  const eventHandlers = [] as ((event: Event) => unknown)[];

  function registerEventHandler(handler: (event: Event) => unknown) {
    eventHandlers.push(handler);
  }

  function emitEvent(event: Event) {
    for (const handler of eventHandlers) {
      handler(event);
    }
  }

  return <context.Provider value={{ registerEventHandler, emitEvent }}>{props.children}</context.Provider>;
}

export function useEventService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Event");

  return service;
}
