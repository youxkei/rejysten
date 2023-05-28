import type { LockService } from "@/services/lock";
import type { RxDBService } from "@/services/rxdb";
import type { StoreService } from "@/services/store";
import type { JSXElement, Owner } from "solid-js";

import { MultiProvider } from "@solid-primitives/context";
import { getOwner } from "solid-js";

import { EventServiceProvider } from "@/services/event";
import { LockServiceProvider, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { RxDBServiceProviderForTest } from "@/services/rxdb/test";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { renderAsync } from "@/solid/test";

export function renderWithServicesForTest(tid: string, Component: (props: { children: JSXElement }) => JSXElement) {
  return renderAsync(
    (props) => (
      <RxDBServiceProviderForTest tid={tid}>
        <MultiProvider values={[StoreServiceProvider, LockServiceProvider, EventServiceProvider]}>
          <Component>{props.children}</Component>
        </MultiProvider>
      </RxDBServiceProviderForTest>
    ),
    (resolve: (value: { owner: Owner; rxdbService: RxDBService; storeService: StoreService; lockService: LockService }) => void) => {
      const owner = getOwner()!;

      const rxdbService = useRxDBService();
      const storeService = useStoreService();
      const lockService = useLockService();

      resolve({ owner, rxdbService, storeService, lockService });
    }
  );
}
