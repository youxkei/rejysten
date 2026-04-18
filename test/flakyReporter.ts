import type { Reporter, TestCase } from "vitest/node";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const LOG_PATH = ".flaky-tests/log.ndjson";

export default class FlakyReporter implements Reporter {
  private configName: string;

  constructor(options: { configName: string }) {
    this.configName = options.configName;
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result();

    if (result.state !== "passed" && result.state !== "failed") return;

    const errors = result.errors ?? [];
    if (result.state === "passed" && errors.length === 0) return;

    const record = {
      timestamp: new Date().toISOString(),
      config: this.configName,
      file: testCase.module.moduleId,
      name: testCase.fullName,
      status: result.state === "passed" ? "flaky" : "failed",
      attempts: errors.length,
      errors: errors.map((e) => ({
        message: e.message,
        stack: e.stack,
      })),
    };

    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, JSON.stringify(record) + "\n");
  }
}
