import type { ListItemDocument } from "@/services/rxdb/collections/listItem";

import { Show, ErrorBoundary, For } from "solid-js";

import { BulletList } from "@/components/bulletList";
import { Editor } from "@/components/editor";
import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/rxdb/subscribe";
import { useStoreService } from "@/services/store";
import { renderWithServicesForTest } from "@/services/test";
import { shortenClassName } from "@/test";

export function ItemList(props: { listItemId: string; selectedId: string }) {
  const { collections } = useRxDBService();
  const { store } = useStoreService();
  const lock = useLockService();

  const listItem$ = createSubscribeSignal(() => collections.listItems.findOne(props.listItemId));
  const listItemWithLock$ = createSignalWithLock(lock, () => listItem$(), null);
  const isSelected$ = createSignalWithLock(lock, () => props.listItemId === props.selectedId, false);
  const isEditor$ = createSignalWithLock(lock, () => isSelected$() && store.mode === "insert", false);

  return (
    <Show when={listItemWithLock$()}>
      {(listItem$) => (
        <BulletList
          bullet={"•"}
          item={
            <Show when={isEditor$()} fallback={<span>{listItem$().text}</span>}>
              <Editor text={listItem$().text} />
            </Show>
          }
          child={<ItemListChildren parentId={props.listItemId} selectedId={props.selectedId} />}
          isSelected={isSelected$()}
        />
      )}
    </Show>
  );
}

export function ItemListChildren(props: { parentId: string; selectedId: string }) {
  const lock = useLockService();
  const { collections } = useRxDBService();

  const children$ = createSubscribeAllSignal(() =>
    collections.listItems.find({
      selector: { parentId: props.parentId },
    })
  );

  const childrenWithLock$ = createSignalWithLock(lock, children$, []);

  const sortedChildrenIds$ = () => {
    const children = childrenWithLock$();
    if (children.length === 0) {
      return [];
    }

    const sortedChildren = [] as ListItemDocument[];
    const childMap = new Map<string, ListItemDocument>();
    let currentChildId: string | undefined;

    for (const child of children) {
      if (child.prevId === "") {
        currentChildId = child.id;
      }
      childMap.set(child.id, child);
    }

    if (currentChildId === undefined) {
      throw new Error(`there is an inconsistency in listItem in the children of '${props.parentId}': no listItem with prevId = ''`);
    }

    while (currentChildId !== "") {
      const currentChild = childMap.get(currentChildId);

      if (currentChild === undefined) {
        throw new Error(`there is an inconsistency in listItem in the children of '${props.parentId}': no listItem with id = '${currentChildId}'`);
      }

      sortedChildren.push(currentChild);
      currentChildId = currentChild.nextId;
    }

    if (children.length != sortedChildren.length) {
      throw new Error(
        `there is an inconsistency in listItem in the children of '${props.parentId}': some listItems are not in linked list: children = [${children.map(
          (child) => child.id
        )}], sortedChildren = [${sortedChildren.map((child) => child.id)}]`
      );
    }

    return sortedChildren.map((child) => child.id);
  };

  return <For each={sortedChildrenIds$()}>{(listItemId) => <ItemList listItemId={listItemId} selectedId={props.selectedId} />}</For>;
}

if (import.meta.vitest) {
  describe.each([
    {
      name: "swapped items",
      listItems: [
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
        { id: "2", text: "foo", prevId: "3", nextId: "", parentId: "1", updatedAt: 0 },
        { id: "3", text: "bar", prevId: "", nextId: "2", parentId: "1", updatedAt: 0 },
      ],
    },
    {
      name: "nested items",
      listItems: [
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
        { id: "2", text: "foo", prevId: "", nextId: "4", parentId: "1", updatedAt: 0 },
        { id: "3", text: "foofoo", prevId: "", nextId: "", parentId: "2", updatedAt: 0 },
        { id: "4", text: "bar", prevId: "2", nextId: "", parentId: "1", updatedAt: 0 },
      ],
    },
  ])("$name", ({ listItems }) => {
    test("text changes", async (ctx) => {
      const {
        container,
        unmount,
        rxdb: { collections },
        findByText,
      } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <>
            <ItemListChildren parentId="" selectedId="" />
            {props.children}
          </>
        ),
        ({ rxdb: { collections } }) => collections.listItems.bulkInsert(listItems)
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      await (await collections.listItems.findOne("1").exec())!.patch({
        text: "changed root",
      });
      await findByText("changed root");

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      await (await collections.listItems.findOne("2").exec())!.patch({
        text: "changed foo",
      });
      await findByText("changed foo");

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });
  });

  test("add child", async (ctx) => {
    const {
      container,
      unmount,
      rxdb: { collections },
      lock,
      findByText,
    } = await renderWithServicesForTest(
      ctx.meta.id,
      (props) => (
        <>
          <ItemListChildren parentId="" selectedId="" />
          {props.children}
        </>
      ),
      ({ rxdb: { collections } }) =>
        collections.listItems.bulkInsert([
          { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
          { id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
          { id: "3", text: "bar", prevId: "2", nextId: "", parentId: "1", updatedAt: 0 },
        ])
    );

    ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

    await runWithLock(lock, async () => {
      await collections.listItems.bulkUpsert([
        { id: "3", text: "bar", prevId: "2", nextId: "4", parentId: "1", updatedAt: 1 },
        { id: "4", text: "baz", prevId: "3", nextId: "", parentId: "1", updatedAt: 1 },
      ]);
    });
    await findByText("baz");

    ctx.expect(shortenClassName(container)).toMatchSnapshot("baz added");

    unmount();
  });

  describe("inconsistent error", () => {
    test("an item is not in linked list", async (ctx) => {
      const {
        container,
        unmount,
        rxdb: { collections },
        findByText,
      } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <ErrorBoundary fallback={(error) => `${error}`}>
            <ItemListChildren parentId="" selectedId="" />
            {props.children}
          </ErrorBoundary>
        ),
        ({ rxdb: { collections } }) =>
          collections.listItems.bulkInsert([
            { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
            { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await collections.listItems.insert({ id: "3", text: "bar", prevId: "2", nextId: "", parentId: "1", updatedAt: 1 });
      await findByText(
        "Error: there is an inconsistency in listItem in the children of '1': some listItems are not in linked list: children = [2,3], sortedChildren = [2]"
      );
      ctx.expect(shortenClassName(container)).toMatchSnapshot("error");

      unmount();
    });

    test("next item not found", async (ctx) => {
      const {
        container,
        unmount,
        rxdb: { collections },
        findByText,
      } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <ErrorBoundary fallback={(error) => `${error}`}>
            <ItemListChildren parentId="" selectedId="" />
            {props.children}
          </ErrorBoundary>
        ),
        ({ rxdb: { collections } }) =>
          collections.listItems.bulkInsert([
            { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
            { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await collections.listItems.upsert({ id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1", updatedAt: 1 });
      await findByText("Error: there is an inconsistency in listItem in the children of '1': no listItem with id = '3'");

      ctx.expect(shortenClassName(container)).toMatchSnapshot("error");

      unmount();
    });

    test("first item not found", async (ctx) => {
      const {
        container,
        unmount,
        rxdb: { collections },
        findByText,
      } = await renderWithServicesForTest(
        ctx.meta.id,
        (props) => (
          <ErrorBoundary fallback={(error) => `${error}`}>
            <ItemListChildren parentId="" selectedId="" />
            {props.children}
          </ErrorBoundary>
        ),
        ({ rxdb: { collections } }) =>
          collections.listItems.bulkInsert([
            { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
            { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
          ])
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await collections.listItems.upsert({ id: "2", text: "foo", prevId: "3", nextId: "3", parentId: "1", updatedAt: 1 });
      await findByText("Error: there is an inconsistency in listItem in the children of '1': no listItem with prevId = ''");

      ctx.expect(shortenClassName(container)).toMatchSnapshot("error");

      unmount();
    });
  });
}
