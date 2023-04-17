import type { JSXElement } from "solid-js";

import { Suspense } from "solid-js";

import { RxDBServiceProvider } from "@/services/rxdb";
import { createDatabaseCreatorForTest } from "@/services/rxdb/test";

export function TestWithRxDBService(props: { tid: string; children: JSXElement }) {
  return (
    <Suspense fallback={props.tid}>
      <RxDBServiceProvider databaseCreator={createDatabaseCreatorForTest(props.tid)}>
        {props.children}
      </RxDBServiceProvider>
    </Suspense>
  );
}

export { createCollectionsForTest } from "@/services/rxdb/test";
