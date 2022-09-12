import type React from "react";

import { Ulid } from "id128";

import { useSelector, useDispatch } from "./store";
import { app } from "./slice/app";
import { useRxCollections, useRxSubscribe } from "./db";

export function App() {
  const text = useSelector((state) => state.app.text);
  const dispatch = useDispatch();

  const { todoCollection } = useRxCollections();
  const todos = useRxSubscribe(todoCollection.find(), []);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(app.actions.updateText({ text: event.target.value }));
  };

  const onClick = () => {
    todoCollection.insert({
      todoId: Ulid.generate().toCanonical(),
      text: text,
      updatedAt: Date.now(),
    });
  };

  return (
    <>
      <ul>
        {todos.map((todo) => (
          <li key={todo.todoId}>{todo.text}</li>
        ))}
      </ul>
      <input value={text} onChange={onChange} />
      <button onClick={onClick}>add</button>
    </>
  );
}
