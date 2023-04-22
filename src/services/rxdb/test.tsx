import type { RxDBService } from ".";
import type { Collections } from "@/services/rxdb/collections";
import type { JSXElement } from "solid-js";
import type { TestContext } from "vitest";

import { render } from "@solidjs/testing-library";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { createRxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { createEffect } from "solid-js";

import { createSubscribeSignal } from "./subscribe";
import { RxDBServiceProvider, useRxDBService } from "@/services/rxdb";
import { schema } from "@/services/rxdb/collections";
import { renderAsync } from "@/test";

type Wait = { promise: Promise<Wait> };

export function createDatabaseCreatorForTest(tid: string) {
  return {
    name: tid,
    storage: getRxStorageDexie({ indexedDB, IDBKeyRange }),
    ignoreDuplicate: true,
  };
}

export async function createCollectionsForTest(tid: string) {
  const database = await createRxDatabase<Collections>(createDatabaseCreatorForTest(tid));

  return database.addCollections(schema) as Promise<Collections>;
}

export function RxDBServiceProviderForTest(props: { tid: string; children: JSXElement }) {
  return <RxDBServiceProvider databaseCreator={createDatabaseCreatorForTest(props.tid)}>{props.children}</RxDBServiceProvider>;
}

export function renderWithRxDBServiceForTest(tid: string, Component: (props: { children: JSXElement }) => JSXElement) {
  return renderAsync(
    (props) => (
      <RxDBServiceProviderForTest tid={tid}>
        <Component>{props.children}</Component>
      </RxDBServiceProviderForTest>
    ),
    (resolve: (value: { collections: Collections }) => void) => {
      const collections = useRxDBService().collections$();
      if (!collections) return;

      resolve({ collections });
    }
  );
}
