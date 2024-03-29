import type { LockService } from "@/services/lock";
import type { RxDBService } from "@/services/rxdb";
import type { StoreService } from "@/services/store";
import type { UserEvent } from "@testing-library/user-event/dist/types/setup/setup";
import type { JSXElement, Owner } from "solid-js";

import { MultiProvider } from "@solid-primitives/context";
import { Show, createResource, getOwner } from "solid-js";

import { EventServiceProvider } from "@/services/event";
import { EventEmitterServiceProvider } from "@/services/eventEmitter";
import { EventHandlerServiceProvider } from "@/services/eventHandler";
import {
  waitLockRelease,
  createSignalWithLock,
  runWithLock,
  LockServiceProvider,
  useLockService,
} from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { RxDBServiceProviderForTest } from "@/services/rxdb/test";
import { RxDBSyncFirestoreServiceProvider } from "@/services/rxdbSync/firestore";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { renderAsync } from "@/solid/test";

export type Services = {
  rxdb: RxDBService;
  store: StoreService;
  lock: LockService;
};

export function renderWithServicesForTest(
  tid: string,
  Component: (props: { children: JSXElement }) => JSXElement,
  setup?: (services: Services) => Promise<unknown>
) {
  return renderAsync(
    (props) => (
      <RxDBServiceProviderForTest tid={tid}>
        <StoreServiceProvider localStorageNamePostfix={tid}>
          <MultiProvider
            values={[
              RxDBSyncFirestoreServiceProvider,
              LockServiceProvider,
              EventServiceProvider,
              EventHandlerServiceProvider,
              EventEmitterServiceProvider,
            ]}
          >
            {(() => {
              if (!setup) {
                return <Component>{props.children}</Component>;
              }

              const rxdb = useRxDBService();
              const store = useStoreService();
              const lock = useLockService();
              const services = { rxdb, store, lock };

              const [done$] = createResource(async () => {
                await runWithLock(lock, () => setup(services));
                return true;
              });

              const doneWithLock$ = createSignalWithLock(lock, () => done$(), false);

              return (
                <Show when={doneWithLock$()}>
                  <Component>{props.children}</Component>
                </Show>
              );
            })()}
          </MultiProvider>
        </StoreServiceProvider>
      </RxDBServiceProviderForTest>
    ),
    (resolve: (value: { owner: Owner } & Services) => void) => {
      const owner = getOwner()!;

      const rxdb = useRxDBService();
      const store = useStoreService();
      const lock = useLockService();

      resolve({ owner, rxdb, store, lock });
    }
  );
}

export async function keyboard(user: UserEvent, lock: LockService, text: string) {
  for (const char of text) {
    await user.keyboard(char);
    await waitLockRelease(lock);
  }
}
