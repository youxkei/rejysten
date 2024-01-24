import type { Table } from "dexie";

import { Dexie } from "dexie";
import dexieCloud from "dexie-cloud-addon";

export class DB extends Dexie {
  items!: Table<
    {
      id: string;

      text: string;

      prevId: string;
      nextId: string;
    },
    "id"
  >;

  constructor(tabaseName: string) {
    super(tabaseName, { addons: [dexieCloud] });
    this.version(1).stores({
      items: "id, prevId, nextId",
    });

    this.on("populate", () => {
      this.on("ready", () => {
        void this.items.bulkAdd([
          {
            id: "1",
            text: "first",
            prevId: "",
            nextId: "2",
          },
          {
            id: "2",
            text: "second",
            prevId: "1",
            nextId: "3",
          },
          {
            id: "3",
            text: "third",
            prevId: "2",
            nextId: "",
          },
        ]);
      });
    });
  }
}
