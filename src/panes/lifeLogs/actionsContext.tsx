import { createContext, useContext, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

export interface LifeLogActions {
  // Navigation (j/k/g/G)
  navigateNext: () => void;
  navigatePrev: () => void;
  goToFirst: () => void;
  goToLast: () => void;
  // Tree mode (l/h)
  enterTree: () => void;
  exitTree: () => void;
  // Actions (o/s/f)
  newLifeLog: () => void;
  setStartAtNow: () => void;
  setEndAtNow: () => void;
  // Editing (i)
  startEditing: () => void;
  // Tab navigation
  cycleFieldNext: () => void;
  cycleFieldPrev: () => void;
}

export interface LifeLogState {
  isEditing: boolean;
  isLifeLogSelected: boolean;
  isLifeLogTreeFocused: boolean;
  hasSelection: boolean;
}

interface ActionsContextValue {
  actions: LifeLogActions | undefined;
  state: LifeLogState;
  setActions: (actions: LifeLogActions | undefined) => void;
  setState: (state: Partial<LifeLogState>) => void;
}

const defaultState: LifeLogState = {
  isEditing: false,
  isLifeLogSelected: false,
  isLifeLogTreeFocused: false,
  hasSelection: false,
};

const ActionsContext = createContext<ActionsContextValue>();

export function ActionsProvider(props: ParentProps) {
  const [store, setStore] = createStore<{
    actions: LifeLogActions | undefined;
    state: LifeLogState;
  }>({
    actions: undefined,
    state: defaultState,
  });

  const value: ActionsContextValue = {
    get actions() {
      return store.actions;
    },
    get state() {
      return store.state;
    },
    setActions: (actions) => {
      setStore("actions", actions);
    },
    setState: (state) => {
      setStore("state", (prev) => ({ ...prev, ...state }));
    },
  };

  return <ActionsContext.Provider value={value}>{props.children}</ActionsContext.Provider>;
}

export function useActionsContext(): ActionsContextValue {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error("useActionsContext must be used within ActionsProvider");
  }
  return context;
}
