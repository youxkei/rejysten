import { useActionsService } from "@/services/actions";
import { withOwner } from "@/solid/owner";
import { styles } from "@/styles.css";

export function SearchMobileToolbar() {
  const {
    panes: { search: actions },
  } = useActionsService();

  const handleGoToFirst = withOwner(() => {
    actions.goToFirst();
  });
  const handleGoToLast = withOwner(() => {
    actions.goToLast();
  });
  const handleCloseSearch = withOwner(() => {
    actions.closeSearch();
  });
  const handleJumpToSelected = withOwner(() => {
    actions.jumpToSelected();
  });

  return (
    <div class={styles.mobileToolbar.container}>
      <div class={styles.mobileToolbar.buttonGroup}>
        <button class={styles.mobileToolbar.button} onClick={handleGoToFirst}>
          ⏫
        </button>
        <button class={styles.mobileToolbar.button} onClick={handleGoToLast}>
          ⏬
        </button>
        <button class={styles.mobileToolbar.button} onClick={handleCloseSearch}>
          ↩️
        </button>
        <button class={styles.mobileToolbar.button} onClick={handleJumpToSelected}>
          ✅
        </button>
      </div>
    </div>
  );
}
