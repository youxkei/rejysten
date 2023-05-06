import type { LockService } from "@/services/lock";
import type { RxDBService } from "@/services/rxdb";
import type { StoreService } from "@/services/store";
import type { JSXElement, Owner } from "solid-js";

import { getOwner, Suspense } from "solid-js";

import { LockServiceProvider, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { RxDBServiceProviderForTest } from "@/services/rxdb/test";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { renderAsync } from "@/test";

export function renderWithServicesForTest(tid: string, Component: (props: { children: JSXElement }) => JSXElement) {
  return renderAsync(
    (props) => (
      <Suspense>
        <RxDBServiceProviderForTest tid={tid}>
          <StoreServiceProvider>
            <LockServiceProvider>
              <Component>{props.children}</Component>
            </LockServiceProvider>
          </StoreServiceProvider>
        </RxDBServiceProviderForTest>
      </Suspense>
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
