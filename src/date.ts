import { Timestamp } from "firebase/firestore";

export function NewDate(): Date {
  return new Date();
}

export function DateNow(): number {
  return Date.now();
}

export function TimestampNow(): Timestamp {
  return Timestamp.now();
}
