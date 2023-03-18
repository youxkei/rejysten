import { Show, For, createMemo } from "solid-js";

import { useCollectionsSignal } from "@/rxdb/collections";
import {
  createSubscribeSignal,
  createSubscribeAllSignal,
} from "@/rxdb/subscribe";
import { BulletList } from "@/components/bulletList";
import { createSignalWithLock } from "@/domain/lock";

export function ItemList(props: { id: string }) {
  return (
    <BulletList
      bullet={"•"}
      item={<ItemListItem id={props.id} />}
      child={<ItemListChildren parentId={props.id} />}
    />
  );
}

export function ItemListItem(props: { id: string }) {
  const collections$ = useCollectionsSignal();
  const listItem$ = createSubscribeSignal(() =>
    collections$()?.listItems.findOne(props.id)
  );

  const listItemWithLock$ = createSignalWithLock(listItem$, undefined);

  return (
    <Show when={listItemWithLock$()} keyed>
      {(listItem) => <span>{listItem.text}</span>}
    </Show>
  );
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

    type ListItem = ReturnType<typeof children$>[0];

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
        `there is no first listItem in the children of '${props.parentId}'`
      );
    }

    while (currentChildId !== "") {
      const currentChild = childMap.get(currentChildId);

      if (currentChild === undefined) {
        throw new Error(
          `there is an inconsistency in listItem in the children of '${props.parentId}: '${currentChildId}' is not found`
        );
      }

      sortedChildren.push(currentChild);
      currentChildId = currentChild.nextId;
    }

    if (children.length != sortedChildren.length) {
      throw new Error(
        `there is an inconsistency in listItem in the children of '${props.parentId}: some listItem is no in linked list`
      );
    }

    return sortedChildren;
  };

  return (
    <>
      <For each={sortedChildren$()}>
        {(child) => <ItemList id={child.id} />}
      </For>
    </>
  );
}

import {
  render,
  waitForElementToBeRemoved,
  queryByText,
  findByText,
} from "@solidjs/testing-library";

import { TestWithRxDB, createCollections } from "@/rxdb/test";

if (import.meta.vitest) {
  describe.each([
    {
      name: "swapped items",
      listItems: [
        {
          id: "001",
          text: "root",
          prevId: "",
          nextId: "",
          parentId: "",
        },
        {
          id: "002",
          text: "foo",
          prevId: "003",
          nextId: "",
          parentId: "001",
        },
        {
          id: "003",
          text: "bar",
          prevId: "",
          nextId: "002",
          parentId: "001",
        },
      ],
    },
    {
      name: "nested items",
      listItems: [
        {
          id: "001",
          text: "root",
          prevId: "",
          nextId: "",
          parentId: "",
        },
        {
          id: "002",
          text: "foo",
          prevId: "",
          nextId: "003",
          parentId: "001",
        },
        {
          id: "0021",
          text: "foofoo",
          prevId: "",
          nextId: "",
          parentId: "002",
        },
        {
          id: "003",
          text: "bar",
          prevId: "002",
          nextId: "",
          parentId: "001",
        },
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
          <ItemList id="001" />
        </TestWithRxDB>
      ));

      await waitForElementToBeRemoved(() => queryByText(container, tid));
      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems
        .findOne("001")
        .exec())!.incrementalPatch({ text: "changed root" });

      await findByText(container, "changed root");
      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems
        .findOne("002")
        .exec())!.incrementalPatch({ text: "changed foo" });

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
      {
        id: "001",
        text: "root",
        prevId: "",
        nextId: "",
        parentId: "",
      },
      {
        id: "002",
        text: "foo",
        prevId: "",
        nextId: "003",
        parentId: "001",
      },
      {
        id: "003",
        text: "bar",
        prevId: "002",
        nextId: "",
        parentId: "001",
      },
    ]);

    const { container, unmount } = render(() => (
      <TestWithRxDB tid={tid}>
        <ItemList id="001" />
      </TestWithRxDB>
    ));

    await waitForElementToBeRemoved(() => queryByText(container, tid));
    ctx.expect(container).toMatchSnapshot();

    await collections.listItems.bulkUpsert([
      {
        id: "003",
        text: "bar",
        prevId: "002",
        nextId: "004",
        parentId: "001",
      },
      {
        id: "004",
        text: "baz",
        prevId: "003",
        nextId: "",
        parentId: "001",
      },
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
      { id: "01", text: "root", prevId: "", nextId: "", parentId: "" },
      { id: "02", text: "foo", prevId: "", nextId: "03", parentId: "01" },
      { id: "03", text: "bar", prevId: "02", nextId: "", parentId: "01" },
    ]);

    const { container, unmount } = render(() => (
      <TestWithRxDB tid={tid}>
        <ItemList id="01" />
      </TestWithRxDB>
    ));

    await waitForElementToBeRemoved(() => queryByText(container, tid));
    ctx.expect(container).toMatchSnapshot("initial");

    await collections.locks.upsert({ id: "lock", isLocked: false });
    await findByText(container, "foo");
    ctx.expect(container).toMatchSnapshot("unlocked");

    await collections.locks.upsert({ id: "lock", isLocked: true });
    await collections.listItems.bulkUpsert([
      { id: "01", text: "*root", prevId: "", nextId: "", parentId: "" },
      { id: "02", text: "*foo", prevId: "03", nextId: "", parentId: "01" },
      { id: "03", text: "*bar", prevId: "", nextId: "02", parentId: "01" },
    ]);
    await collections.locks.upsert({ id: "lock", isLocked: false });
    await findByText(container, "*foo");
    ctx.expect(container).toMatchSnapshot("updated with lock");

    unmount();
  });
}
