import { waitForElementToBeRemoved } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Ulid } from "id128";
import { For } from "solid-js";

import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal, createSubscribeAllSignal } from "@/services/rxdb/subscribe";
import { keyboard, renderWithServicesForTest } from "@/services/test";

export function Todo() {
  const { collections } = useRxDBService();
  const lock = useLockService();

  const todos$ = createSubscribeAllSignal(() => collections.todos.find());

  const editor$ = createSubscribeSignal(() => collections.editors.findOne("const"));

  const text$ = createSignalWithLock(lock, () => editor$()?.text ?? "", "", true);

  const onInput = (event: { target: HTMLInputElement }) => {
    void runWithLock(lock, () =>
      collections.editors.upsert({
        id: "const",
        text: event.target.value,
        updatedAt: Date.now(),
      })
    );
  };

  const onClick = async () => {
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
        <For each={todos$()}>{(todo) => <li>{todo.text}</li>}</For>
      </ul>
      <p>{text$()}</p>
      <input value={text$()} onInput={onInput} />
      <button onClick={onClick}>add</button>
    </div>
  );
}

if (import.meta.vitest) {
  test("renders", async (ctx) => {
    const { container, unmount } = await renderWithServicesForTest(
      ctx.meta.id,
      (props) => (
        <>
          <Todo />
          {props.children}
        </>
      ),
      ({ rxdb: { collections } }) =>
        collections.todos.bulkInsert([
          { id: "001", text: "foo", updatedAt: 1 },
          { id: "002", text: "bar", updatedAt: 1 },
        ])
    );

    ctx.expect(container).toMatchSnapshot();

    unmount();
  });

  test("add todos", async (ctx) => {
    const user = userEvent.setup();
    const { container, unmount, lock, findByText, queryByText } = await renderWithServicesForTest(
      ctx.meta.id,
      (props) => (
        <>
          <Todo />
          {props.children}
        </>
      ),
      async ({ rxdb: { collections }, store: { updateStore } }) => {
        await collections.todos.bulkInsert([
          { id: "001", text: "foo", updatedAt: 1 },
          { id: "002", text: "bar", updatedAt: 1 },
        ]);
        await updateStore((store) => {
          store.mode = "insert";
        });
      }
    );

    ctx.expect(container).toMatchSnapshot();

    const input = container.querySelector("input")!;
    const button = container.querySelector("button")!;

    await user.click(input);
    await keyboard(user, lock, "baz");
    await findByText("baz");

    ctx.expect(container).toMatchSnapshot();

    await user.click(button);
    await waitForElementToBeRemoved(() => queryByText("baz", { selector: "p" }));
    await findByText("baz");
    ctx.expect(container).toMatchSnapshot();

    unmount();
  });
}
