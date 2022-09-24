import { useRxCollections, useRxSubscribe } from "./rxdb";
import { BulletList } from "./bulletList";
import { Bullet } from "./bullet";

export function ItemList({ id }: { id: string }) {
  return (
    <BulletList
      bullet={<Bullet />}
      item={<ItemListItem id={id} />}
      child={<ItemListChildren parentId={id} />}
    />
  );
}

export function ItemListItem({ id }: { id: string }) {
  const { listItems } = useRxCollections();
  const listItem = useRxSubscribe(id, listItems.findOne(id));

  if (listItem) {
    return <span>{listItem.text}</span>;
  } else {
    return null;
  }
}

export function ItemListChildren({ parentId }: { parentId: string }) {
  const { listItems } = useRxCollections();
  const children = useRxSubscribe(
    `${parentId}.children`,
    listItems.find({ selector: { parentId } }),
    (lhss, rhss) => {
      if (lhss.length !== rhss.length) {
        return false;
      } else {
        lhss.forEach((lhs, i) => {
          if (lhs.id !== rhss[i].id) {
            return false;
          }
        });

        return true;
      }
    }
  );

  return (
    <>
      {children.map((child) => (
        <ItemList key={child.id} id={child.id} />
      ))}
    </>
  );
}
