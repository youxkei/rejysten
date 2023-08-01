import type { ListItem } from "@/services/rxdb/collections/listItem";

// export type ListItemFixture = [string, ListItemFixture[]] | string;
export type ListItemFixture = [string, ListItemFixture[]?, { text?: string }?];

export function makeListItems(parentId: string, updatedAt: number, fixtures: ListItemFixture[]): ListItem[] {
  const listItems = fixtures.map((fixture) => makeListItem(parentId, updatedAt, fixture));

  for (let i = 0; i < listItems.length; i++) {
    if (i - 1 >= 0) {
      listItems[i][0].prevId = listItems[i - 1][0].id;
    }

    if (i + 1 < listItems.length) {
      listItems[i][0].nextId = listItems[i + 1][0].id;
    }
  }

  return listItems.flat().sort((a, b) => a.id.localeCompare(b.id));
}

function makeListItem(parentId: string, updatedAt: number, [id, children, options]: ListItemFixture): ListItem[] {
  return [{ id, text: options?.text ?? id, prevId: "", nextId: "", parentId, updatedAt }, ...makeListItems(id, updatedAt, children ?? [])];
}
