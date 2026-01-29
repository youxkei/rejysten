import { cleanup, waitFor } from "@solidjs/testing-library";
import { Timestamp } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { awaitPendingCallbacks } from "@/awaitableCallback";
import { baseTime, setupSearchTest } from "@/panes/search/test";
import { styles } from "@/styles.css";
import { acquireEmulator, releaseEmulator, testWithDb as it } from "@/test";

vi.mock(import("@/date"), async () => {
  return {
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
    TimestampNow: () => Timestamp.fromDate(baseTime),
  };
});

beforeAll(async () => {
  await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator();
});

afterEach(async () => {
  await awaitPendingCallbacks();
  cleanup();
});

describe("<Search />", () => {
  it("shows search input and results container", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db);

    // Check that input and results container are rendered
    const input = result.container.querySelector(`.${styles.search.input}`);
    expect(input).toBeTruthy();

    const resultsContainer = result.container.querySelector(`.${styles.search.resultsContainer}`);
    expect(resultsContainer).toBeTruthy();
  });

  it("shows results for valid queries (>= 2 chars)", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "se" });

    // Wait for results to appear
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  it("shows no results for queries < 2 chars", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "s" });

    // Wait a bit and check no results appear
    await new Promise((resolve) => setTimeout(resolve, 100));
    const results = result.container.querySelectorAll(`.${styles.search.result}`);
    expect(results.length).toBe(0);
  });

  it("j/k navigation changes selected result", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    // Wait for results
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(1);
    });

    // First result should be selected by default
    const getSelectedResult = () => result.container.querySelector(`.${styles.search.resultSelected}`);
    const initialSelected = getSelectedResult();
    expect(initialSelected).toBeTruthy();

    // Blur input to enable j/k navigation
    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    input.blur();
    await awaitPendingCallbacks();

    // Press j to move to next
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    // Should have moved selection
    const afterJ = getSelectedResult();
    expect(afterJ).toBeTruthy();
    expect(afterJ).not.toBe(initialSelected);

    // Press k to move back
    await userEvent.keyboard("{k}");
    await awaitPendingCallbacks();

    // Should be back at first result
    const afterK = getSelectedResult();
    expect(afterK?.textContent).toBe(initialSelected?.textContent);
  });

  it("g/G goes to first/last result", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    // Wait for results
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(1);
    });

    const getAllResults = () => Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
    const getSelectedResult = () => result.container.querySelector(`.${styles.search.resultSelected}`);

    // Blur input to enable navigation
    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    input.blur();
    await awaitPendingCallbacks();

    // Press G to go to last
    await userEvent.keyboard("{Shift>}{g}{/Shift}");
    await awaitPendingCallbacks();

    const allResults = getAllResults();
    const afterG = getSelectedResult();
    expect(afterG).toBe(allResults[allResults.length - 1]);

    // Press g to go to first
    await userEvent.keyboard("{g}");
    await awaitPendingCallbacks();

    const afterSmallG = getSelectedResult();
    expect(afterSmallG).toBe(allResults[0]);
  });

  it("Escape key closes search pane", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db);

    // Search should be active
    const input = result.container.querySelector(`.${styles.search.input}`);
    expect(input).toBeTruthy();

    // Press Escape
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    // Give some time for state update
    await waitFor(() => {
      const wrapper = result.container.querySelector(`.${styles.search.wrapper}`);
      // After closing, the search pane should be unmounted
      expect(wrapper).toBeFalsy();
    });
  });

  it("Enter key jumps to lifeLog and closes search", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "lifelog" });

    // Wait for results with lifeLogs
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(0);
    });

    // Verify selected result contains lifeLog collection
    const selectedResult = result.container.querySelector(`.${styles.search.resultSelected}`);
    expect(selectedResult?.textContent).toContain("lifeLogs");

    // Press Enter to jump
    await userEvent.keyboard("{Enter}");
    await awaitPendingCallbacks();

    // Search pane should close
    await waitFor(() => {
      const wrapper = result.container.querySelector(`.${styles.search.wrapper}`);
      expect(wrapper).toBeFalsy();
    });
  });

  it("Enter key jumps to lifeLogTreeNode and closes search", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "tree node" });

    // Wait for results with tree nodes
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(0);
    });

    // Verify selected result contains lifeLogTreeNodes collection
    const selectedResult = result.container.querySelector(`.${styles.search.resultSelected}`);
    expect(selectedResult?.textContent).toContain("lifeLogTreeNodes");

    // Press Enter to jump
    await userEvent.keyboard("{Enter}");
    await awaitPendingCallbacks();

    // Search pane should close
    await waitFor(() => {
      const wrapper = result.container.querySelector(`.${styles.search.wrapper}`);
      expect(wrapper).toBeFalsy();
    });
  });

  it("typing query updates results", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "" });

    // Initially no results (empty query)
    let results = result.container.querySelectorAll(`.${styles.search.result}`);
    expect(results.length).toBe(0);

    // Type a search query
    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    input.focus();
    await userEvent.type(input, "different");
    await awaitPendingCallbacks();

    // Wait for results to appear
    await waitFor(() => {
      results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  it("filters correctly for multiple ngrams", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "first lifelog" });

    // Wait for results
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(0);
    });

    // All results should contain both "first" and "lifelog"
    const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
    for (const resultEl of results) {
      const text = resultEl.textContent?.toLowerCase() ?? "";
      expect(text).toContain("first");
      expect(text).toContain("lifelog");
    }
  });
});
