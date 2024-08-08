import { ErrorWithFields } from "@/error";

export class InconsistentError extends ErrorWithFields {}

export class TransactionAborted extends Error {}
