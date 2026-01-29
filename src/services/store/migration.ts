import { type State, initialState } from "@/services/store";

export const CURRENT_VERSION = 1;

type VersionedState = {
  version: number;
  state: unknown;
};

type Migration = (state: unknown) => unknown;

// Registry of migrations: key is the version to migrate FROM
// e.g., migrations[1] migrates from version 1 to version 2
export const migrations: Partial<Record<number, Migration>> = {};

function isVersionedState(data: unknown): data is VersionedState {
  return (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    typeof (data as VersionedState).version === "number" &&
    "state" in data
  );
}

type DeepMergeable = Record<string, unknown>;

function deepMerge(target: DeepMergeable, source: DeepMergeable): DeepMergeable {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Both are objects, recursively merge
      result[key] = deepMerge(targetValue as DeepMergeable, sourceValue as DeepMergeable);
    } else if (key in target) {
      // Only copy if the key exists in target (initialState)
      result[key] = sourceValue;
    }
    // If key doesn't exist in target, it's a removed field - don't copy
  }

  return result;
}

function applyMigrations(state: unknown, fromVersion: number): unknown {
  let currentState = state;

  for (let version = fromVersion; version < CURRENT_VERSION; version++) {
    const migration = migrations[version];
    if (migration !== undefined) {
      currentState = migration(currentState);
    }
  }

  return currentState;
}

export function migrateState(rawData: string): State {
  try {
    const parsed: unknown = JSON.parse(rawData);

    if (!isVersionedState(parsed)) {
      // Data is not versioned - treat as legacy (version 0)
      // This handles pre-migration data
      const migrated = applyMigrations(parsed, 0);
      return deepMerge(
        structuredClone(initialState) as unknown as DeepMergeable,
        migrated as DeepMergeable,
      ) as unknown as State;
    }

    const { version, state } = parsed;
    const migrated = applyMigrations(state, version);
    return deepMerge(
      structuredClone(initialState) as unknown as DeepMergeable,
      migrated as DeepMergeable,
    ) as unknown as State;
  } catch {
    // Invalid JSON or other parsing error - return initial state
    return structuredClone(initialState);
  }
}

export function serializeState(state: State): string {
  const versionedState: VersionedState = {
    version: CURRENT_VERSION,
    state,
  };
  return JSON.stringify(versionedState);
}
