import type { ChangeEvent } from "react";

import { useSelector, useDispatch } from "@/store";
import { app } from "@/slices/app";
import { useRxSync } from "@/rxdb";
import { RxdbSyncConfig } from "@/components/rxdbSyncConfig";
import { ItemList } from "@/components/itemList";

export function App() {
  useRxSync();

  const id = useSelector((state) => state.app.id);
  const dispatch = useDispatch();

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch(app.actions.updateId({ id: event.target.value }));
  };

  return (
    <>
      {id === "" ? null : <ItemList id={id} />}
      <input value={id} onChange={onChange} />
      <RxdbSyncConfig />
    </>
  );
}
