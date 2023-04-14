import type { ListItem } from "@/domain/listItem";

import { render, waitForElementToBeRemoved, queryByText, findByText } from "@solidjs/testing-library";
import { Show, For } from "solid-js";
import { ErrorBoundary } from "solid-js";

import { BulletList } from "@/components/bulletList";
import { createSignalWithLock } from "@/domain/lock";
import { useCollectionsSignal } from "@/rxdb/collections";
import { createSubscribeSignal, createSubscribeAllSignal } from "@/rxdb/subscribe";
import { TestWithRxDB, createCollections } from "@/rxdb/test";

export function ItemList(props: { id: string }) {
  return (
    <BulletList bullet={"•"} item={<ItemListItem id={props.id} />} child={<ItemListChildren parentId={props.id} />} />
  );
}

export function ItemListItem(props: { id: string }) {
  const collections$ = useCollectionsSignal();
  const listItem$ = createSubscribeSignal(() => collections$()?.listItems.findOne(props.id));

  const listItemWithLock$ = createSignalWithLock(listItem$, undefined);

  return <Show when={listItemWithLock$()}>{(listItem) => <span>{listItem().text}</span>}</Show>;
}

export function ItemListChildren(props: { parentId: string }) {
  const collections$ = useCollectionsSignal();
  const children$ = createSubscribeAllSignal(() =>
    collections$()?.listItems.find({
      selector: { parentId: props.parentId },
    })
  );

  const childrenWithLock$ = createSignalWithLock(children$, []);

  const sortedChildren$ = () => {
    const children = childrenWithLock$();
    if (children.length === 0) {
      return [];
    }

    const sortedChildren = [] as ListItem[];
    const childMap = new Map<string, ListItem>();
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
        `there is an inconsistency in listItem in the children of '${props.parentId}': some listItems are no in linked list`
      );
    }

    return sortedChildren;
  };

  return (
    <>
      <For each={sortedChildren$()}>{(child) => <ItemList id={child.id} />}</For>
    </>
  );
}

if (import.meta.vitest) {
  describe.each([
    {
      name: "swapped items",
      listItems: [
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "" },
        { id: "2", text: "foo", prevId: "3", nextId: "", parentId: "1" },
        { id: "3", text: "bar", prevId: "", nextId: "2", parentId: "1" },
      ],
    },
    {
      name: "nested items",
      listItems: [
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "" },
        { id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1" },
        { id: "2_1", text: "foofoo", prevId: "", nextId: "", parentId: "2" },
        { id: "3", text: "bar", prevId: "2", nextId: "", parentId: "1" },
      ],
    },
  ])("$name", ({ listItems }) => {
    test("text changes", async (ctx) => {
      const tid = ctx.meta.id;
      let collections = await createCollections(tid);
      await collections.locks.upsert({ id: "lock", isLocked: false });
      await collections.listItems.bulkUpsert(listItems);

      const { container, unmount } = render(() => (
        <TestWithRxDB tid={tid}>
          <ItemList id="1" />
        </TestWithRxDB>
      ));

      await waitForElementToBeRemoved(() => queryByText(container, tid));
      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems.findOne("1").exec())!.incrementalPatch({
        text: "changed root",
      });

      await findByText(container, "changed root");
      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems.findOne("2").exec())!.incrementalPatch({
        text: "changed foo",
      });

      await findByText(container, "changed foo");
      ctx.expect(container).toMatchSnapshot();

      unmount();
    });
  });

  test("add child", async (ctx) => {
    const tid = ctx.meta.id;
    let collections = await createCollections(tid);
    await collections.locks.upsert({ id: "lock", isLocked: false });
    await collections.listItems.bulkUpsert([
      { id: "1", text: "root", prevId: "", nextId: "", parentId: "" },
      { id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1" },
      { id: "3", text: "bar", prevId: "2", nextId: "", parentId: "1" },
    ]);

    const { container, unmount } = render(() => (
      <TestWithRxDB tid={tid}>
        <ItemList id="1" />
      </TestWithRxDB>
    ));

    await waitForElementToBeRemoved(() => queryByText(container, tid));
    ctx.expect(container).toMatchSnapshot();

    await collections.listItems.bulkUpsert([
      { id: "3", text: "bar", prevId: "2", nextId: "4", parentId: "1" },
      { id: "4", text: "baz", prevId: "3", nextId: "", parentId: "1" },
    ]);

    await findByText(container, "baz");
    ctx.expect(container).toMatchSnapshot();

    unmount();
  });

  test("not updated when locked", async (ctx) => {
    const tid = ctx.meta.id;
    let collections = await createCollections(tid);
    await collections.locks.upsert({ id: "lock", isLocked: true });
    await collections.listItems.bulkUpsert([
      { id: "1", text: "root", prevId: "", nextId: "", parentId: "" },
      { id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1" },
      { id: "3", text: "bar", prevId: "2", nextId: "", parentId: "1" },
    ]);

    const { container, unmount } = render(() => (
      <TestWithRxDB tid={tid}>
        <ItemList id="1" />
      </TestWithRxDB>
    ));

    await waitForElementToBeRemoved(() => queryByText(container, tid));
    ctx.expect(container).toMatchSnapshot("initial");

    await collections.locks.upsert({ id: "lock", isLocked: false });
    await findByText(container, "foo");
    ctx.expect(container).toMatchSnapshot("unlocked");

    await collections.locks.upsert({ id: "lock", isLocked: true });
    await collections.listItems.bulkUpsert([
      { id: "1", text: "*root", prevId: "", nextId: "", parentId: "" },
      { id: "2", text: "*foo", prevId: "3", nextId: "", parentId: "1" },
      { id: "3", text: "*bar", prevId: "", nextId: "2", parentId: "1" },
    ]);
    await collections.locks.upsert({ id: "lock", isLocked: false });
    await findByText(container, "*foo");
    ctx.expect(container).toMatchSnapshot("updated with lock");

    unmount();
  });

  describe("inconsistent error", () => {
    test("an item is not in linked list", async (ctx) => {
      const tid = ctx.meta.id;
      let collections = await createCollections(tid);
      await collections.locks.upsert({ id: "lock", isLocked: false });
      await collections.listItems.bulkUpsert([
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "" },
        { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1" },
      ]);

      const { container, unmount } = render(() => (
        <ErrorBoundary fallback={(error) => `${error}`}>
          <TestWithRxDB tid={tid}>
            <ItemList id="1" />
          </TestWithRxDB>
        </ErrorBoundary>
      ));

      await waitForElementToBeRemoved(() => queryByText(container, tid));
      ctx.expect(container).toMatchSnapshot("initial");

      await collections.listItems.bulkUpsert([{ id: "3", text: "bar", prevId: "", nextId: "", parentId: "1" }]);
      await findByText(
        container,
        "Error: there is an inconsistency in listItem in the children of '1': some listItems are no in linked list"
      );
      ctx.expect(container).toMatchSnapshot("error");

      unmount();
    });

    test("next item not found", async (ctx) => {
      const tid = ctx.meta.id;
      let collections = await createCollections(tid);
      await collections.locks.upsert({ id: "lock", isLocked: false });
      await collections.listItems.bulkUpsert([
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "" },
        { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1" },
      ]);

      const { container, unmount } = render(() => (
        <ErrorBoundary fallback={(error) => `${error}`}>
          <TestWithRxDB tid={tid}>
            <ItemList id="1" />
          </TestWithRxDB>
        </ErrorBoundary>
      ));

      await waitForElementToBeRemoved(() => queryByText(container, tid));
      ctx.expect(container).toMatchSnapshot("initial");

      await collections.listItems.bulkUpsert([{ id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1" }]);
      await findByText(
        container,
        "Error: there is an inconsistency in listItem in the children of '1': no listItem with id = '3'"
      );
      ctx.expect(container).toMatchSnapshot("error");

      unmount();
    });

    test("first item not found", async (ctx) => {
      const tid = ctx.meta.id;
      let collections = await createCollections(tid);
      await collections.locks.upsert({ id: "lock", isLocked: false });
      await collections.listItems.bulkUpsert([
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "" },
        { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1" },
      ]);

      const { container, unmount } = render(() => (
        <ErrorBoundary fallback={(error) => `${error}`}>
          <TestWithRxDB tid={tid}>
            <ItemList id="1" />
          </TestWithRxDB>
        </ErrorBoundary>
      ));

      await waitForElementToBeRemoved(() => queryByText(container, tid));
      ctx.expect(container).toMatchSnapshot("initial");

      await collections.listItems.bulkUpsert([{ id: "2", text: "foo", prevId: "3", nextId: "3", parentId: "1" }]);
      await findByText(
        container,
        "Error: there is an inconsistency in listItem in the children of '1': no listItem with prevId = ''"
      );
      ctx.expect(container).toMatchSnapshot("error");

      unmount();
    });
  });
}
