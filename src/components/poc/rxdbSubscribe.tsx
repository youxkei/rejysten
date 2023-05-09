import { useRxDBService } from "@/services/rxdb";

export function RxDBSubscribe() {
  const { collections } = useRxDBService();

  async function onClick() {
    const subscriptions = [
      collections.tests.findOne("const").$.subscribe((store) => {
        console.log("test updated", store?.toJSON());
      }),
      collections.localEvents.findOne("unlock").$.subscribe((store) => {
        console.log("unlock event emitted", store?.toJSON());
      }),
    ];

    console.log("before bulkUpsert");

    await collections.tests.bulkUpsert([{ id: "const", num: 0 }]);
    await collections.localEvents.bulkUpsert([{ id: "unlock" }]);

    console.log("after bulkUpsert");

    subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  return <button onClick={onClick}>button</button>;
}
