import { describe, expect, it } from "vitest";

import { buildTestCaseCliArgs, buildTestCasePattern, runTestCaseCli } from "../scripts/test-case.mjs";

describe("scripts/test-case.mjs pattern", () => {
  it("normalizes NFC titles", () => {
    expect(buildTestCasePattern("カ\u3099")).toBe(buildTestCasePattern("ガ"));
  });

  it("escapes regex characters and matches the full title suffix", () => {
    const pattern = new RegExp(buildTestCasePattern("a+b (draft) / end") ?? "");
    expect(pattern.test("prefix a+b (draft) / end")).toBe(true);
    expect(pattern.test("prefix a+b (draft) / end extra")).toBe(false);
  });

  it("supports Japanese and emoji titles", () => {
    const pattern = new RegExp(buildTestCasePattern("検索 😀") ?? "");
    expect(pattern.test("Search: 検索 😀")).toBe(true);
  });

  it("returns undefined for an empty title so the CLI can print usage", () => {
    expect(buildTestCasePattern("   ")).toBeUndefined();
  });
});

describe("scripts/test-case.mjs CLI", () => {
  it("exits with usage when title is empty", () => {
    const calls = [];

    runTestCaseCli([], {
      spawn: () => {
        throw new Error("spawn should not be called");
      },
      error: (message) => calls.push(["error", message]),
      exit: (code) => calls.push(["exit", code]),
      kill: () => undefined,
      pid: 123,
    });

    expect(calls).toEqual([
      ["error", 'Usage: pnpm test/case "test title"'],
      ["exit", 1],
    ]);
  });

  it("spawns pnpm test with an anchored title pattern", () => {
    expect(buildTestCaseCliArgs(["a+b", "draft"])).toEqual([
      "test",
      "-t",
      buildTestCasePattern("a+b draft"),
    ]);
  });

  it("propagates child exit codes and signals", () => {
    const calls = [];
    let onExit;

    runTestCaseCli(["signal test"], {
      spawn: (command, args, options) => {
        calls.push(["spawn", command, args, options]);
        return {
          on: (_event, callback) => {
            onExit = callback;
          },
        };
      },
      error: (message) => calls.push(["error", message]),
      exit: (code) => calls.push(["exit", code]),
      kill: (pid, signal) => calls.push(["kill", pid, signal]),
      pid: 123,
    });

    onExit(7, null);
    onExit(null, "SIGTERM");

    expect(calls).toEqual([
      ["spawn", "pnpm", ["test", "-t", buildTestCasePattern("signal test")], { stdio: "inherit" }],
      ["exit", 7],
      ["kill", 123, "SIGTERM"],
    ]);
  });
});
