import { type WriteOp } from "./types";

// Derives the undo operations for a batch of forward ops. `oldValues` holds the
// pre-write document state, keyed by `${collection}/${id}` and already stripped
// of id/createdAt/updatedAt by the caller. The inverse of a set is a delete; the
// inverse of an update restores only the fields the forward op touched; the
// inverse of a delete re-creates the whole document. Ops with no captured old
// value produce no inverse (undo is best-effort when the pre-state is unknown).
// The result is reversed so undo replays writes in the opposite order.
export function deriveInverseOps(forwardOps: WriteOp[], oldValues: Map<string, Record<string, unknown>>): WriteOp[] {
  const inverseOps: WriteOp[] = [];

  for (const fwd of forwardOps) {
    const key = `${fwd.collection}/${fwd.id}`;

    switch (fwd.type) {
      case "set":
        inverseOps.push({ type: "delete", collection: fwd.collection, id: fwd.id });
        break;

      case "update": {
        const oldData = oldValues.get(key);
        if (oldData) {
          const inverseData: Record<string, unknown> = {};
          for (const field of Object.keys(fwd.data)) {
            if (field in oldData) {
              inverseData[field] = oldData[field];
            }
          }
          inverseOps.push({ type: "update", collection: fwd.collection, id: fwd.id, data: inverseData });
        }
        break;
      }

      case "delete": {
        const oldData = oldValues.get(key);
        if (oldData) {
          inverseOps.push({ type: "set", collection: fwd.collection, id: fwd.id, data: oldData });
        }
        break;
      }
    }
  }

  return inverseOps.reverse();
}
