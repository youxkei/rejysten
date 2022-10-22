import { Ulid } from "id128";
import { For } from "solid-js";

import { collections, subscribe } from "@/rxdb";

export function Todo() {
  const todos = subscribe(() => collections()?.todos.find(), []);

  const editor = subscribe(
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
