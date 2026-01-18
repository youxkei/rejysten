import { createStore, produce } from "solid-js/store";

import { createContextProvider } from "@/solid/context";

type ActionsToActionsCreator<T extends object> = {
  [K in keyof T]: (context: ActionsContext) => T[K];
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface PanesActionsContext {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface ComponentnsActionsContext {}

export interface ActionsContext {
  panes: PanesActionsContext;
  components: ComponentnsActionsContext;
}

export const initialActionsContext = {
  panes: {},
  components: {},
} as ActionsContext;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface PanesActions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface ComponentnsActions {}

export interface ActionsCreator {
  panes: ActionsToActionsCreator<PanesActions>;
  components: ActionsToActionsCreator<ComponentnsActions>;
}

export const actionsCreator = {
  panes: {},
  components: {},
} as ActionsCreator;

export interface Actions {
  panes: PanesActions;
  components: ComponentnsActions;
}

function createActions(context: ActionsContext): Actions {
  return {
    panes: Object.fromEntries(
      Object.entries(actionsCreator.panes).map(([key, creator]) => [key, creator(context)]),
    ) as unknown as PanesActions,

    // components: Object.fromEntries(
    //   Object.entries(actionsCreator.components).map(([key, creator]) => [key, creator(context)]),
    // ) as unknown as ComponentnsActions,
    components: {},
  };
}

export const [ActionsServiceProvider, useActionsService] = createContextProvider("ActionsService", () => {
  const [context, setContext] = createStore<ActionsContext>({ ...initialActionsContext });
  function updateContext(updater: (ctx: ActionsContext) => void): void {
    setContext(produce(updater));
  }

  const actions = createActions(context);

  return {
    context,
    updateContext,

    ...actions,
  };
});
