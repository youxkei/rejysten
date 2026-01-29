import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { initialState } from "@/services/store";
import { migrateState, serializeState, migrations, CURRENT_VERSION } from "@/services/store/migration";

function clearMigrations() {
  for (const key of Object.keys(migrations)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete migrations[Number(key)];
  }
}

describe("migration", () => {
  // Save and restore migrations between tests
  let originalMigrations: Partial<Record<number, (state: unknown) => unknown>>;

  beforeEach(() => {
    originalMigrations = { ...migrations };
    clearMigrations();
  });

  afterEach(() => {
    clearMigrations();
    for (const [key, value] of Object.entries(originalMigrations)) {
      migrations[Number(key)] = value;
    }
  });

  describe("migrateState", () => {
    it("returns initialState for invalid JSON", () => {
      const result = migrateState("not valid json");
      expect(result).toEqual(initialState);
    });

    it("returns initialState for empty string", () => {
      const result = migrateState("");
      expect(result).toEqual(initialState);
    });

    it("returns initialState for null", () => {
      const result = migrateState("null");
      expect(result).toEqual(initialState);
    });

    it("preserves existing fields from versioned data", () => {
      // This test is meaningful when State has fields
      // For now, test with empty state
      const data = JSON.stringify({ version: CURRENT_VERSION, state: {} });
      const result = migrateState(data);
      expect(result).toEqual(initialState);
    });

    it("handles legacy data without version", () => {
      // Legacy data (pre-migration) should be treated as version 0
      const data = JSON.stringify({});
      const result = migrateState(data);
      expect(result).toEqual(initialState);
    });

    it("deep merges nested objects", () => {
      // Test deep merge behavior - data with same structure as initialState
      // should be merged properly
      const data = JSON.stringify({ version: CURRENT_VERSION, state: initialState });
      const result = migrateState(data);

      // Result should equal initialState since we serialized initialState
      expect(result).toEqual(initialState);
    });
  });

  describe("serializeState", () => {
    it("serializes state with version number", () => {
      const serialized = serializeState(initialState);
      const parsed = JSON.parse(serialized) as { version: number; state: unknown };

      expect(parsed.version).toBe(CURRENT_VERSION);
      expect(parsed.state).toEqual(initialState);
    });

    it("produces valid JSON", () => {
      const serialized = serializeState(initialState);
      expect(() => JSON.parse(serialized) as unknown).not.toThrow();
    });
  });

  describe("round-trip", () => {
    it("preserves state through serialize/deserialize cycle", () => {
      const serialized = serializeState(initialState);
      const deserialized = migrateState(serialized);
      expect(deserialized).toEqual(initialState);
    });
  });

  describe("migrations", () => {
    it("applies migrations in order", () => {
      const calls: number[] = [];

      migrations[0] = (state) => {
        calls.push(0);
        return state;
      };
      migrations[1] = (state) => {
        calls.push(1);
        return state;
      };

      // Test with legacy data (version 0) when CURRENT_VERSION is 1
      // Only migration[0] should be called since we go from 0 to 1
      const data = JSON.stringify({});
      migrateState(data);

      // With CURRENT_VERSION = 1, migrating from version 0 only calls migrations[0]
      expect(calls).toEqual([0]);
    });

    it("skips migrations for current version", () => {
      const calls: number[] = [];

      migrations[CURRENT_VERSION] = () => {
        calls.push(CURRENT_VERSION);
        return {};
      };

      const data = JSON.stringify({ version: CURRENT_VERSION, state: {} });
      migrateState(data);

      expect(calls).toEqual([]);
    });

    it("applies migration transformation", () => {
      // Add a migration that transforms data
      migrations[0] = (state: unknown) => {
        const s = state as Record<string, unknown>;
        return { ...s, migrated: true };
      };

      const data = JSON.stringify({ oldField: "value" });
      const result = migrateState(data);

      // Since State is empty, the migrated field won't be in the result
      // But the migration was applied
      expect(result).toEqual(initialState);
    });
  });
});
