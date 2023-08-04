import type { ListItemDocument } from "@/services/rxdb/collections/listItem";

import { Show, ErrorBoundary, For } from "solid-js";

import { BulletList } from "@/components/bulletList";
import { Editor } from "@/components/editor";
import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { makeListItems } from "@/services/rxdb/collections/test";
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
      throw new Error(
        `there is an inconsistency in listItem in the children of '${props.parentId}': no listItem with prevId = ''`
      );
    }

    while (currentChildId !== "") {
      const currentChild = childMap.get(currentChildId);

      if (currentChild === undefined) {
        throw new Error(
          `there is an inconsistency in listItem in the children of '${props.parentId}': no listItem with id = '${currentChildId}'`
        );
      }

      sortedChildren.push(currentChild);
      currentChildId = currentChild.nextId;
    }

    if (children.length != sortedChildren.length) {
      throw new Error(
        `there is an inconsistency in listItem in the children of '${
          props.parentId
        }': some listItems are not in linked list: children = [${children.map(
          (child) => child.id
        )}], sortedChildren = [${sortedChildren.map((child) => child.id)}]`
      );
    }

    return sortedChildren.map((child) => child.id);
  };

  return (
    <For each={sortedChildrenIds$()}>
      {(listItemId) => <ItemList listItemId={listItemId} selectedId={props.selectedId} />}
    </For>
  );
}

if (import.meta.vitest) {
  describe.each([
    {
      name: "swapped items",
      // prettier-ignore
      listItems: makeListItems("", 0, [
        ["root", [
          ["bar"],
          ["foo"],
        ]]
      ]),
    },
    {
      name: "nested items",
      // prettier-ignore
      listItems: makeListItems("", 0, [
        ["root", [
          ["foo", [
            ["foofoo"],
          ]],
          ["bar"],
        ]],
      ]),
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

      await (await collections.listItems.findOne("root").exec())!.patch({
        text: "changed root",
      });
      await findByText("changed root");

      ctx.expect(shortenClassName(container)).toMatchSnapshot();

      await (await collections.listItems.findOne("foo").exec())!.patch({
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
        // prettier-ignore
        collections.listItems.bulkInsert(makeListItems("", 0, [
          ["root", [
            ["foo"],
            ["bar"],
          ]],
        ]))
    );

    ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

    await runWithLock(lock, async () => {
      // prettier-ignore
      await collections.listItems.bulkUpsert([
        { id: "bar", text: "bar", prevId: "faa", nextId: "baz", parentId: "root", updatedAt: 1, },
        { id: "baz", text: "baz", prevId: "bar", nextId: "",    parentId: "root", updatedAt: 1, },
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
          // prettier-ignore
          collections.listItems.bulkInsert(makeListItems("", 0, [
            ["root", [
              ["foo"],
            ]],
          ]))
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await collections.listItems.insert({
        id: "bar",
        text: "bar",
        prevId: "foo",
        nextId: "",
        parentId: "root",
        updatedAt: 1,
      });
      await findByText(
        "Error: there is an inconsistency in listItem in the children of 'root': some listItems are not in linked list: children = [bar,foo], sortedChildren = [foo]"
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
          // prettier-ignore
          collections.listItems.bulkInsert(makeListItems("", 0, [
            ["root", [
              ["foo"],
            ]],
          ]))
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await collections.listItems.upsert({
        id: "foo",
        text: "foo",
        prevId: "",
        nextId: "bar",
        parentId: "root",
        updatedAt: 1,
      });
      await findByText(
        "Error: there is an inconsistency in listItem in the children of 'root': no listItem with id = 'bar'"
      );

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
          // prettier-ignore
          collections.listItems.bulkInsert(makeListItems("", 0, [
            ["root", [
              ["foo"],
            ]],
          ]))
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("initial");

      await collections.listItems.upsert({
        id: "foo",
        text: "foo",
        prevId: "bar",
        nextId: "baz",
        parentId: "root",
        updatedAt: 1,
      });
      await findByText(
        "Error: there is an inconsistency in listItem in the children of 'root': no listItem with prevId = ''"
      );

      ctx.expect(shortenClassName(container)).toMatchSnapshot("error");

      unmount();
    });
  });
}
