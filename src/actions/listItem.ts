import { RxCollection, RxDocument } from "rxdb";

import { Collections } from "@/rxdb/collections";
import { ListItem } from "@/domain/listItem";

export async function addPrevSibling(
  collections: Collections,
  baseItem: RxDocument<ListItem>,
  newItem: ListItem
) {
  const listItems = collections.listItems;
  const prevItem = await listItems.findOne(baseItem.prevId).exec();

  if (prevItem === null) {
    newItem.prevId = "";
    newItem.nextId = baseItem.id;

    let newItemDocument: RxDocument<ListItem>;

    try {
      newItemDocument = await listItems.insert(newItem);
    } catch (error) {
      console.error(`failed to add newItem: ${error}`);

      return;
    }

    try {
      await baseItem.update({ $set: { prevId: newItem.id } });
    } catch (error) {
      console.error(`failed to update prevId of baseItem: ${error}`);

      try {
        await newItemDocument.remove();
      } catch (error) {
        console.error(`failed to remove newItem: ${error}`);
      }
    }
  } else {
    if (prevItem.nextId !== baseItem.id) {
      console.error(
        `next item of prevItem is not baseItem. next item of prevItem is ${prevItem.nextId}`
      );

      return;
    }

    const originalPrevItemNextId = prevItem.nextId;

    newItem.prevId = prevItem.id;
    newItem.nextId = baseItem.id;

    let newItemDocument: RxDocument<ListItem>;

    try {
      newItemDocument = await listItems.insert(newItem);
    } catch (error) {
      console.error(`failed to add newItem: ${error}`);

      return;
    }

    try {
      await prevItem.update({ $set: { nextId: newItem.id } });
    } catch (error) {
      console.error(`failed to update nextId of prevItem: ${error}`);

      try {
        await newItemDocument.remove();
      } catch (error) {
        console.error(`failed to remove newItem: ${error}`);

        return;
      }
    }

    try {
      await baseItem.update({ $set: { prevId: newItem.id } });
    } catch (error) {
      console.error(`failed to update prevId of baseItem: ${error}`);

      try {
        await newItemDocument.remove();
      } catch (error) {
        console.error(`failed to remove newItem: ${error}`);
      }

      try {
        await prevItem.update({ $set: { nextID: originalPrevItemNextId } });
      } catch (error) {
        console.error(
          `failed to revert change of nextId of prevItem: ${error}`
        );
      }
    }
  }
}
