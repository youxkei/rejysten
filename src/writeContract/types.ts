// Structural write-contract types shared by the Web write path and the
// (future) Worker REST write path. Deliberately firebase-free and independent
// of `keyof Schema`: ops carry `collection` as a plain string so this module
// can be bundled by both `src/` (via `@/`) and `functions/` (via relative
// import) without pulling in the firebase SDK. See
// docs/external-write-path-refactoring.md §「型共有の問題（解決）」.
export type WriteOp =
  | { type: "set"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "update"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "delete"; collection: string; id: string };

export type Selection = Record<string, string>;
