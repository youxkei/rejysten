import { type FirestoreFields, type FirestoreValue } from "./types";

// Timestamps are carried as JS `Date` in the firebase-free layer (the SDK's
// `Timestamp` is not available here). `Date` → `timestampValue` uses millisecond
// precision; Firestore canonicalises the stored instant, so round-tripping
// against SDK-written docs compares equal.
export function toValue(value: unknown): FirestoreValue {
  if (value instanceof Date) return { timestampValue: value.toISOString() };

  switch (typeof value) {
    case "string":
      return { stringValue: value };
    case "boolean":
      return { booleanValue: value };
    case "number":
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case "object": {
      if (value === null) return { nullValue: null };
      if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
      return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
    }
  }

  throw new Error(`Cannot encode value of type "${typeof value}" to a Firestore REST value`);
}

export function encodeFields(data: Record<string, unknown>): FirestoreFields {
  const fields: FirestoreFields = {};
  for (const key of Object.keys(data)) {
    fields[key] = toValue(data[key]);
  }
  return fields;
}

export function fromValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fromValue);
  throw new Error("Unknown Firestore REST value");
}

export function decodeFields(fields: FirestoreFields): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    data[key] = fromValue(fields[key]);
  }
  return data;
}
