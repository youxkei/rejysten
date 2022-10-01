import type { ChangeEvent } from "react";

import { Ulid } from "id128";

import { useSelector, useDispatch } from "@/store";
import { app } from "@/slices/app";
import { useRxSync, useRxCollections, useRxSubscribe } from "@/rxdb";
import { RxdbSyncConfig } from "@/components/rxdbSyncConfig";

export function Todo() {
  useRxSync();

  const text = useSelector((state) => state.app.text);
  const dispatch = useDispatch();

  const collections = useRxCollections();
  const todos = useRxSubscribe("todos", collections.todos.find());

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch(app.actions.updateText({ text: event.target.value }));

    collections.editors.upsert({
      id: "const",
      text: event.target.value,
      updatedAt: Date.now(),
    });
  };

  const onClick = () => {
    const id = Ulid.generate();

    collections.todos.insert({
      id: id.toCanonical(),
      text: text,
      updatedAt: id.time.getTime(),
    });
  };

  return (
    <>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
      <input value={text} onChange={onChange} />
      <button onClick={onClick}>add</button>
      <RxdbSyncConfig />
    </>
  );
}
