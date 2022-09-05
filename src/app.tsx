import React from "react";

import { useSelector, useDispatch } from "./store";
import { app } from "./slice/app";

export function App() {
  const text = useSelector((state) => state.app.text);
  const dispatch = useDispatch();

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(app.actions.updateText({ text: event.target.value }));
  };

  return (
    <>
      <h1>{text}</h1>
      <input value={text} onChange={onChange} />
    </>
  );
}
