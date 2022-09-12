import { Ulid } from "id128";
import React from "react";

import { useSelector, useDispatch } from "./store";
import { app } from "./slice/app";
import { useRxCollections, useRxSubscribe } from "./db";

export function App() {
  const text = useSelector((state) => state.app.text);
  const dispatch = useDispatch();

  const { todoCollection } = useRxCollections();
  const todos = useRxSubscribe(
    React.useMemo(() => todoCollection.find(), [todoCollection])
  );

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(app.actions.updateText({ text: event.target.value }));
  };

  const onClick = () => {
    const id = Ulid.generate();

    todoCollection.insert({
      todoId: id.toCanonical(),
      text: text,
      updatedAt: id.time.getTime(),
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
