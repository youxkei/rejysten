import type { ListItem } from "@/services/rxdb/collections/listItem";

import { Show, For } from "solid-js";
import { ErrorBoundary } from "solid-js";

import { BulletList } from "@/components/bulletList";
import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal, createSubscribeAllSignal } from "@/services/rxdb/subscribe";
import { renderWithServicesForTest } from "@/services/test";

export function ItemList(props: { id: string; selectedId: string }) {
  const rxdbService = useRxDBService();
  const lockService = useLockService();

  const listItem$ = createSubscribeSignal(() => rxdbService.collections.listItems.findOne(props.id));
  const listItemWithLock$ = createSignalWithLock(lockService, listItem$, undefined);

  return (
    <Show when={listItemWithLock$()}>
      {(listItem) => (
        <BulletList
          bullet={"•"}
          item={<span>{listItem().text}</span>}
          child={<ItemListChildren parentId={props.id} selectedId={props.selectedId} />}
          isSelected={props.id === props.selectedId}
        />
      )}
    </Show>
  );
}

export function ItemListChildren(props: { parentId: string; selectedId: string }) {
  const lockService = useLockService();
  const rxdbService = useRxDBService();

  const children$ = createSubscribeAllSignal(() =>
    rxdbService.collections.listItems.find({
      selector: { parentId: props.parentId },
    })
  );

  const childrenWithLock$ = createSignalWithLock(lockService, children$, []);

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
      throw new Error(`there is an inconsistency in listItem in the children of '${props.parentId}': some listItems are not in linked list`);
    }

    return sortedChildren;
  };

  return <For each={sortedChildren$()}>{(child) => <ItemList id={child.id} selectedId={props.selectedId} />}</For>;
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
        rxdbService: { collections },
        findByText,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <>
          <ItemList id="1" selectedId="" />
          {props.children}
        </>
      ));

      await collections.listItems.bulkInsert(listItems);
      for (const listItem of listItems) {
        await findByText(listItem.text);
      }

      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems.findOne("1").exec())!.patch({
        text: "changed root",
      });
      await findByText("changed root");

      ctx.expect(container).toMatchSnapshot();

      await (await collections.listItems.findOne("2").exec())!.patch({
        text: "changed foo",
      });
      await findByText("changed foo");

      ctx.expect(container).toMatchSnapshot();

      unmount();
    });
  });

  test("add child", async (ctx) => {
    const {
      container,
      unmount,
      rxdbService: { collections },
      lockService,
      findByText,
    } = await renderWithServicesForTest(ctx.meta.id, (props) => (
      <>
        <ItemList id="1" selectedId="" />
        {props.children}
      </>
    ));

    const listItems = [
      { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
      { id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
      { id: "3", text: "bar", prevId: "2", nextId: "", parentId: "1", updatedAt: 0 },
    ];

    await collections.listItems.bulkInsert(listItems);
    for (const listItem of listItems) {
      await findByText(listItem.text);
    }

    ctx.expect(container).toMatchSnapshot("initial");

    await runWithLock(lockService, async () => {
      await collections.listItems.bulkUpsert([
        { id: "3", text: "bar", prevId: "2", nextId: "4", parentId: "1", updatedAt: 1 },
        { id: "4", text: "baz", prevId: "3", nextId: "", parentId: "1", updatedAt: 1 },
      ]);
    });
    await findByText("baz");

    ctx.expect(container).toMatchSnapshot("baz added");

    unmount();
  });

  describe("inconsistent error", () => {
    test("an item is not in linked list", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        findByText,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <ErrorBoundary fallback={(error) => `${error}`}>
          <ItemList id="1" selectedId="" />
          {props.children}
        </ErrorBoundary>
      ));

      const listItems = [
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
        { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
      ];

      await collections.listItems.bulkInsert(listItems);
      for (const listItem of listItems) {
        await findByText(listItem.text);
      }

      ctx.expect(container).toMatchSnapshot("initial");

      await collections.listItems.insert({ id: "3", text: "bar", prevId: "", nextId: "", parentId: "1", updatedAt: 1 });
      await findByText("Error: there is an inconsistency in listItem in the children of '1': some listItems are not in linked list");
      ctx.expect(container).toMatchSnapshot("error");

      unmount();
    });

    test("next item not found", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        findByText,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <ErrorBoundary fallback={(error) => `${error}`}>
          <ItemList id="1" selectedId="" />
          {props.children}
        </ErrorBoundary>
      ));

      const listItems = [
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
        { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
      ];

      await collections.listItems.bulkInsert(listItems);
      for (const listItem of listItems) {
        await findByText(listItem.text);
      }

      ctx.expect(container).toMatchSnapshot("initial");

      await collections.listItems.upsert({ id: "2", text: "foo", prevId: "", nextId: "3", parentId: "1", updatedAt: 1 });
      await findByText("Error: there is an inconsistency in listItem in the children of '1': no listItem with id = '3'");

      ctx.expect(container).toMatchSnapshot("error");

      unmount();
    });

    test("first item not found", async (ctx) => {
      const {
        container,
        unmount,
        rxdbService: { collections },
        findByText,
      } = await renderWithServicesForTest(ctx.meta.id, (props) => (
        <ErrorBoundary fallback={(error) => `${error}`}>
          <ItemList id="1" selectedId="" />
          {props.children}
        </ErrorBoundary>
      ));

      const listItems = [
        { id: "1", text: "root", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
        { id: "2", text: "foo", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
      ];

      await collections.listItems.bulkInsert(listItems);
      for (const listItem of listItems) {
        await findByText(listItem.text);
      }

      ctx.expect(container).toMatchSnapshot("initial");

      await collections.listItems.upsert({ id: "2", text: "foo", prevId: "3", nextId: "3", parentId: "1", updatedAt: 1 });
      await findByText("Error: there is an inconsistency in listItem in the children of '1': no listItem with prevId = ''");

      ctx.expect(container).toMatchSnapshot("error");

      unmount();
    });
  });
}
