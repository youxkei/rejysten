import { orderBy, query, type Timestamp, where } from "firebase/firestore";

import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal } from "@/services/firebase/firestore/subscribe";

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    lifeLogs: {
      text: string;

      startAt: Timestamp;
      endAt: Timestamp;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };
  }
}

export function LifeLogs(props: { from: Date }) {
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  const lifeLogs$ = createSubscribeAllSignal(firestore, () =>
    query(lifeLogsCol, where("endAt", ">=", props.from), orderBy("startAt", "asc")),
  );

  console.log(lifeLogs$);

  return;
}
