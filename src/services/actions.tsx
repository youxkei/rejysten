import { createStore, produce } from "solid-js/store";

import { createContextProvider } from "@/solid/context";
import { wrapAction } from "@/telemetry/span";

type ActionsToActionsCreator<T extends object> = {
  [K in keyof T]: (context: ActionsContext, actions: Actions) => T[K];
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface PanesActionsContext {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface ComponentsActionsContext {}

export interface ActionsContext {
  panes: PanesActionsContext;
  components: ComponentsActionsContext;
}

export const initialActionsContext = {
  panes: {},
  components: {},
} as ActionsContext;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface PanesActions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intended for module augmentation
export interface ComponentsActions {}

export interface ActionsCreator {
  panes: ActionsToActionsCreator<PanesActions>;
  components: ActionsToActionsCreator<ComponentsActions>;
}

export const actionsCreator = {
  panes: {},
  components: {},
} as ActionsCreator;

export interface Actions {
  panes: PanesActions;
  components: ComponentsActions;
}

// Wraps every action of an area with a telemetry root span named after the
// registry keys (e.g. "panes.lifeLogs.saveText"), which are minification-safe.
function wrapAreaActions<T extends object>(prefix: string, areaActions: T): T {
  return Object.fromEntries(
    Object.entries(areaActions).map(([key, fn]) => [
      key,
      wrapAction(`${prefix}.${key}`, fn as (...args: unknown[]) => unknown),
    ]),
  ) as T;
}

function createActions(context: ActionsContext): Actions {
  const actions: Actions = {
    panes: {} as PanesActions,
    components: {} as ComponentsActions,
  };

  // Populate actions - creators can reference other actions via the actions parameter
  Object.assign(
    actions.panes,
    Object.fromEntries(
      Object.entries(actionsCreator.panes).map(([key, creator]) => [
        key,
        wrapAreaActions(`panes.${key}`, creator(context, actions)),
      ]),
    ),
  );

  Object.assign(
    actions.components,
    Object.fromEntries(
      Object.entries(actionsCreator.components).map(([key, creator]) => [
        key,
        wrapAreaActions(`components.${key}`, creator(context, actions)),
      ]),
    ),
  );

  return actions;
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
