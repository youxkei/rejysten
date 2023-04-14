import { render, waitForElementToBeRemoved, findByText, queryByText } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Ulid } from "id128";
import { For } from "solid-js";

import { useCollectionsSignal } from "@/rxdb/collections";
import { createSubscribeSignal, createSubscribeAllSignal } from "@/rxdb/subscribe";
import { TestWithRxDB, createCollections } from "@/rxdb/test";

export function Todo() {
  const collections$ = useCollectionsSignal();

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
    ctx.expect(container).toMatchSnapshot();

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
    ctx.expect(container).toMatchSnapshot();

    const input = container.querySelector("input")!;
    const button = container.querySelector("button")!;

    await user.click(input);
    await user.keyboard("baz");
    await findByText(container, "baz");
    ctx.expect(container).toMatchSnapshot();

    await user.click(button);
    await waitForElementToBeRemoved(() => queryByText(container.querySelector("p")!, "baz"));
    await findByText(container.querySelector("ul")!, "baz");
    ctx.expect(container).toMatchSnapshot();

    unmount();
  });
}
