import { Ulid } from "id128";
import React from "react";

import { useSelector, useDispatch } from "./store";
import { app } from "./slice/app";
import { useRxCollections, useRxSubscribe } from "./rxdb";
import { useRxSync } from "./rxdb/useRxSync";
import { RxdbSyncConfig } from "./rxdbSyncConfig";

export function App() {
  useRxSync();

  const text = useSelector((state) => state.app.text);
  const dispatch = useDispatch();

  const collections = useRxCollections();
  const todos = useRxSubscribe("todos", collections.todos.find());

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
