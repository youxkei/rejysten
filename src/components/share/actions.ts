import { awaitable } from "@/awaitableCallback";
import { handleShare, type ShareResult } from "@/components/share/share";
import "@/components/share/store";
import { type Actions, actionsCreator } from "@/services/actions";
import { useFirestoreService } from "@/services/firebase/firestore";
import { useStoreService } from "@/services/store";
import { showToast } from "@/services/toast";
import { getCurrentActionSpan, SpanStatusCode } from "@/telemetry/span";

declare module "@/services/actions" {
  interface ComponentsActions {
    share: {
      runShare: () => void;
      confirmShare: () => void;
      cancelShare: () => void;
    };
  }
}

function cleanShareParams() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("title");
  cleanUrl.searchParams.delete("text");
  cleanUrl.searchParams.delete("url");
  history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);
}

actionsCreator.components.share = (_context, _actions: Actions) => {
  const firestore = useFirestoreService();
  const { state, updateState } = useStoreService();

  function finishShare(result: ShareResult | null) {
    updateState((s) => {
      s.share.isActive = false;
      s.share.confirmation = undefined;
      if (result) {
        s.panesLifeLogs.selectedLifeLogId = result.lifeLogId;
        s.panesLifeLogs.selectedLifeLogNodeId = result.nodeId;
      }
    });

    if (result) {
      const message =
        result.status === "added"
          ? "共有から追加しました"
          : result.status === "updated"
            ? "Kindleの進捗を更新しました"
            : "共有されたURLは追加済みです";
      showToast(updateState, message, "success");
    }

    cleanShareParams();
  }

  function failShare(e: unknown) {
    console.error("Share error:", e);

    // The error is handled here instead of escaping to the action wrapper, so
    // record it on the action span explicitly to keep it visible in Honeycomb.
    const actionSpan = getCurrentActionSpan();
    actionSpan?.recordException(e instanceof Error ? e : String(e));
    actionSpan?.setStatus({ code: SpanStatusCode.ERROR });

    updateState((s) => {
      s.share.isActive = false;
      s.share.confirmation = undefined;
    });

    const message = e instanceof Error ? e.message : String(e);
    showToast(updateState, `共有からの追加に失敗しました: ${message}`, "error");
    cleanShareParams();
  }

  async function runShare() {
    // The whole store persists to localStorage, so a tab killed mid-confirmation
    // can restore stale confirmation/isConfirming; every share session starts clean.
    updateState((s) => {
      s.share.confirmation = undefined;
      s.share.isConfirming = false;
    });

    try {
      const result = await handleShare(firestore);
      if (result?.status === "needsConfirmation") {
        updateState((s) => {
          s.share.confirmation = {
            url: result.url,
            markdownLink: result.markdownLink,
            existingNodeId: result.existingNodeId,
            existingNodeText: result.existingNodeText,
          };
        });
        return;
      }
      finishShare(result);
    } catch (e) {
      failShare(e);
    }
  }

  async function confirmShare() {
    // awaitable serializes bodies but still queues repeat invocations; once the
    // first confirmation finishes, isActive is false and queued ones bail out.
    if (!state.share.isActive || state.share.isConfirming) return;

    updateState((s) => {
      s.share.isConfirming = true;
    });
    try {
      const result = await handleShare(firestore, { skipPastDuplicateConfirmation: true });
      if (result?.status === "needsConfirmation") {
        throw new Error("共有済み確認を完了できませんでした");
      }
      finishShare(result);
    } catch (e) {
      failShare(e);
    } finally {
      updateState((s) => {
        s.share.isConfirming = false;
      });
    }
  }

  function cancelShare(): Promise<void> {
    updateState((s) => {
      s.share.isActive = false;
      s.share.confirmation = undefined;
    });
    cleanShareParams();
    return Promise.resolve();
  }

  return {
    runShare: awaitable(runShare),
    confirmShare: awaitable(confirmShare),
    cancelShare: awaitable(cancelShare),
  };
};
