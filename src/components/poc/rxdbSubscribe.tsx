import { useRxDBService } from "@/services/rxdb";

export function RxDBSubscribe() {
  const { collections } = useRxDBService();

  async function onClick() {
    const subscriptions = [
      collections.tests.findOne("const").$.subscribe((store) => {
        console.log("test updated", store?.toJSON());
      }),
      collections.locks.findOne("const").$.subscribe((store) => {
        console.log("locks updated", store?.toJSON());
      }),
    ];

    console.log("before bulkUpsert");

    await collections.tests.bulkUpsert([{ id: "const", num: 0 }]);
    await collections.locks.bulkUpsert([{ id: "const" }]);

    console.log("after bulkUpsert");

    subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  return <button onClick={onClick}>button</button>;
}
