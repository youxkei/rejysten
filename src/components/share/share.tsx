import { limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { onMount } from "solid-js";
import { uuidv7 } from "uuidv7";

import { DateNow } from "@/date";
import { fetchOGPTitle } from "@/ogp";
import "@/panes/lifeLogs/schema";
import "@/components/share/store";
import { type FirestoreService, getCollection, getDocs, useFirestoreService } from "@/services/firebase/firestore";
import { runTransaction } from "@/services/firebase/firestore/batch";
import { addNextSibling, addSingle, getLastChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { showToast } from "@/services/toast";
import { styles } from "@/styles.css";
import { noneTimestamp } from "@/timestamp";

export async function handleShare(
  firestore: FirestoreService,
): Promise<{ lifeLogId: string; nodeId: string; added: boolean } | null> {
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

  const readingDomains = [
    "ncode.syosetu.com",
    "syosetu.org",
    "kakuyomu.jp",
    "manga.nicovideo.jp",
    "shonenjumpplus.com",
    "takecomic.jp",
  ];
  const hostname = new URL(url).hostname;
  const category = readingDomains.some((d) => hostname === d || hostname.endsWith("." + d))
    ? "読書"
    : "ネットサーフィン";
  const otherCategory = category === "読書" ? "ネットサーフィン" : "読書";

  // Determine title: prefer title param, then OGP title, then URL
  let linkTitle = title;
  if (!linkTitle) {
    try {
      linkTitle = await fetchOGPTitle(url);
    } catch {
      // fall through
    }
  }
  if (!linkTitle) {
    linkTitle = url;
  }
  const markdownLink = `[${linkTitle}](${url})`;

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
      return { lifeLogId: matchingLog.id, nodeId: existingNode.id, added: false };
    }

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

  return { lifeLogId, nodeId, added: true };
}

export function Share() {
  const firestore = useFirestoreService();
  const { updateState } = useStoreService();

  onMount(() => {
    void (async () => {
      try {
        const result = await handleShare(firestore);

        updateState((state) => {
          state.share.isActive = false;
          if (result) {
            state.panesLifeLogs.selectedLifeLogId = result.lifeLogId;
            state.panesLifeLogs.selectedLifeLogNodeId = result.nodeId;
          }
        });

        if (result) {
          showToast(updateState, result.added ? "共有から追加しました" : "共有されたURLは追加済みです", "success");
        }
      } catch (e) {
        console.error("Share error:", e);

        updateState((state) => {
          state.share.isActive = false;
        });

        const message = e instanceof Error ? e.message : String(e);
        showToast(updateState, `共有からの追加に失敗しました: ${message}`, "error");
      } finally {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("title");
        cleanUrl.searchParams.delete("text");
        cleanUrl.searchParams.delete("url");
        history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);
      }
    })();
  });

  return (
    <div class={styles.share.wrapper}>
      <div class={styles.share.spinner} />
      <p class={styles.share.text}>共有されたURLを追加中...</p>
    </div>
  );
}
