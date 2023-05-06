import type { JSXElement } from "solid-js";

import { createContext, createSignal, useContext } from "solid-js";

export type InitialEvent = { pane: "initial" };

export type ActionLogListPaneEvent = { pane: "actionLogList"; type: "add" | "enter" };

export type ActionLogPaneEvent = { pane: "actionLog"; type: "indent" | "dedent" | "addPrev" | "addNext" | "moveAbove" | "moveBelow" };

export type Event = InitialEvent | ActionLogListPaneEvent | ActionLogPaneEvent;

export type EventService = {
  currentEvent$: () => Event;
  emitEvent: (event: Event) => void;
};

const context = createContext<EventService>();

export function EventServiceProvider(props: { children: JSXElement }) {
  const [currentEvent$, emitEvent] = createSignal<Event>({ pane: "initial" });

  return <context.Provider value={{ currentEvent$, emitEvent }}>{props.children}</context.Provider>;
}

export function useEventService() {
  const service = useContext(context);
  if (!service) throw new Error("useEventService must be used within EventServiceProvider");

  return service;
}
