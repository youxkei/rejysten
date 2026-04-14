import { Show, type JSXElement } from "solid-js";

import { EditHistoryPanel } from "@/components/editHistory/editHistoryPanel";
import "@/panes/search/store";
import { useActionsService } from "@/services/actions";
import { useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { styles } from "@/styles.css";

export function WithEditHistoryPanel(props: { children: JSXElement }) {
  const { state } = useStoreService();
  const {
    components: { editHistory: editHistoryActions },
  } = useActionsService();

  addKeyDownEventListener((event) => {
    if (event.isComposing || event.ctrlKey) return;
    if (state.panesSearch.isActive) return;
    if (document.activeElement instanceof HTMLInputElement) return;
    if (document.activeElement instanceof HTMLTextAreaElement) return;

    switch (event.code) {
      case "KeyU":
        event.preventDefault();
        editHistoryActions.undo();
        break;
      case "KeyR":
        event.preventDefault();
        if (event.shiftKey) {
          editHistoryActions.redoAlternate();
        } else {
          editHistoryActions.redo();
        }
        break;
      case "KeyT":
        event.preventDefault();
        editHistoryActions.togglePanel();
        break;
    }
  });

  return (
    <div class={styles.editHistory.layoutWrapper}>
      <div class={styles.editHistory.mainContent}>{props.children}</div>
      <Show when={state.editHistory.isPanelOpen}>
        <EditHistoryPanel />
      </Show>
    </div>
  );
}
