import type { JSXElement } from "solid-js";

import { createContext, createSignal, useContext } from "solid-js";

export type InitialEvent = { page: "initial" };

export type ActionLogListPageEvent = { page: "actionLogList"; type: "add" | "enter" };

export type ActionLogPageEvent = { page: "actionLog"; type: "indent" | "dedent" | "addPrev" | "addNext" | "moveAbove" | "moveBelow" };

export type Event = InitialEvent | ActionLogListPageEvent | ActionLogPageEvent;

export type EventService = {
  currentEvent$: () => Event;
  emitEvent: (event: Event) => void;
};

const context = createContext<EventService>();

export function EventServiceProvider(props: { children: JSXElement }) {
  const [currentEvent$, emitEvent] = createSignal<Event>({ page: "initial" });

  return <context.Provider value={{ currentEvent$, emitEvent }}>{props.children}</context.Provider>;
}

export function useEventService() {
  const service = useContext(context);
  if (!service) throw new Error("useEventService must be used within EventServiceProvider");

  return service;
}
