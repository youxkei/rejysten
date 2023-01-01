import { Show, For, createMemo, createEffect } from "solid-js";

import { useCollections, useSubscribe, useSubscribeAll } from "@/rxdb";
import { BulletList } from "@/components/bulletList";

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
  const collections = useCollections();
  const listItem = useSubscribe(() =>
    collections()?.listItems.findOne(props.id)
  );

  return (
    <Show when={listItem()}>
      <span>{listItem()!.text}</span>
    </Show>
  );
}

export function ItemListChildren(props: { parentId: string }) {
  const collections = useCollections();
  const children = useSubscribeAll(() =>
    collections()?.listItems.find({ selector: { parentId: props.parentId } })
  );

  const sortedChildren = createMemo(
    () => {
      type ListItem = ReturnType<typeof children>[0];

      const unsortedChildren = children();
      if (unsortedChildren.length === 0) {
        return { inconsistent: false, children: unsortedChildren };
      }

      const sortedChildren = [] as ListItem[];
      const childMap = new Map<string, ListItem>();
      let currentChildId: string | null = null;

      for (const child of unsortedChildren) {
        if (child.prevId === "") {
          currentChildId = child.id;
        }
        childMap.set(child.id, child);
      }

      if (currentChildId === null) {
        return { inconsistent: true, children: [] };
      }

      while (currentChildId !== "") {
        const currentChild = childMap.get(currentChildId);

        if (currentChild === undefined) {
          return { inconsistent: true, children: [] };
        }

        sortedChildren.push(currentChild);
        currentChildId = currentChild.nextId;
      }

      if (unsortedChildren.length != sortedChildren.length) {
        return { inconsistent: true, children: [] };
      }

      return { inconsistent: false, children: sortedChildren };
    },
    { inconsistent: false, children: [] },
    { equals: (_, next) => next.inconsistent }
  );

  return (
    <>
      <For each={sortedChildren().children}>
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
} from "solid-testing-library";

import { TestWithRxDB, createCollections } from "@/rxdb/test";

if (import.meta.vitest) {
  describe.each([
    {
      name: "swapped",
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
      name: "nested",
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
      await collections.listItems.bulkUpsert(listItems);

      const { container, unmount } = render(() => (
        <TestWithRxDB tid={tid}>
          <ItemList id="001" />
        </TestWithRxDB>
      ));

      await waitForElementToBeRemoved(() => queryByText(container, tid));
      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems.findOne("001").exec())!.atomicPatch({
        text: "changed root",
      });

      await findByText(container, "changed root");
      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems.findOne("002").exec())!.atomicPatch({
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
}
