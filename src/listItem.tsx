import { useRxCollections, useRxSubscribe } from "./rxdb";

export function ListItem(props: { id: string }) {
  const { id } = props;

  const { listItems } = useRxCollections();
  const listItem = useRxSubscribe(id, listItems.findOne(id));

  return null;
}
