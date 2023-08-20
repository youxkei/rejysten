import type { RxDBService } from "@/services/rxdb";
import type { CollectionNameToDocumentType } from "@/services/rxdb/collections";
import type { RxDocument } from "rxdb";

import { createRxDBServiceForTest } from "@/services/rxdb/test";

export type ActionLog = CollectionNameToDocumentType["actionLogs"];
export type ActionLogDocument = RxDocument<ActionLog>;

function getAboveFinishedLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      // use $lte instead of $lt due to a bug https://github.com/pubkey/rxdb/pull/4751
      selector: {
        id: { $lte: baseLog.id },
        startAt: { $gt: 0, $lte: baseLog.startAt },
        endAt: { $gt: 0 },
      },
      sort: [{ startAt: "desc" }, { id: "desc" }],
    })
    .exec();
}

function getBelowFinishedLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: {
        id: { $gt: baseLog.id },
        startAt: { $gt: 0, $gte: baseLog.startAt },
        endAt: { $gt: 0 },
      },
      sort: [{ startAt: "asc" }],
    })
    .exec();
}

function getAboveOngoingLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      // use $lte instead of $lt due to a bug https://github.com/pubkey/rxdb/pull/4751
      selector: {
        id: { $lte: baseLog.id },
        startAt: { $gt: 0, $lte: baseLog.startAt },
        endAt: 0,
      },
      sort: [{ startAt: "desc" }, { id: "desc" }],
    })
    .exec();
}

function getBelowOngoingLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: {
        id: { $gt: baseLog.id },
        startAt: { $gte: baseLog.startAt },
        endAt: 0,
      },
      sort: [{ startAt: "asc" }],
    })
    .exec();
}

function getAboveTentativeLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      // use $lte instead of $lt due to a bug https://github.com/pubkey/rxdb/pull/4751
      selector: { id: { $lte: baseLog.id }, startAt: 0 },
      sort: [{ id: "desc" }],
    })
    .exec();
}

function getBelowTentativeLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      // use $gte instead of $gt due to a bug https://github.com/pubkey/rxdb/pull/4751
      selector: { id: { $gte: baseLog.id }, startAt: 0 },
    })
    .exec();
}

function getLastFinishedLog({ collections }: RxDBService) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: 0 }, endAt: { $gt: 0 } },
      sort: [{ startAt: "desc" }, { id: "desc" }],
    })
    .exec();
}

function getFirstOngoingLog({ collections }: RxDBService) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: 0 }, endAt: 0 },
      sort: [{ startAt: "asc" }],
    })
    .exec();
}

function getLastOngoingLog({ collections }: RxDBService) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: 0 }, endAt: 0 },
      sort: [{ startAt: "desc" }, { id: "desc" }],
    })
    .exec();
}

function getFirstTentativeLog({ collections }: RxDBService) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: 0 },
    })
    .exec();
}

export async function getAboveLog(service: RxDBService, baseLog: ActionLogDocument) {
  if (baseLog.startAt === 0) {
    const aboveTentativeLog = await getAboveTentativeLog(service, baseLog);
    if (aboveTentativeLog) return aboveTentativeLog;

    const lastOngoingLog = await getLastOngoingLog(service);
    if (lastOngoingLog) return lastOngoingLog;

    return await getLastFinishedLog(service);
  }

  if (baseLog.endAt === 0) {
    const aboveOngoingLog = await getAboveOngoingLog(service, baseLog);
    if (aboveOngoingLog) return aboveOngoingLog;

    return await getLastFinishedLog(service);
  }

  return await getAboveFinishedLog(service, baseLog);
}

if (import.meta.vitest) {
  describe("getAboveLog", () => {
    describe.each([
      {
        name: "finished log, no above log",
        actionLogs: [{ id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 }],
        currentActionLogId: "1",
        wantActionLogId: undefined,
      },
      {
        name: "finished log, has an above finished log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "2",
      },
      {
        name: "finished log, has above finished logs with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 2, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 9, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 9, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "1",
      },
      {
        name: "finished log, has above and below finished logs with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
          { id: "4", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
          { id: "5", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
          { id: "6", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
        ],
        currentActionLogId: "5",
        wantActionLogId: "4",
      },
      {
        name: "ongoing log, no above ongoing log, no finished log",
        actionLogs: [{ id: "1", text: "", startAt: 3, endAt: 0, updatedAt: 9 }],
        currentActionLogId: "1",
        wantActionLogId: undefined,
      },
      {
        name: "ongoing log, no above ongoing log, has the last finished log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "2",
      },
      {
        name: "ongoing log, no above ongoing log, has the last finished log with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 2, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 9, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "1",
      },
      {
        name: "ongoing log, no above ongoing log, has the last finished log with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
          { id: "4", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
          { id: "5", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "5",
        wantActionLogId: "4",
      },
      {
        name: "ongoing log, has an above ongoing log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "2",
      },
      {
        name: "ongoing log, has above ongoing logs with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "1",
      },
      {
        name: "ongoing log, has above and below ongoing logs with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
          { id: "4", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
          { id: "5", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
          { id: "6", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "5",
        wantActionLogId: "4",
      },
      {
        name: "tentative log, no above tentative log, no ongoing log, no finished log",
        actionLogs: [{ id: "1", text: "", startAt: 0, endAt: 0, updatedAt: 9 }],
        currentActionLogId: "1",
        wantActionLogId: undefined,
      },
      {
        name: "tentative log, no above tentative log, no ongoing log, has the last finished log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "2",
      },
      {
        name: "tentative log, no above tentative log, no ongoing log, has the last finished log with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 2, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 9, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "1",
      },
      {
        name: "tentative log, no above tentative log, no ongoing log, has the last finished log with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
          { id: "4", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
          { id: "5", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "5",
        wantActionLogId: "4",
      },
      {
        name: "tentative log, no above tentative log, has the last ongoing log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "2",
      },
      {
        name: "tentative log, no above tentative log, has the last ongoing log with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "1",
      },
      {
        name: "tentative log, no above tentative log, has the last ongoing log with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
          { id: "4", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
          { id: "5", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "5",
        wantActionLogId: "4",
      },
      {
        name: "tentative log, has an above tentative log",
        actionLogs: [
          { id: "1", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "3",
        wantActionLogId: "2",
      },
    ])("$name", ({ actionLogs, currentActionLogId, wantActionLogId }) => {
      test("assert", async (test) => {
        const service = await createRxDBServiceForTest(test.meta.id);

        await service.collections.actionLogs.bulkInsert(actionLogs);
        const currentActionLog = (await service.collections.actionLogs.findOne(currentActionLogId).exec())!;

        test.expect((await getAboveLog(service, currentActionLog))?.id).toBe(wantActionLogId);
      });
    });
  });
}

export async function getBelowLog(service: RxDBService, baseLog: ActionLogDocument) {
  if (baseLog.startAt === 0) {
    return await getBelowTentativeLog(service, baseLog);
  }

  if (baseLog.endAt === 0) {
    const belowOngoingLog = await getBelowOngoingLog(service, baseLog);
    if (belowOngoingLog) return belowOngoingLog;

    return await getFirstTentativeLog(service);
  }

  const belowFinishedLog = await getBelowFinishedLog(service, baseLog);
  if (belowFinishedLog) return belowFinishedLog;

  const firstOngoingLog = await getFirstOngoingLog(service);
  if (firstOngoingLog) return firstOngoingLog;

  return await getFirstTentativeLog(service);
}

if (import.meta.vitest) {
  describe("getBelowLog", () => {
    describe.each([
      {
        name: "tentative log, no below tentative log",
        actionLogs: [{ id: "1", text: "", startAt: 0, endAt: 0, updatedAt: 9 }],
        currentActionLogId: "1",
        wantActionLogId: undefined,
      },
      {
        name: "tentative log, has a below tentative log",
        actionLogs: [
          { id: "1", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "ongoing log, no below ongoing log, no tentative log",
        actionLogs: [{ id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 }],
        currentActionLogId: "1",
        wantActionLogId: undefined,
      },
      {
        name: "ongoing log, no below ongoing log, has the first tentative log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "ongoing log, has a below ongoing log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "ongoing log, has below ongoing logs with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "3",
      },
      {
        name: "ongoing log, has above and below ongoing logs with same startAt",
        actionLogs: [
          { id: "0", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "4", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "5", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "finished log, no below finished log, no ongoing log, no tentative log",
        actionLogs: [{ id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 }],
        currentActionLogId: "1",
        wantActionLogId: undefined,
      },
      {
        name: "finished log, no below finished log, no ongoing log, has the first tentative log",
        actionLogs: [
          { id: "1", text: "", startAt: 9, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "finished log, no below finished log, has the first ongoing log",
        actionLogs: [
          { id: "1", text: "", startAt: 9, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "finished log, no below finished log, has the first ongoing log with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 9, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "3",
      },
      {
        name: "finished log, no below finished log, has the first ongoing log with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 9, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "4", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "5", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "finished log, has a below finished log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
      {
        name: "finished log, has a below finished log with reversed startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 3, endAt: 9, updatedAt: 9 },
          { id: "3", text: "", startAt: 2, endAt: 9, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "3",
      },
      {
        name: "finished log, has above and below finished logs with same startAt",
        actionLogs: [
          { id: "0", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "4", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "5", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
        ],
        currentActionLogId: "1",
        wantActionLogId: "2",
      },
    ])("$name", ({ actionLogs, currentActionLogId, wantActionLogId }) => {
      test("assert", async (test) => {
        const service = await createRxDBServiceForTest(test.meta.id);

        await service.collections.actionLogs.bulkInsert(actionLogs);
        const currentActionLog = (await service.collections.actionLogs.findOne(currentActionLogId).exec())!;

        test.expect((await getBelowLog(service, currentActionLog))?.id).toBe(wantActionLogId);
      });
    });
  });
}

export function queryFinishedLogs({ collections }: RxDBService) {
  return collections.actionLogs.find({
    selector: { startAt: { $gt: 0 }, endAt: { $gt: 0 } },
    sort: [{ startAt: "asc" }],
  });
}

if (import.meta.vitest) {
  describe("queryFinishedLogs", () => {
    describe.each([
      {
        name: "no finished log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        wantActionLogIds: [],
      },
      {
        name: "has multiple finished logs",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 2, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 3, updatedAt: 9 },
        ],
        wantActionLogIds: ["1", "2", "3"],
      },
      {
        name: "has multiple finished logs with reverse startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 3, endAt: 9, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 9, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 9, updatedAt: 9 },
        ],
        wantActionLogIds: ["3", "2", "1"],
      },
      {
        name: "has multiple finished logs with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
        ],
        wantActionLogIds: ["1", "2", "3"],
      },
    ])("$name", ({ actionLogs, wantActionLogIds }) => {
      test("assert", async (test) => {
        const service = await createRxDBServiceForTest(test.meta.id);

        await service.collections.actionLogs.bulkInsert(actionLogs);
        const finishedLogs = await queryFinishedLogs(service).exec();

        test.expect(finishedLogs.map((log) => log.id)).toEqual(wantActionLogIds);
      });
    });
  });
}

export function queryOngoingLogs({ collections }: RxDBService) {
  return collections.actionLogs.find({
    selector: { startAt: { $gt: 0 }, endAt: 0 },
    sort: [{ startAt: "asc" }],
  });
}

if (import.meta.vitest) {
  describe("queryOngoingLogs", () => {
    describe.each([
      {
        name: "no ongoing log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        wantActionLogIds: [],
      },
      {
        name: "has multiple ongoing logs",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
        ],
        wantActionLogIds: ["1", "2", "3"],
      },
      {
        name: "has multiple ongoing logs with reverse startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 3, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 2, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
        ],
        wantActionLogIds: ["3", "2", "1"],
      },
      {
        name: "has multiple ongoing logs with same startAt",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
        ],
        wantActionLogIds: ["1", "2", "3"],
      },
    ])("$name", ({ actionLogs, wantActionLogIds }) => {
      test("assert", async (test) => {
        const service = await createRxDBServiceForTest(test.meta.id);

        await service.collections.actionLogs.bulkInsert(actionLogs);
        const ongoingLogs = await queryOngoingLogs(service).exec();

        test.expect(ongoingLogs.map((log) => log.id)).toEqual(wantActionLogIds);
      });
    });
  });
}

export function queryTentativeLogs({ collections }: RxDBService) {
  return collections.actionLogs.find({ selector: { startAt: 0 } });
}

if (import.meta.vitest) {
  describe("queryTentativeLogs", () => {
    describe.each([
      {
        name: "no tentative log",
        actionLogs: [
          { id: "1", text: "", startAt: 1, endAt: 1, updatedAt: 9 },
          { id: "2", text: "", startAt: 1, endAt: 0, updatedAt: 9 },
        ],
        wantActionLogIds: [],
      },
      {
        name: "has multiple tentative logs",
        actionLogs: [
          { id: "1", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "2", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
          { id: "3", text: "", startAt: 0, endAt: 0, updatedAt: 9 },
        ],
        wantActionLogIds: ["1", "2", "3"],
      },
    ])("$name", ({ actionLogs, wantActionLogIds }) => {
      test("assert", async (test) => {
        const service = await createRxDBServiceForTest(test.meta.id);

        await service.collections.actionLogs.bulkInsert(actionLogs);
        const tentativeLogs = await queryTentativeLogs(service).exec();

        test.expect(tentativeLogs.map((log) => log.id)).toEqual(wantActionLogIds);
      });
    });
  });
}
