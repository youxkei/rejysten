import { doc, query, where } from "firebase/firestore";
import { Show } from "solid-js";

import { useFirebaseService } from "@/services/firebase";
import { getCollection } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";

export function LifeLogTree(props: { id: string; prevId: string; nextId: string }) {
  const firebase = useFirebaseService();

  const lifeLogsCol = getCollection(firebase, "lifeLogs");
  const lifeLog = createSubscribeSignal(() => doc(lifeLogsCol, props.id));

  return (
    <Show when={lifeLog()}>
      {(lifeLog) => {
        return (
          <div>
            <p>{lifeLog().text}</p>
            <ChildrenNodes parentId={props.id} />
          </div>
        );
      }}
    </Show>
  );
}

export function ChildrenNodes(props: { parentId: string }) {
  const firebase = useFirebaseService();

  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const childrenNodes = createSubscribeAllSignal(() =>
    query(lifeLogTreeNodesCol, where("parentId", "==", props.parentId)),
  );

  return (
    <ul>
      {childrenNodes().map((childNode) => (
        <li>
          <Node id={childNode.id} />
        </li>
      ))}
    </ul>
  );
}

export function Node(props: { id: string }) {
  const firebase = useFirebaseService();

  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const node = createSubscribeSignal(() => doc(lifeLogTreeNodesCol, props.id));

  return (
    <Show when={node()}>
      {(node) => {
        return (
          <div>
            <span>{node().text}</span>
            <ChildrenNodes parentId={props.id} />
          </div>
        );
      }}
    </Show>
  );
}
