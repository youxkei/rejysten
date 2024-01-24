import type { PromiseExtended } from "dexie";
import type { JSXElement } from "solid-js";

import { createResource, useContext, Show, createContext } from "solid-js";

import { DB } from "@/services/dexie/db";
import { ServiceNotAvailable } from "@/services/error";

export type DexieService = {
  db: DB;
};

const context = createContext<DexieService>();

export function DexieServiceProvider(props: { children: JSXElement; databaseName: string }) {
  const [db$] = createResource(
    () => props.databaseName,
    (databaseName) => new DB(databaseName).open() as PromiseExtended<DB>
  );

  return (
    <Show when={db$()} keyed>
      {(db) => <context.Provider value={{ db }}>{props.children}</context.Provider>}
    </Show>
  );
}

export function useDexieService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Dexie");

  return service;
}
