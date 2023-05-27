import type { RxDBService } from "..";
import type { CollectionNameToDocumentType } from "@/services/rxdb/collections";
import type { RxDocument } from "rxdb";

export type ActionLog = CollectionNameToDocumentType["actionLogs"];
export type ActionLogDocument = RxDocument<ActionLog>;

function getAboveFinishedLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: 0, $lt: baseLog.startAt }, endAt: { $gt: 0 } },
      sort: [{ startAt: "desc" }],
    })
    .exec();
}

function getBelowFinishedLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: baseLog.startAt }, endAt: { $gt: 0 } },
      sort: [{ startAt: "asc" }],
    })
    .exec();
}

function getAboveOngoingLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: 0, $lt: baseLog.startAt }, endAt: 0 },
      sort: [{ startAt: "desc", id: "desc" }],
    })
    .exec();
}

function getBelowOngoingLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: baseLog.startAt }, endAt: 0 },
      sort: [{ startAt: "asc" }],
    })
    .exec();
}

function getAboveTentativeLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: { id: { $lt: baseLog.id }, startAt: 0 },
      sort: [{ id: "desc" }],
    })
    .exec();
}

function getLastFinishedLog({ collections }: RxDBService) {
  return collections.actionLogs
    .findOne({
      selector: { startAt: { $gt: 0 }, endAt: { $gt: 0 } },
      sort: [{ endAt: "desc", id: "desc" }],
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
      sort: [{ startAt: "desc", id: "desc" }],
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

function getBelowTentativeLog({ collections }: RxDBService, baseLog: ActionLogDocument) {
  return collections.actionLogs
    .findOne({
      selector: { id: { $gt: baseLog.id }, startAt: 0 },
      sort: [{ startAt: "desc" }],
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
