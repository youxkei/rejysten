import type { RxDBService } from "./rxdb";
import type { LockService } from "@/services/lock";
import type { JSXElement } from "solid-js";

import { Suspense } from "solid-js";

import { useRxDBService } from "./rxdb";
import { LockServiceProvider, useLockService } from "@/services/lock";
import { RxDBServiceProviderForTest } from "@/services/rxdb/test";
import { renderAsync } from "@/test";

export function renderWithServicesForTest(tid: string, Component: (props: { children: JSXElement }) => JSXElement) {
  return renderAsync(
    (props) => (
      <Suspense>
        <RxDBServiceProviderForTest tid={tid}>
          <LockServiceProvider>
            <Component>{props.children}</Component>
          </LockServiceProvider>
        </RxDBServiceProviderForTest>
      </Suspense>
    ),
    (resolve: (value: { rxdbService: RxDBService; lockService: LockService }) => void) => {
      const lockService = useLockService();
      const rxdbService = useRxDBService();

      resolve({ rxdbService, lockService });
    }
  );
}
