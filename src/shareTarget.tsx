import { query, where } from "firebase/firestore";
import { onMount } from "solid-js";
import { uuidv7 } from "uuidv7";

import { TimestampNow } from "@/date";
import { type FirestoreService, getCollection, getDocs, useFirestoreService } from "@/services/firebase/firestore";
import "@/panes/lifeLogs/schema";
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

  // Determine title: prefer title param, otherwise use URL
  const linkTitle = title || url;
  const markdownLink = `[${linkTitle}](${url})`;

  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

  // Find running "ネットサーフィン" lifeLog
  const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
  const netSurfingLog = runningLogs.find((log) => log.text === "ネットサーフィン");

  let lifeLogId: string;
  let nodeId: string;

  if (netSurfingLog) {
    lifeLogId = netSurfingLog.id;

    if (netSurfingLog.hasTreeNodes) {
      // Has tree nodes - add as next sibling of last child
      const lastChild = await getLastChildNode(firestore, treeNodesCol, netSurfingLog);
      if (lastChild) {
        nodeId = uuidv7();
        await runBatch(firestore, async (batch) => {
          await addNextSibling(firestore, batch, treeNodesCol, lastChild, {
            id: nodeId,
            text: markdownLink,
            lifeLogId: netSurfingLog.id,
          });
        });
      }
    } else {
      // No tree nodes - add single and update hasTreeNodes
      nodeId = uuidv7();
      await runBatch(firestore, (batch) => {
        addSingle(firestore, batch, treeNodesCol, netSurfingLog.id, {
          id: nodeId,
          text: markdownLink,
          lifeLogId: netSurfingLog.id,
        });
        batch.update(lifeLogsCol, {
          id: netSurfingLog.id,
          hasTreeNodes: true,
        });
        return Promise.resolve();
      });
    }
  } else {
    // No running ネットサーフィン - create new lifeLog + tree node
    const newLogId = uuidv7();
    lifeLogId = newLogId;
    nodeId = uuidv7();

    await runBatch(firestore, (batch) => {
      batch.set(lifeLogsCol, {
        id: newLogId,
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: TimestampNow(),
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
