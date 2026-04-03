import { limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { onMount } from "solid-js";
import { uuidv7 } from "uuidv7";

import { DateNow } from "@/date";
import { fetchOGPTitle } from "@/ogp";
import "@/panes/lifeLogs/schema";
import {
  type FirestoreService,
  getCollection,
  getDocs,
  useFirestoreService,
  waitForServerSync,
} from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import { addNextSibling, addSingle, getLastChildNode } from "@/services/firebase/firestore/treeNode";
import { noneTimestamp } from "@/timestamp";

export async function handleShareTarget(firestore: FirestoreService): Promise<void> {
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

  if (!url) return;

  await waitForServerSync(firestore);

  const readingDomains = ["ncode.syosetu.com", "syosetu.org", "kakuyomu.jp", "manga.nicovideo.jp", "shonenjumpplus.com"];
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

  // Find all running lifeLogs
  const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
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
    );
    const existingNode = existingNodes.find((node) => node.text.includes(`](${url})`));
    if (existingNode) {
      firestore.services.store.updateState((state) => {
        state.panesLifeLogs.selectedLifeLogId = matchingLog.id;
        state.panesLifeLogs.selectedLifeLogNodeId = existingNode.id;
      });
      history.replaceState(null, "", "/");
      return;
    }

    lifeLogId = matchingLog.id;

    if (matchingLog.hasTreeNodes) {
      // Has tree nodes - add as next sibling of last child
      const lastChild = await getLastChildNode(firestore, treeNodesCol, matchingLog);
      if (lastChild) {
        nodeId = uuidv7();
        await runBatch(firestore, async (batch) => {
          if (otherLog) {
            batch.update(lifeLogsCol, { id: otherLog.id, endAt: now });
          }
          await addNextSibling(firestore, batch, treeNodesCol, lastChild, {
            id: nodeId,
            text: markdownLink,
            lifeLogId: matchingLog.id,
          });
        });
      }
    } else {
      // No tree nodes - add single and update hasTreeNodes
      nodeId = uuidv7();
      await runBatch(firestore, (batch) => {
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
        return Promise.resolve();
      });
    }
  } else {
    // No matching log - create new lifeLog + tree node
    const newLogId = uuidv7();
    lifeLogId = newLogId;
    nodeId = uuidv7();

    // Determine startAt: if otherLog exists, use now (same as its endAt).
    // Otherwise, check if any lifeLog is running — if so use now, else use most recent endAt.
    let startAt: Timestamp;
    if (otherLog) {
      startAt = now;
    } else if (runningLogs.length > 0) {
      startAt = now;
    } else {
      const latestQuery = query(lifeLogsCol, orderBy("endAt", "desc"), orderBy("startAt", "desc"), limit(1));
      const latestLogs = await getDocs(firestore, latestQuery);
      startAt = latestLogs.length > 0 ? latestLogs[0].endAt : now;
    }

    await runBatch(firestore, (batch) => {
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
      return Promise.resolve();
    });
  }

  firestore.services.store.updateState((state) => {
    state.panesLifeLogs.selectedLifeLogId = lifeLogId;
    state.panesLifeLogs.selectedLifeLogNodeId = nodeId;
  });

  history.replaceState(null, "", "/");
}

export function ShareHandler() {
  const firestore = useFirestoreService();
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("title") || params.has("url") || params.has("text")) {
      void handleShareTarget(firestore);
    }
  });
  return null;
}
