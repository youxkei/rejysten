import { Ulid } from "id128";
import { For } from "solid-js";

import { useCollections, useSubscribe } from "@/rxdb";

export function Todo() {
  const collections = useCollections();

  const todos = useSubscribe(() => collections()?.todos.find(), []);

  const editor = useSubscribe(
    () => collections()?.editors.findOne("const"),
    null
  );

  const text = () => editor()?.text ?? "";

  const onInput = (event: { currentTarget: HTMLInputElement }) => {
    collections()?.editors.upsert({
      id: "const",
      text: event.currentTarget.value,
      updatedAt: Date.now(),
    });
  };

  const onClick = () => {
    const id = Ulid.generate();

    collections()?.todos.insert({
      id: id.toCanonical(),
      text: text(),
      updatedAt: id.time.getTime(),
    });

    collections()?.editors.upsert({
      id: "const",
      text: "",
      updatedAt: Date.now(),
    });
  };

  return (
    <>
      <ul>
        <For each={todos()}>{(todo, _) => <li>{todo.text}</li>}</For>
      </ul>
      <p>{text()}</p>
      <input value={text()} onInput={onInput} />
      <button onClick={onClick}>add</button>
    </>
  );
}

import {
  render,
  waitForElementToBeRemoved,
  findByText,
  queryByText,
} from "solid-testing-library";
import userEvent from "@testing-library/user-event";

import { TestWithRxDB, createCollections } from "@/rxdb/test";

if (import.meta.vitest) {
  test("renders", async (ctx) => {
    const tid = ctx.meta.id;
    let collections = await createCollections(tid);

    await collections.todos.bulkUpsert([
      { id: "001", text: "foo", updatedAt: 1 },
      { id: "002", text: "bar", updatedAt: 2 },
    ]);

    const { container, unmount } = render(() => (
      <TestWithRxDB tid={tid}>
        <Todo />
      </TestWithRxDB>
    ));

    await waitForElementToBeRemoved(() => queryByText(container, tid));
    ctx.expect(container.innerHTML).toMatchSnapshot();

    unmount();
  });

  test("add todos", async (ctx) => {
    const tid = ctx.meta.id;
    const collections = await createCollections(tid);
    const user = userEvent.setup();

    await collections.todos.bulkUpsert([
      { id: "001", text: "foo", updatedAt: 1 },
      { id: "002", text: "bar", updatedAt: 2 },
    ]);

    const { container, unmount } = render(() => (
      <TestWithRxDB tid={tid}>
        <Todo />
      </TestWithRxDB>
    ));

    await waitForElementToBeRemoved(() => queryByText(container, tid));
    ctx.expect(container.innerHTML).toMatchSnapshot();

    const input = container.querySelector("input")!;
    const button = container.querySelector("button")!;

    await user.click(input);
    await user.keyboard("baz");
    await findByText(container, "baz");
    ctx.expect(container.innerHTML).toMatchSnapshot();

    await user.click(button);
    await findByText(container.querySelector("ul")!, "baz");
    await waitForElementToBeRemoved(() =>
      queryByText(container.querySelector("p")!, "baz")
    );
    ctx.expect(container.innerHTML).toMatchSnapshot();

    unmount();
  });
}
