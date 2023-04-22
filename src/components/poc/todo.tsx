import { waitForElementToBeRemoved } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Ulid } from "id128";
import { For } from "solid-js";

import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal, createSubscribeAllSignal } from "@/services/rxdb/subscribe";
import { renderWithRxDBServiceForTest } from "@/services/rxdb/test";

export function Todo() {
  const { collections$ } = useRxDBService();

  const todos$ = createSubscribeAllSignal(() => collections$()?.todos.find());

  const editor$ = createSubscribeSignal(() => collections$()?.editors.findOne("const"));

  const text$ = () => editor$()?.text ?? "";

  const onInput = (event: { currentTarget: HTMLInputElement }) => {
    collections$()?.editors.upsert({
      id: "const",
      text: event.currentTarget.value,
      updatedAt: Date.now(),
    });
  };

  const onClick = async () => {
    const collections = collections$();
    if (!collections) return;

    const text = text$();

    const id = Ulid.generate();
    const updatedAt = id.time.getTime();

    await collections.todos.insert({
      id: id.toCanonical(),
      text,
      updatedAt,
    });

    await collections.editors.upsert({
      id: "const",
      text: "",
      updatedAt,
    });
  };

  return (
    <div>
      <ul>
        <For each={todos$()}>{(todo, _) => <li>{todo.text}</li>}</For>
      </ul>
      <p>{text$()}</p>
      <input value={text$()} onInput={onInput} />
      <button onClick={onClick}>add</button>
    </div>
  );
}

if (import.meta.vitest) {
  test("renders", async (ctx) => {
    const { container, unmount, collections, findByText } = await renderWithRxDBServiceForTest(ctx.meta.id, (props) => (
      <>
        <Todo />
        {props.children}
      </>
    ));

    const todos = [
      { id: "001", text: "foo", updatedAt: 1 },
      { id: "002", text: "bar", updatedAt: 1 },
    ];

    await collections.todos.bulkInsert(todos);
    for (const todo of todos) {
      await findByText(todo.text);
    }

    ctx.expect(container).toMatchSnapshot();

    unmount();
  });

  test("add todos", async (ctx) => {
    const user = userEvent.setup();
    const { container, unmount, collections, findByText, queryByText } = await renderWithRxDBServiceForTest(ctx.meta.id, (props) => (
      <>
        <Todo />
        {props.children}
      </>
    ));

    const todos = [
      { id: "001", text: "foo", updatedAt: 1 },
      { id: "002", text: "bar", updatedAt: 1 },
    ];

    await collections.todos.bulkInsert(todos);
    for (const todo of todos) {
      await findByText(todo.text);
    }

    ctx.expect(container).toMatchSnapshot();

    const input = container.querySelector("input")!;
    const button = container.querySelector("button")!;

    await user.click(input);
    await user.keyboard("baz");
    await findByText("baz");
    ctx.expect(container).toMatchSnapshot();

    await user.click(button);
    await waitForElementToBeRemoved(() => queryByText("baz", { selector: "p" }));
    await findByText("baz");
    ctx.expect(container).toMatchSnapshot();

    unmount();
  });
}
