import { cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { Timestamp } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { awaitPendingCallbacks } from "@/awaitableCallback";
import { baseTime, setupSearchTest as setupSearchTestBase } from "@/panes/search/test";
import { type FirestoreService, getCollection } from "@/services/firebase/firestore";
import { runBatch, waitForPendingCommitsForTest } from "@/services/firebase/firestore/batch";
import { styles } from "@/styles.css";
import { acquireEmulator, createTestWithDb, type DatabaseInfo, releaseEmulator } from "@/test";

vi.mock(import("@/date"), async () => {
  return {
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
    TimestampNow: () => Timestamp.fromDate(baseTime),
  };
});

let emulatorPort: number;
const it = createTestWithDb(() => emulatorPort);

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

let firestoreForCleanup: FirestoreService | undefined;

async function setupSearchTest(...args: Parameters<typeof setupSearchTestBase>) {
  const setup = await setupSearchTestBase(...args);
  firestoreForCleanup = setup.firestore;
  return setup;
}

async function waitForCurrentPendingCommits() {
  if (firestoreForCleanup) {
    await waitForPendingCommitsForTest({ service: firestoreForCleanup });
  }
}

afterEach(async () => {
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  cleanup();
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  firestoreForCleanup = undefined;
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

  it("shows result count and results for valid queries", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "se" });

    // Wait for results to appear
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(0);
    });

    // Result count should be displayed
    const count = result.container.querySelectorAll(`.${styles.search.result}`).length;
    await result.findByText(`${count}件`);
  });

  it("shows hint message for queries < 2 chars", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "s" });

    // Wait a bit and check no results appear
    await new Promise((resolve) => setTimeout(resolve, 100));
    const results = result.container.querySelectorAll(`.${styles.search.result}`);
    expect(results.length).toBe(0);

    // Hint message should be displayed
    await result.findByText("2文字以上入力してください");
  });

  it("shows 0 count for no matching results", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "zzzz" });

    // Wait for search to complete and show 0 count
    await waitFor(() => result.findByText("0件"));
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

  it("Escape blurs input when focused", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db);

    // Input should be focused initially
    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    // Press Escape
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    // Input should be blurred
    expect(document.activeElement).not.toBe(input);

    // Search pane should still be open
    const wrapper = result.container.querySelector(`.${styles.search.wrapper}`);
    expect(wrapper).toBeTruthy();
  });

  it("Escape closes search pane when input not focused", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db);

    // First Escape blurs the input
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);

    // Second Escape closes the search pane
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

  it("removes a text update from the old ngram query optimistically", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBe(2);
    });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    await runBatch(
      firestore,
      (batch) => {
        batch.update(lifeLogsCol, { id: "$log1", text: "renamed without old token" });
        return Promise.resolve();
      },
      { skipHistory: true },
    );

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("tree node searchable");
    });

    await waitForPendingCommitsForTest({ service: firestore, timeoutMs: 2000 });
  });

  it("removes an empty text update from the old ngram query optimistically and after commit", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBe(2);
    });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    await runBatch(
      firestore,
      (batch) => {
        batch.update(lifeLogsCol, { id: "$log1", text: "" });
        return Promise.resolve();
      },
      { skipHistory: true },
    );

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("tree node searchable");
    });

    await waitForPendingCommitsForTest({ service: firestore });

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("tree node searchable");
    });
  });

  it("removes updates to one-character and whitespace-only text from the old query", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    await waitFor(() => {
      expect(result.container.querySelectorAll(`.${styles.search.result}`)).toHaveLength(2);
    });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    await runBatch(
      firestore,
      (batch) => {
        batch.update(lifeLogsCol, { id: "$log1", text: "x" });
        batch.update(lifeLogsCol, { id: "$log2", text: "   " });
        return Promise.resolve();
      },
      { skipHistory: true },
    );

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("tree node searchable");
    });
    await waitForPendingCommitsForTest({ service: firestore });
  });

  it("can search emoji-only and punctuation text after an optimistic update", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    await waitFor(() => {
      expect(result.container.querySelectorAll(`.${styles.search.result}`)).toHaveLength(2);
    });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    await runBatch(
      firestore,
      (batch) => {
        batch.update(lifeLogsCol, { id: "$log1", text: "😀😀" });
        batch.update(lifeLogsCol, { id: "$log2", text: "hello, world!" });
        return Promise.resolve();
      },
      { skipHistory: true },
    );

    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "😀😀" } });
    await awaitPendingCallbacks();

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("😀😀");
    });

    fireEvent.input(input, { target: { value: "hello," } });
    await awaitPendingCallbacks();

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("hello, world!");
    });
    await waitForPendingCommitsForTest({ service: firestore });
  });

  it("can search text containing a dot through the real Search UI", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    await runBatch(
      firestore,
      (batch) => {
        batch.update(lifeLogsCol, { id: "$log1", text: "a.b dotted text" });
        return Promise.resolve();
      },
      { skipHistory: true },
    );
    await waitForPendingCommitsForTest({ service: firestore });

    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "a." } });
    await awaitPendingCallbacks();

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("a.b dotted text");
    });
  });

  it("removes a deleted ngram from search results optimistically", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBe(2);
    });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    await runBatch(
      firestore,
      (batch) => {
        batch.delete(lifeLogsCol, "$log1");
        return Promise.resolve();
      },
      { skipHistory: true },
    );

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("tree node searchable");
    });

    await waitForPendingCommitsForTest({ service: firestore, timeoutMs: 2000 });
  });

  it("restores search results after a failed optimistic ngram update rolls back", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBe(2);
    });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runBatch(
        firestore,
        (batch) => {
          batch.update(lifeLogsCol, { id: "$log1", text: "temporary rollback text" });
          batch.update(lifeLogsCol, { id: "missing", text: "forces commit failure" });
          return Promise.resolve();
        },
        { skipHistory: true },
      );

      await waitForPendingCommitsForTest({ service: firestore, timeoutMs: 5000 });
    } finally {
      consoleError.mockRestore();
    }

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.textContent).join("\n")).toContain("first lifelog searchable");
    });
  });

  it("does not leave stale old-query overlay after commit when switching old and new queries", async ({ db, task }) => {
    const { result, firestore } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    await waitFor(() => {
      expect(result.container.querySelectorAll(`.${styles.search.result}`)).toHaveLength(2);
    });

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    await runBatch(
      firestore,
      (batch) => {
        batch.update(lifeLogsCol, { id: "$log1", text: "brand new token" });
        return Promise.resolve();
      },
      { skipHistory: true },
    );
    await waitForPendingCommitsForTest({ service: firestore });

    const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "new token" } });
    await awaitPendingCallbacks();

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("brand new token");
    });

    fireEvent.input(input, { target: { value: "searchable" } });
    await awaitPendingCallbacks();

    await waitFor(() => {
      const results = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(results).toHaveLength(1);
      expect(results[0].textContent).toContain("tree node searchable");
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

  it("i key focuses input with cursor at start", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    // Wait for input to appear
    let input!: HTMLInputElement;
    await waitFor(() => {
      input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
      expect(input).toBeTruthy();
    });

    // Blur input
    input.blur();
    await awaitPendingCallbacks();
    expect(document.activeElement).not.toBe(input);

    // Press 'i' to focus with cursor at start
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    // Input should be focused with cursor at position 0
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
  });

  it("a key focuses input with cursor at end", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    // Wait for input to appear
    let input!: HTMLInputElement;
    await waitFor(() => {
      input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
      expect(input).toBeTruthy();
    });
    const queryLength = input.value.length;

    // Blur input
    input.blur();
    await awaitPendingCallbacks();
    expect(document.activeElement).not.toBe(input);

    // Press 'a' to focus with cursor at end
    await userEvent.keyboard("{a}");
    await awaitPendingCallbacks();

    // Input should be focused with cursor at end
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(queryLength);
  });

  it("results are displayed in reverse order", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    // Wait for results
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(1);
    });

    // Get the displayed results
    const displayedResults = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));

    // Verify results are displayed (order is tested by the fact that toReversed is applied)
    // The first displayed result should be the last one returned by Firestore
    // This is verified by checking that tree node (child1) comes before lifeLogs
    // since tree nodes would be returned later by Firestore query
    expect(displayedResults.length).toBe(2);
  });

  it("clicking a result selects it", async ({ db, task }) => {
    const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

    // Wait for multiple results
    await waitFor(() => {
      const results = result.container.querySelectorAll(`.${styles.search.result}`);
      expect(results.length).toBeGreaterThan(1);
    });

    const allResults = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));

    // First result is selected by default
    expect(allResults[0].className).toContain(styles.search.resultSelected);
    expect(allResults[1].className).not.toContain(styles.search.resultSelected);

    // Click the second result
    await userEvent.click(allResults[1]);
    await awaitPendingCallbacks();

    // Second result should now be selected
    await waitFor(() => {
      const updatedResults = Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(updatedResults[0].className).not.toContain(styles.search.resultSelected);
      expect(updatedResults[1].className).toContain(styles.search.resultSelected);
    });
  });

  describe("MobileToolbar", () => {
    const findToolbarButton = (container: HTMLElement, emoji: string) =>
      Array.from(container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
        (btn) => btn.textContent === emoji,
      ) as HTMLButtonElement | undefined;

    it("⏫ button goes to first result", async ({ db, task }) => {
      const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

      // Wait for multiple results
      await waitFor(() => {
        const results = result.container.querySelectorAll(`.${styles.search.result}`);
        expect(results.length).toBeGreaterThan(1);
      });

      // Blur input and go to last with G
      const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
      input.blur();
      await awaitPendingCallbacks();

      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      const allResults = () => Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(allResults()[allResults().length - 1].className).toContain(styles.search.resultSelected);

      // Click ⏫
      const goToFirstButton = findToolbarButton(result.container, "⏫");
      expect(goToFirstButton).toBeTruthy();
      goToFirstButton!.click();
      await awaitPendingCallbacks();

      // First result should be selected
      await waitFor(() => {
        expect(allResults()[0].className).toContain(styles.search.resultSelected);
      });
    });

    it("⏬ button goes to last result", async ({ db, task }) => {
      const { result } = await setupSearchTest(task.id, db, { initialQuery: "searchable" });

      // Wait for multiple results
      await waitFor(() => {
        const results = result.container.querySelectorAll(`.${styles.search.result}`);
        expect(results.length).toBeGreaterThan(1);
      });

      // First result is selected by default
      const allResults = () => Array.from(result.container.querySelectorAll(`.${styles.search.result}`));
      expect(allResults()[0].className).toContain(styles.search.resultSelected);

      // Click ⏬
      const goToLastButton = findToolbarButton(result.container, "⏬");
      expect(goToLastButton).toBeTruthy();
      goToLastButton!.click();
      await awaitPendingCallbacks();

      // Last result should be selected
      await waitFor(() => {
        const results = allResults();
        expect(results[results.length - 1].className).toContain(styles.search.resultSelected);
      });
    });

    it("↩️ button closes search", async ({ db, task }) => {
      const { result } = await setupSearchTest(task.id, db);

      // Click ↩️
      const closeButton = findToolbarButton(result.container, "↩️");
      expect(closeButton).toBeTruthy();
      closeButton!.click();
      await awaitPendingCallbacks();

      // Search pane should close
      await waitFor(() => {
        const wrapper = result.container.querySelector(`.${styles.search.wrapper}`);
        expect(wrapper).toBeFalsy();
      });
    });

    it("✅ button jumps to selected result and closes search", async ({ db, task }) => {
      const { result } = await setupSearchTest(task.id, db, { initialQuery: "lifelog" });

      // Wait for results
      await waitFor(() => {
        const results = result.container.querySelectorAll(`.${styles.search.result}`);
        expect(results.length).toBeGreaterThan(0);
      });

      // Click ✅
      const jumpButton = findToolbarButton(result.container, "✅");
      expect(jumpButton).toBeTruthy();
      jumpButton!.click();
      await awaitPendingCallbacks();

      // Search pane should close
      await waitFor(() => {
        const wrapper = result.container.querySelector(`.${styles.search.wrapper}`);
        expect(wrapper).toBeFalsy();
      });
    });
  });

  describe("windowing", () => {
    // Helper: scroll to top edge from a safe mid position
    async function scrollToTop(container: HTMLElement) {
      container.scrollTop = Math.floor(container.scrollHeight / 2);
      await new Promise((r) => setTimeout(r, 50));
      container.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();
    }

    // Helper: scroll to bottom edge from a safe mid position
    async function scrollToBottom(container: HTMLElement) {
      container.scrollTop = Math.floor(container.scrollHeight / 2);
      await new Promise((r) => setTimeout(r, 50));
      container.scrollTop = container.scrollHeight - container.clientHeight;
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();
    }

    async function setupWindowingTest(
      taskId: string,
      db: DatabaseInfo,
      options: { count: number; windowSize: number; expandChunk: number; constrainHeight?: boolean },
    ) {
      await page.viewport(1200, 600);

      const setup = await setupSearchTest(taskId, db, {
        initialQuery: "windowed",
        manyResults: { count: options.count },
        searchProps: { windowSize: options.windowSize, expandChunk: options.expandChunk },
      });

      await setup.result.findByText(`${options.count}件`);

      // constrainHeight: false leaves the container unscrollable, so scroll-edge
      // expansion never fires and only the selection-follow logic moves the window
      const wrapper = setup.result.container.querySelector(`.${styles.search.wrapper}`) as HTMLElement;
      if (options.constrainHeight ?? true) {
        wrapper.style.height = "400px";
      }
      const container = setup.result.container.querySelector(`.${styles.search.resultsContainer}`) as HTMLElement;

      const getResults = () => Array.from(setup.result.container.querySelectorAll(`.${styles.search.result}`));
      const getSelected = () => setup.result.container.querySelector(`.${styles.search.resultSelected}`);
      const blurInput = async () => {
        const input = setup.result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
        input.blur();
        await awaitPendingCallbacks();
      };

      return { ...setup, container, getResults, getSelected, blurInput };
    }

    it("renders only the initial window while showing the full count", async ({ db, task }) => {
      const { result, getResults } = await setupWindowingTest(task.id, db, {
        count: 80,
        windowSize: 20,
        expandChunk: 10,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });

      // Display order is reversed: the window starts at "windowed result 080"
      expect(result.getByText("windowed result 080")).toBeTruthy();
      expect(result.getByText("windowed result 061")).toBeTruthy();
      expect(result.queryByText("windowed result 060")).toBeNull();
    });

    it("expands the window when scrolling to the bottom edge", async ({ db, task }) => {
      const { result, container, getResults } = await setupWindowingTest(task.id, db, {
        count: 80,
        windowSize: 20,
        expandChunk: 10,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });
      expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

      await scrollToBottom(container);

      await waitFor(() => {
        expect(getResults().length).toBe(30);
      });

      // Previously rendered items still there, new ones appended below
      expect(result.getByText("windowed result 080")).toBeTruthy();
      expect(result.getByText("windowed result 051")).toBeTruthy();
    });

    it("G slides the window to the tail and g slides it back, without rendering everything", async ({ db, task }) => {
      const { result, getResults, getSelected, blurInput } = await setupWindowingTest(task.id, db, {
        count: 80,
        windowSize: 20,
        expandChunk: 10,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });
      await blurInput();

      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 001");
      });
      expect(getResults().length).toBeLessThanOrEqual(30);
      await result.findByText("80件");

      await userEvent.keyboard("{g}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 080");
      });
      expect(getResults().length).toBeLessThanOrEqual(30);
    });

    it("j/k navigation works across the window edge", async ({ db, task }) => {
      const { getResults, getSelected, blurInput } = await setupWindowingTest(task.id, db, {
        count: 30,
        windowSize: 5,
        expandChunk: 5,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(5);
      });
      await blurInput();

      for (let i = 0; i < 6; i++) {
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();
      }

      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 024");
      });
      expect(getResults().length).toBeLessThan(30);

      await userEvent.keyboard("{k}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 025");
      });
    });

    it("clicking a result after expansion selects the correct global index", async ({ db, task }) => {
      const { container, getResults, getSelected, blurInput } = await setupWindowingTest(task.id, db, {
        count: 80,
        windowSize: 20,
        expandChunk: 10,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });

      await scrollToBottom(container);
      await waitFor(() => {
        expect(getResults().length).toBe(30);
      });

      const row = getResults()[25];
      expect(row.textContent).toContain("windowed result 055");
      await userEvent.click(row);
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 055");
      });

      await blurInput();
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 054");
      });
    });

    it("resets the window when the query changes", async ({ db, task }) => {
      const { result, container, getResults } = await setupWindowingTest(task.id, db, {
        count: 80,
        windowSize: 20,
        expandChunk: 10,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });

      await scrollToBottom(container);
      await waitFor(() => {
        expect(getResults().length).toBe(30);
      });

      const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
      input.focus();
      await userEvent.clear(input);
      await userEvent.type(input, "result");

      // All 80 docs also match "result", but the window is back to its initial size
      await result.findByText("80件");
      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });
    });

    it("preserves scroll position when the window grows at the top", async ({ db, task }) => {
      const { container, getResults, getSelected, blurInput } = await setupWindowingTest(task.id, db, {
        count: 80,
        windowSize: 20,
        expandChunk: 10,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });
      await blurInput();

      // Jump to the tail so the window has room to grow upward
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 001");
      });
      const countBefore = getResults().length;

      // Scroll to the top edge; measure the anchor position right before expansion
      container.scrollTop = Math.floor(container.scrollHeight / 2);
      await new Promise((r) => setTimeout(r, 50));
      container.scrollTop = 0;
      const anchor = document.getElementById("search-result-$wlog001lifeLogs") as HTMLElement;
      const relativeTopBefore = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(getResults().length).toBeGreaterThan(countBefore);
      });

      const relativeTopAfter = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
      expect(Math.abs(relativeTopAfter - relativeTopBefore)).toBeLessThanOrEqual(2);
    });

    it("does not expand past the ends of the result list", async ({ db, task }) => {
      const { container, getResults } = await setupWindowingTest(task.id, db, {
        count: 25,
        windowSize: 20,
        expandChunk: 10,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(20);
      });

      await scrollToBottom(container);
      await waitFor(() => {
        expect(getResults().length).toBe(25);
      });

      // Fully expanded: another bottom-edge scroll must be a no-op
      await scrollToBottom(container);
      expect(getResults().length).toBe(25);

      // The window starts at 0: a top-edge scroll must be a no-op too
      await scrollToTop(container);
      expect(getResults().length).toBe(25);
    });

    it("k navigation across the top window edge expands the window upward", async ({ db, task }) => {
      const { result, getResults, getSelected, blurInput } = await setupWindowingTest(task.id, db, {
        count: 30,
        windowSize: 5,
        expandChunk: 5,
        constrainHeight: false,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(5);
      });
      await blurInput();

      // Jump to the tail; the window recenters to the last 5 results
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 001");
      });
      expect(getResults().length).toBe(5);

      // 4 presses stay inside the window
      for (let i = 0; i < 4; i++) {
        await userEvent.keyboard("{k}");
        await awaitPendingCallbacks();
      }
      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 005");
      });
      expect(getResults().length).toBe(5);

      // The 5th press crosses the top edge: the window grows upward instead of recentering
      await userEvent.keyboard("{k}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 006");
      });
      expect(getResults().length).toBe(10);
      expect(result.getByText("windowed result 001")).toBeTruthy();
    });

    it("Enter after G jumps to the lifeLog of the globally last result", async ({ db, task }) => {
      const { result, state, getResults, getSelected, blurInput } = await setupWindowingTest(task.id, db, {
        count: 30,
        windowSize: 5,
        expandChunk: 5,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(5);
      });
      await blurInput();

      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 001");
      });

      await userEvent.keyboard("{Enter}");
      await awaitPendingCallbacks();

      // The jump must target the last result of the FULL list, not of the window
      await waitFor(() => {
        expect(result.container.querySelector(`.${styles.search.wrapper}`)).toBeFalsy();
      });
      expect(state.panesLifeLogs.selectedLifeLogId).toBe("$wlog001");
    });

    it("repairs the window when results shrink below it", async ({ db, task }) => {
      const { result, firestore, getResults, getSelected, blurInput } = await setupWindowingTest(task.id, db, {
        count: 30,
        windowSize: 5,
        expandChunk: 5,
        constrainHeight: false,
      });

      await waitFor(() => {
        expect(getResults().length).toBe(5);
      });
      await blurInput();

      // Put the window at the tail of the list
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(getSelected()?.textContent).toContain("windowed result 001");
      });

      const lifeLogsCol = getCollection(firestore, "lifeLogs");

      // Delete the 3 results at the displayed tail: windowEnd clamps to the new total
      await runBatch(
        firestore,
        (batch) => {
          batch.delete(lifeLogsCol, "$wlog001");
          batch.delete(lifeLogsCol, "$wlog002");
          batch.delete(lifeLogsCol, "$wlog003");
          return Promise.resolve();
        },
        { skipHistory: true },
      );

      await result.findByText("27件");
      await waitFor(() => {
        expect(getResults().length).toBe(2);
      });
      expect(result.getByText("windowed result 004")).toBeTruthy();
      expect(result.getByText("windowed result 005")).toBeTruthy();

      // Shrink the total below windowStart: both bounds clamp without crashing
      await runBatch(
        firestore,
        (batch) => {
          for (let i = 4; i <= 20; i++) {
            batch.delete(lifeLogsCol, `$wlog${String(i).padStart(3, "0")}`);
          }
          return Promise.resolve();
        },
        { skipHistory: true },
      );

      await result.findByText("10件");
      await waitFor(() => {
        expect(getResults().length).toBe(1);
      });
      expect(result.getByText("windowed result 021")).toBeTruthy();

      await waitForPendingCommitsForTest({ service: firestore, timeoutMs: 5000 });
    });
  });

  describe("undo/redo keys with search active", () => {
    it("u and r keys do not trigger undo/redo when search is active", async ({ db, task }) => {
      const { result } = await setupSearchTest(task.id, db, {
        withEditHistory: true,
        isActive: true,
        initialQuery: "se",
      });

      // Wait for search results to load
      await waitFor(() => {
        const resultItems = result.container.querySelectorAll(`.${styles.search.result}`);
        expect(resultItems.length).toBeGreaterThan(0);
      });

      // Press u — should not crash or trigger undo (search pane is active, guard blocks it)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Press r — same
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      // Search should still be active and functional
      const input = result.container.querySelector(`.${styles.search.input}`) as HTMLInputElement;
      expect(input).toBeTruthy();
    });
  });
});
