import { Timestamp } from "firebase/firestore";
import { createSignal, onMount, Show } from "solid-js";
import { uuidv7 } from "uuidv7";

import { DateNow } from "@/date";
import { analyzeTextForNgrams } from "@/ngram";
import { fetchOGPMeta, resolveUrl } from "@/ogp";
import "@/panes/lifeLogs/schema";
import "@/components/share/store";
import { type FirestoreService, getCollection, getDocs, useFirestoreService } from "@/services/firebase/firestore";
import { runTransaction } from "@/services/firebase/firestore/batch";
import { encodeNgramKeyForFirestore } from "@/services/firebase/firestore/ngram";
import { limit, orderBy, query, where } from "@/services/firebase/firestore/query";
import { addNextSibling, addSingle, getLastChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { showToast } from "@/services/toast";
import { styles } from "@/styles.css";
import { noneTimestamp } from "@/timestamp";

function extractAsin(url: string | null): string | null {
  return url?.match(/(?:\/|[?&](?:asin|ASIN)=)([A-Z0-9]{10})(?:[/?&#]|$)/)?.[1] ?? null;
}

function normalizeAmazonJpUrl(url: string): string {
  const hostname = new URL(url).hostname;
  if (hostname !== "amazon.co.jp" && !hostname.endsWith(".amazon.co.jp")) return url;

  const asin = extractAsin(url);
  return asin ? `https://www.amazon.co.jp/dp/${asin}` : url;
}

async function toAmazonJpLink(url: string, title: string, author: string): Promise<string> {
  let asin = extractAsin(url);

  const hostname = new URL(url).hostname;
  if (!asin && (hostname === "a.co" || hostname === "amzn.to")) {
    asin = extractAsin(await resolveUrl(url));
  }

  if (asin) return `https://www.amazon.co.jp/dp/${asin}`;

  const query = encodeURIComponent(`${title} ${author}`);
  return `https://www.amazon.co.jp/s?k=${query}`;
}

async function parseKindleShare(text: string | null, url: string): Promise<{ title: string; url: string } | null> {
  if (!text) return null;

  const progress = text.match(/この本を([0-9０-９]+(?:\.[0-9０-９]+)?)%読みました。/)?.[1];
  const finished = /この本を読み終えたところです。/.test(text);
  const book = text.match(/[-－]\s*["“]([^"”]+)["”]\s*[（(]([^（）()]+?)\s+著[）)]/);
  if ((!progress && !finished) || !book) return null;

  const [, bookTitle, author] = book;
  const progressText = progress !== undefined ? `${progress}%` : "読了";
  return {
    title: `${bookTitle} / ${author} / ${progressText}`,
    url: await toAmazonJpLink(url, bookTitle, author),
  };
}

type ShareResult = {
  lifeLogId: string;
  nodeId: string;
  status: "added" | "updated" | "duplicate";
};

type ShareConfirmationResult = {
  status: "needsConfirmation";
  url: string;
  markdownLink: string;
  existingNodeId: string;
  existingNodeText: string;
};

type HandleShareResult = ShareResult | ShareConfirmationResult;

type HandleShareOptions = {
  skipPastDuplicateConfirmation?: boolean;
};

function isShareConfirmationResult(result: HandleShareResult | null): result is ShareConfirmationResult {
  return result?.status === "needsConfirmation";
}

function cleanShareParams() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("title");
  cleanUrl.searchParams.delete("text");
  cleanUrl.searchParams.delete("url");
  history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);
}

// 過去共有検索に使う URL ngram の上限。先頭から取るのは domain 部分を必ず含めるため。
// 多いほど積集合の選択性が上がるが、超長 URL での filter 爆発を防ぐために
// Firestore のクエリ filter 数への安全マージンとして 200 で打ち切る。
const maxUrlNgrams = 200;

async function findPastSharedNode(
  firestore: FirestoreService,
  url: string,
  options?: { fromServer?: boolean },
): Promise<{ id: string; text: string } | undefined> {
  const { ngramMap } = analyzeTextForNgrams(url);
  const urlNgrams = Object.keys(ngramMap).slice(0, maxUrlNgrams);
  if (urlNgrams.length === 0) return undefined;

  const ngramsCol = getCollection(firestore, "ngrams");
  const ngramDocuments = await getDocs(
    firestore,
    query(ngramsCol, ...urlNgrams.map((ngram) => where(`ngramMap.${encodeNgramKeyForFirestore(ngram)}`, "==", true))),
    options,
  );

  const treeNodesCollectionId = "lifeLogTreeNodes";
  const matchingNgram = ngramDocuments.find(
    (ngram) => ngram.collection === treeNodesCollectionId && ngram.text.includes(`](${url})`),
  );
  if (!matchingNgram) return undefined;

  return {
    id: matchingNgram.id.endsWith(treeNodesCollectionId)
      ? matchingNgram.id.slice(0, -treeNodesCollectionId.length)
      : matchingNgram.id,
    text: matchingNgram.text,
  };
}

export async function handleShare(
  firestore: FirestoreService,
  options: HandleShareOptions = {},
): Promise<HandleShareResult | null> {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title");
  const text = params.get("text");
  const urlParam = params.get("url");

  // Determine URL: prefer url param, otherwise extract from text
  let url = urlParam;
  if (!url && text) {
    const match = text.match(/https?:\/\/\S+/);
    if (match) {
      url = match[0];
    }
  }

  if (!url) return null;

  const kindleShare = await parseKindleShare(text, url);
  if (kindleShare) {
    url = kindleShare.url;
  } else {
    url = normalizeAmazonJpUrl(url);
  }

  const readingDomains = [
    "ncode.syosetu.com",
    "syosetu.org",
    "kakuyomu.jp",
    "manga.nicovideo.jp",
    "shonenjumpplus.com",
    "takecomic.jp",
  ];
  const hostname = new URL(url).hostname;
  const isReadingShare =
    Boolean(kindleShare) || readingDomains.some((d) => hostname === d || hostname.endsWith("." + d));
  const category = isReadingShare ? "読書" : "ネットサーフィン";
  const otherCategory = category === "読書" ? "ネットサーフィン" : "読書";
  const isX = hostname === "x.com" || hostname.endsWith(".x.com");

  // Determine title: prefer title param, then OGP title, then URL
  let linkTitle = kindleShare?.title ?? title;
  if (!linkTitle) {
    try {
      const meta = await fetchOGPMeta(url);
      if (meta.title) {
        linkTitle = isX && meta.description ? `${meta.title}: ${meta.description}` : meta.title;
      }
    } catch {
      // fall through
    }
  }
  if (!linkTitle) {
    linkTitle = url;
  }
  const markdownLink = `[${linkTitle.replaceAll("[", "［").replaceAll("]", "］")}](${url})`;

  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

  // Fetch fresh data from server
  const fromServer = { fromServer: true } as const;

  // Find all running lifeLogs
  const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), fromServer);
  const matchingLog = runningLogs.find((log) => log.text === category);
  const otherLog = runningLogs.find((log) => log.text === otherCategory);

  const now = Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000);

  let lifeLogId: string;
  let nodeId: string;

  if (matchingLog) {
    // Check if URL already exists in this lifeLog's nodes
    const existingNodes = await getDocs(
      firestore,
      query(treeNodesCol, where("lifeLogId", "==", matchingLog.id)),
      fromServer,
    );
    const existingNode = existingNodes.find((node) => node.text.includes(`](${url})`));
    if (existingNode) {
      if (kindleShare && existingNode.text !== markdownLink) {
        await runTransaction(
          firestore,
          (batch) => {
            batch.update(treeNodesCol, {
              id: existingNode.id,
              text: markdownLink,
            });
          },
          {
            description: "Kindle進捗更新",
            prevSelection: {},
            nextSelection: { lifeLogs: matchingLog.id, lifeLogTreeNodes: existingNode.id },
          },
        );
        return { lifeLogId: matchingLog.id, nodeId: existingNode.id, status: "updated" };
      }
      return { lifeLogId: matchingLog.id, nodeId: existingNode.id, status: "duplicate" };
    }
  }

  if (!options.skipPastDuplicateConfirmation) {
    const pastSharedNode = await findPastSharedNode(firestore, url, fromServer);
    if (pastSharedNode) {
      return {
        status: "needsConfirmation",
        url,
        markdownLink,
        existingNodeId: pastSharedNode.id,
        existingNodeText: pastSharedNode.text,
      };
    }
  }

  if (matchingLog) {
    lifeLogId = matchingLog.id;

    if (matchingLog.hasTreeNodes) {
      const lastChild = await getLastChildNode(firestore, treeNodesCol, matchingLog, fromServer);
      if (lastChild) {
        nodeId = uuidv7();
        await runTransaction(
          firestore,
          async (batch) => {
            if (otherLog) {
              batch.update(lifeLogsCol, { id: otherLog.id, endAt: now });
            }
            await addNextSibling(
              firestore,
              batch,
              treeNodesCol,
              lastChild,
              {
                id: nodeId,
                text: markdownLink,
                lifeLogId: matchingLog.id,
              },
              fromServer,
            );
          },
          {
            description: "共有からノード追加",
            prevSelection: {},
            nextSelection: { lifeLogs: matchingLog.id, lifeLogTreeNodes: nodeId },
          },
        );
      } else {
        // Shouldn't happen, but handle gracefully
        nodeId = uuidv7();
        await runTransaction(
          firestore,
          (batch) => {
            if (otherLog) {
              batch.update(lifeLogsCol, { id: otherLog.id, endAt: now });
            }
            addSingle(firestore, batch, treeNodesCol, matchingLog.id, {
              id: nodeId,
              text: markdownLink,
              lifeLogId: matchingLog.id,
            });
          },
          {
            description: "共有からノード追加",
            prevSelection: {},
            nextSelection: { lifeLogs: matchingLog.id, lifeLogTreeNodes: nodeId },
          },
        );
      }
    } else {
      nodeId = uuidv7();
      await runTransaction(
        firestore,
        (batch) => {
          if (otherLog) {
            batch.update(lifeLogsCol, { id: otherLog.id, endAt: now });
          }
          addSingle(firestore, batch, treeNodesCol, matchingLog.id, {
            id: nodeId,
            text: markdownLink,
            lifeLogId: matchingLog.id,
          });
          batch.update(lifeLogsCol, {
            id: matchingLog.id,
            hasTreeNodes: true,
          });
        },
        {
          description: "共有からノード追加",
          prevSelection: {},
          nextSelection: { lifeLogs: matchingLog.id, lifeLogTreeNodes: nodeId },
        },
      );
    }
  } else {
    const newLogId = uuidv7();
    lifeLogId = newLogId;
    nodeId = uuidv7();

    let startAt: Timestamp;
    if (otherLog) {
      startAt = now;
    } else if (runningLogs.length > 0) {
      startAt = now;
    } else {
      const latestQuery = query(lifeLogsCol, orderBy("endAt", "desc"), orderBy("startAt", "desc"), limit(1));
      const latestLogs = await getDocs(firestore, latestQuery, fromServer);
      startAt = latestLogs.length > 0 ? latestLogs[0].endAt : now;
    }

    await runTransaction(
      firestore,
      (batch) => {
        if (otherLog) {
          batch.update(lifeLogsCol, { id: otherLog.id, endAt: now });
        }
        batch.set(lifeLogsCol, {
          id: newLogId,
          text: category,
          hasTreeNodes: true,
          startAt,
          endAt: noneTimestamp,
        });
        addSingle(firestore, batch, treeNodesCol, newLogId, {
          id: nodeId,
          text: markdownLink,
          lifeLogId: newLogId,
        });
      },
      {
        description: "共有からノード追加",
        prevSelection: {},
        nextSelection: { lifeLogs: newLogId, lifeLogTreeNodes: nodeId },
      },
    );
  }

  return { lifeLogId, nodeId, status: "added" };
}

export function Share() {
  const firestore = useFirestoreService();
  const { updateState } = useStoreService();
  const [confirmation$, setConfirmation] = createSignal<ShareConfirmationResult>();
  const [isConfirming$, setIsConfirming] = createSignal(false);

  function finishShare(result: ShareResult | null) {
    updateState((state) => {
      state.share.isActive = false;
      if (result) {
        state.panesLifeLogs.selectedLifeLogId = result.lifeLogId;
        state.panesLifeLogs.selectedLifeLogNodeId = result.nodeId;
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

    updateState((state) => {
      state.share.isActive = false;
    });

    const message = e instanceof Error ? e.message : String(e);
    showToast(updateState, `共有からの追加に失敗しました: ${message}`, "error");
    cleanShareParams();
  }

  function cancelShare() {
    updateState((state) => {
      state.share.isActive = false;
    });
    cleanShareParams();
  }

  async function addConfirmedShare() {
    if (isConfirming$()) return;

    setIsConfirming(true);
    try {
      const result = await handleShare(firestore, { skipPastDuplicateConfirmation: true });
      if (isShareConfirmationResult(result)) {
        throw new Error("共有済み確認を完了できませんでした");
      }
      finishShare(result);
    } catch (e) {
      failShare(e);
    } finally {
      setIsConfirming(false);
    }
  }

  onMount(() => {
    void (async () => {
      try {
        const result = await handleShare(firestore);
        if (isShareConfirmationResult(result)) {
          setConfirmation(result);
          return;
        }
        finishShare(result);
      } catch (e) {
        failShare(e);
      }
    })();
  });

  return (
    <Show
      when={confirmation$()}
      fallback={
        <div class={styles.share.wrapper}>
          <div class={styles.share.spinner} />
          <p class={styles.share.text}>共有されたURLを追加中...</p>
        </div>
      }
    >
      {(confirmation) => (
        <div class={styles.share.dialogBackdrop} role="presentation">
          <div
            class={styles.share.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="共有済みURLの確認"
            onKeyDown={(event) => {
              if (event.code !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              cancelShare();
            }}
          >
            <p class={styles.share.dialogTitle}>このURLは以前共有されています</p>
            <p class={styles.share.dialogText}>追加しますか？</p>
            <p class={styles.share.dialogPreview}>{confirmation().markdownLink}</p>
            <p class={styles.share.dialogExisting}>{confirmation().existingNodeText}</p>
            <div class={styles.share.dialogActions}>
              <button
                ref={(el) => {
                  requestAnimationFrame(() => {
                    el.focus();
                  });
                }}
                class={styles.share.dialogButton}
                type="button"
                onClick={cancelShare}
              >
                キャンセル
              </button>
              <button
                class={styles.share.dialogButton}
                type="button"
                disabled={isConfirming$()}
                onClick={() => {
                  void addConfirmedShare();
                }}
              >
                {isConfirming$() ? "追加中..." : "追加する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
