import { cleanup, waitFor } from "@solidjs/testing-library";
import { Timestamp } from "firebase/firestore";
import { afterAll, beforeAll, afterEach, describe, expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { awaitPendingCallbacks } from "@/awaitableCallback";
import { baseTime, setupLifeLogsTest as setupLifeLogsTestBase } from "@/panes/lifeLogs/test";
import { type FirestoreService } from "@/services/firebase/firestore";
import { waitForPendingCommitsForTest } from "@/services/firebase/firestore/batch";
import { styles } from "@/styles.css";
import { acquireEmulator, createTestWithDb, releaseEmulator } from "@/test";

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

async function setupLifeLogsTest(...args: Parameters<typeof setupLifeLogsTestBase>) {
  const setup = await setupLifeLogsTestBase(...args);
  firestoreForCleanup = setup.firestore;
  return setup;
}

async function waitForCurrentPendingCommits() {
  if (firestoreForCleanup) {
    await waitForPendingCommitsForTest({ service: firestoreForCleanup });
  }
}

type LifeLogsTestResult = Awaited<ReturnType<typeof setupLifeLogsTestBase>>["result"];

// Enters text-edit mode on the selected lifeLog and replaces its text with `text`.
async function startEditingWithText(result: LifeLogsTestResult, text: string) {
  await result.findByText("first lifelog");
  await userEvent.keyboard("{i}");
  await awaitPendingCallbacks();

  const input = await waitFor(() => {
    const el = result.container.querySelector<HTMLInputElement>("input");
    expect(el).toBeTruthy();
    return el as HTMLInputElement;
  });
  input.focus();

  // Select-all then type to replace the existing text with the fragment.
  await userEvent.keyboard("{Control>}a{/Control}");
  await userEvent.keyboard(text);
  await awaitPendingCallbacks();

  return input;
}

// The completion dropdown items, in DOM order.
function completionItems(result: LifeLogsTestResult): HTMLElement[] {
  return Array.from(result.container.querySelectorAll<HTMLElement>(`.${styles.editableValue.completionItem}`));
}

// Text of the currently highlighted dropdown item, or null if none is highlighted.
function highlightedText(result: LifeLogsTestResult): string | null {
  const el = result.container.querySelector<HTMLElement>(`.${styles.editableValue.completionItemHighlighted}`);
  return el?.textContent ?? null;
}

afterEach(async () => {
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  cleanup();
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  firestoreForCleanup = undefined;
});

describe("lifeLog text completion", () => {
  it("shows matching past lifeLog texts as completion candidates", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min", "jogging 5km"],
    });

    await startEditingWithText(result, "gym");

    // The matching candidate is suggested...
    await result.findByText("gym workout 30min");
    // ...while a non-matching past text is not.
    expect(result.queryByText("jogging 5km")).toBeNull();
  });

  it("accepts a candidate with ArrowDown + Enter, replacing the whole field", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min", "jogging 5km"],
    });

    const input = await startEditingWithText(result, "gym");
    await result.findByText("gym workout 30min");

    await userEvent.keyboard("{ArrowDown}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{Enter}");
    await awaitPendingCallbacks();

    // The field is fully replaced by the chosen candidate and the dropdown closes.
    expect(input.value).toBe("gym workout 30min");
    expect(result.queryByText("gym workout 30min")).toBeNull();

    // Exiting persists the accepted text.
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    await result.findByText("gym workout 30min");
  });

  it("closes the dropdown with Escape without exiting edit mode; a second Escape exits", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"],
    });

    const input = await startEditingWithText(result, "gym");
    await result.findByText("gym workout 30min");

    // First Escape only dismisses the dropdown.
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.queryByText("gym workout 30min")).toBeNull();
    expect(input.value).toBe("gym");
    expect(document.activeElement).toBe(input);

    // Second Escape exits editing and the typed text is saved.
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });
    await result.findByText("gym");
  });

  it("does not suggest anything for a fragment shorter than 2 characters", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"],
    });

    await startEditingWithText(result, "g");
    await awaitPendingCallbacks();

    // A single character produces no ngram, so no dropdown appears.
    await waitFor(() => {
      expect(result.queryByText("gym workout 30min")).toBeNull();
    });
  });

  it("dedupes identical candidate texts", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["morning run", "morning run"],
    });

    await startEditingWithText(result, "mo");

    await waitFor(() => {
      expect(result.getAllByText("morning run").length).toBe(1);
    });
  });

  it("caps the number of candidates at 8", async ({ db, task }) => {
    // 10 distinct past texts all match "gym"; the dropdown must show at most 8.
    const candidates = Array.from({ length: 10 }, (_, i) => `gym candidate ${i}`);
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: candidates,
    });

    await startEditingWithText(result, "gym");

    await waitFor(() => {
      expect(completionItems(result).length).toBe(8);
    });
  });

  it("excludes the exact text currently being edited", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["morning run"],
    });

    // Typing the candidate verbatim must not suggest itself.
    await startEditingWithText(result, "morning run");
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(result.queryByText("morning run")).toBeNull();
    });
  });

  it("keeps Tab cycling fields instead of accepting a candidate", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"],
    });

    await startEditingWithText(result, "gym");
    await result.findByText("gym workout 30min");

    await userEvent.keyboard("{Tab}");
    await awaitPendingCallbacks();

    // Tab saved "gym" and moved to another field — it did not accept the candidate.
    expect(result.queryByText("gym workout 30min")).toBeNull();
    await result.findByText("gym");
  });

  it("navigates multiple candidates with ArrowDown/ArrowUp and accepts the highlighted one", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min", "gym session", "gym class"],
    });

    const input = await startEditingWithText(result, "gym");
    await waitFor(() => {
      expect(completionItems(result).length).toBe(3);
    });
    // Read texts in DOM order so assertions don't depend on Firestore result ordering.
    const texts = completionItems(result).map((el) => el.textContent ?? "");

    // Nothing highlighted initially.
    expect(highlightedText(result)).toBeNull();

    await userEvent.keyboard("{ArrowDown}");
    await awaitPendingCallbacks();
    expect(highlightedText(result)).toBe(texts[0]);

    await userEvent.keyboard("{ArrowDown}");
    await awaitPendingCallbacks();
    expect(highlightedText(result)).toBe(texts[1]);

    // ArrowUp moves back up.
    await userEvent.keyboard("{ArrowUp}");
    await awaitPendingCallbacks();
    expect(highlightedText(result)).toBe(texts[0]);

    // Move to the second item and accept it.
    await userEvent.keyboard("{ArrowDown}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{Enter}");
    await awaitPendingCallbacks();

    expect(input.value).toBe(texts[1]);
    expect(completionItems(result).length).toBe(0);
  });

  it("clamps ArrowUp at the top and ArrowDown at the bottom", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min", "gym session"],
    });

    await startEditingWithText(result, "gym");
    await waitFor(() => {
      expect(completionItems(result).length).toBe(2);
    });
    const texts = completionItems(result).map((el) => el.textContent ?? "");

    // ArrowUp with nothing highlighted lands on the first item and stays there.
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await awaitPendingCallbacks();
    expect(highlightedText(result)).toBe(texts[0]);

    // ArrowDown past the end clamps to the last item.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await awaitPendingCallbacks();
    expect(highlightedText(result)).toBe(texts[1]);
  });

  it("does nothing on Enter when no candidate is highlighted", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min", "gym session"],
    });

    const input = await startEditingWithText(result, "gym");
    await waitFor(() => {
      expect(completionItems(result).length).toBe(2);
    });

    // No ArrowDown first — Enter must not accept anything.
    await userEvent.keyboard("{Enter}");
    await awaitPendingCallbacks();

    expect(input.value).toBe("gym");
    expect(completionItems(result).length).toBe(2);
  });

  it("accepts a candidate on a real click, keeps editing, and persists", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min", "gym session"],
    });

    const input = await startEditingWithText(result, "gym");
    await waitFor(() => {
      expect(completionItems(result).length).toBe(2);
    });

    const target = completionItems(result).find((el) => el.textContent === "gym session");
    expect(target).toBeTruthy();

    // A real click fires mousedown (which would blur the focused input — and so unmount
    // the dropdown via blur-save — were it not for the handler's preventDefault) followed
    // by click. So this asserts the whole tap-equivalent path, not just the click handler.
    await userEvent.click(target!);
    await awaitPendingCallbacks();

    // Accepted (whole field replaced), dropdown closed...
    expect(input.value).toBe("gym session");
    expect(completionItems(result).length).toBe(0);
    // ...and still editing the same input: the blur-save never ran, so editing didn't exit.
    expect(result.container.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);

    // The accepted text persists once editing ends.
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    await result.findByText("gym session");
  });

  it("fills the dropdown with lifeLog texts only, excluding other-collection matches at the query level", async ({
    db,
    task,
  }) => {
    // More distinct lifeLog candidates than the display cap, alongside matching tree-node
    // ngram docs. The query now filters collection == "lifeLogs" and bounds the result with
    // a limit, so the dropdown must surface a full set of 8 distinct lifeLog texts and never
    // a tree-node text — without relying on client-side filtering of a huge result set.
    const lifeLogCandidates = Array.from({ length: 12 }, (_, i) => `gym log ${i}`);
    const treeNodeCandidates = Array.from({ length: 5 }, (_, i) => `gym tree ${i}`);
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: lifeLogCandidates,
      completionTreeNodeCandidates: treeNodeCandidates,
    });

    await startEditingWithText(result, "gym");

    await waitFor(() => {
      expect(completionItems(result).length).toBe(8);
    });
    // Every shown item is a lifeLog candidate; no tree-node text leaked in.
    for (const el of completionItems(result)) {
      expect(el.textContent ?? "").toMatch(/^gym log \d+$/);
    }
  });

  it("suggests lifeLog texts only, not tree-node texts", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"],
      completionTreeNodeCandidates: ["gym tree note"],
    });

    await startEditingWithText(result, "gym");

    // The lifeLog candidate is suggested; the matching tree-node text is excluded.
    await result.findByText("gym workout 30min");
    expect(result.queryByText("gym tree note")).toBeNull();
  });

  it("does not suggest the edited lifeLog's own past text", async ({ db, task }) => {
    // The selected lifeLog has a recent uuidv7 id, so its own ngram doc survives the age
    // cutoff and matches the typed fragment — only the id-based self-exclusion keeps it out.
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionSelfLifeLog: { text: "gym past text" },
      completionCandidates: ["gym workout 30min"],
    });

    await result.findByText("gym past text");
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input = await waitFor(() => {
      const el = result.container.querySelector<HTMLInputElement>("input");
      expect(el).toBeTruthy();
      return el as HTMLInputElement;
    });
    input.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("gym");
    await awaitPendingCallbacks();

    // A genuine candidate appears (proving the dropdown works here)...
    await result.findByText("gym workout 30min");
    // ...but the edited lifeLog's own stale text is not suggested.
    expect(result.queryByText("gym past text")).toBeNull();
  });

  it("excludes lifeLog texts older than the completion window", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"], // recent
      completionStaleCandidates: ["gym ancient history"], // older than the window
    });

    await startEditingWithText(result, "gym");

    // The recent candidate is suggested...
    await result.findByText("gym workout 30min");
    // ...the one older than the window is not, even though it matches the fragment.
    expect(result.queryByText("gym ancient history")).toBeNull();
  });

  it("suggests nothing when every match is older than the completion window", async ({ db, task }) => {
    // The same texts would be suggested if recent (see other tests); staleness alone suppresses them.
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionStaleCandidates: ["gym workout 30min", "gym session"],
    });

    await startEditingWithText(result, "gym");
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(completionItems(result).length).toBe(0);
    });
  });

  it("does not offer completion while editing startAt", async ({ db, task }) => {
    // A candidate that would match the digits typed into startAt — so if completion were
    // (wrongly) wired to startAt, it would show. It must not.
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["1234 reminder note"],
    });

    await result.findByText("first lifelog");
    await userEvent.keyboard("{i}"); // enter text editing
    await awaitPendingCallbacks();
    await userEvent.keyboard("{Tab}"); // cycle to the startAt field
    await awaitPendingCallbacks();

    const input = result.container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    await userEvent.keyboard("{Control>}a{/Control}1234");
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(input.value).toBe("1234");
    });
    // No completion dropdown on the startAt field, despite a matching lifeLog candidate.
    expect(completionItems(result).length).toBe(0);
  });

  it("re-opens the dropdown when typing after Escape dismissed it", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"],
    });

    await startEditingWithText(result, "gym");
    await result.findByText("gym workout 30min");

    // Escape dismisses the dropdown (editing continues).
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(completionItems(result).length).toBe(0);

    // Editing the text again re-opens it (onInput clears the dismissed flag).
    await userEvent.keyboard("{Backspace}"); // "gym" -> "gy", still matches
    await awaitPendingCallbacks();
    await result.findByText("gym workout 30min");
  });

  // IME composition can't be reproduced through userEvent (it never sets isComposing), so
  // this guard is verified with a synthetic keydown carrying isComposing: true.
  it("does not accept while the IME is composing", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"],
    });

    const input = await startEditingWithText(result, "gym");
    await waitFor(() => {
      expect(completionItems(result).length).toBe(1);
    });

    // Highlight the candidate, then send Enter as if confirming an IME composition.
    await userEvent.keyboard("{ArrowDown}");
    await awaitPendingCallbacks();
    expect(highlightedText(result)).toBe("gym workout 30min");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true, cancelable: true }),
    );
    await awaitPendingCallbacks();

    // The composing Enter is ignored: nothing accepted, dropdown still open.
    expect(input.value).toBe("gym");
    expect(completionItems(result).length).toBe(1);
  });
});
