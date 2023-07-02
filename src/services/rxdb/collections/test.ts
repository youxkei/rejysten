import type { ListItem } from "@/services/rxdb/collections/listItem";

// export type ListItemFixture = [string, ListItemFixture[]] | string;
export type ListItemFixture = { id: string; children?: ListItemFixture[] };

export function makeListItems(parentId: string, fixtures: ListItemFixture[]): ListItem[] {
  const listItems = fixtures.map((fixture) => makeListItem(parentId, fixture));

  for (let i = 0; i < listItems.length; i++) {
    if (i - 1 >= 0) {
      listItems[i][0].prevId = listItems[i - 1][0].id;
    }

    if (i + 1 < listItems.length) {
      listItems[i][0].nextId = listItems[i + 1][0].id;
    }
  }

  return listItems.flat();
}

export function makeListItem(parentId: string, fixture: ListItemFixture): ListItem[] {
  const { id: item, children } = fixture;
  return [{ id: item, text: item, prevId: "", nextId: "", parentId, updatedAt: 0 }, ...makeListItems(item, children ?? [])];
}
