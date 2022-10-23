import { Ulid } from "id128";
import { For } from "solid-js";

import { useCollections, useSubscribe } from "@/rxdb";

export function Todo() {
  const collections = useCollections();

  const todos = useSubscribe(() => collections()?.todos.find(), []);

  const editor = useSubscribe(
    () => collections()?.editors.findOne("const"),
    undefined
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
