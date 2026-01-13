import { waitFor } from "@solidjs/testing-library";
import { describe, expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { baseTime, setupLifeLogsTest } from "@/panes/lifeLogs/testUtils";
import { styles } from "@/styles.css";
import { testWithDb as it } from "@/test";

vi.mock(import("@/date"), async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
  };
});

describe("<LifeLogTree />", { timeout: 5000 }, () => {
  it("can enter/exit tree mode with l/h keys", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Initial state: $log1 is selected (lifelog mode)
    await waitFor(() => {
      const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render and first child to be selected
    await result.findByText("first child");
    await waitFor(() => {
      const child1Element = result.getByText("first child");
      expect(child1Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Lifelog should no longer be selected (tree node is selected instead)
    const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log1Element?.className).not.toContain(styles.lifeLogTree.selected);

    // Press "h" to exit tree mode and go back to lifelog
    await userEvent.keyboard("{h}");

    await waitFor(() => {
      const log1ElementAfter = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log1ElementAfter?.className).toContain(styles.lifeLogTree.selected);
    });

    // Tree nodes should no longer be visible (tree mode exited)
    await waitFor(() => {
      expect(result.queryByText("first child")).toBeNull();
    });

    result.unmount();
  });

  it("can navigate between tree nodes with j/k keys", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for all tree nodes to render
    // Structure (depth):
    //   child1 (depth 1)
    //     grandchild (depth 2)
    //       great-grandchild (depth 3)
    //   child2 (depth 1)
    await result.findByText("first child");
    await result.findByText("grandchild");
    await result.findByText("great-grandchild");
    await result.findByText("second child");

    // Initial state: child1 (depth 1) is selected
    await waitFor(() => {
      const child1Element = result.getByText("first child");
      expect(child1Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Test j: shallow -> deep (depth 1 -> depth 2)
    await userEvent.keyboard("{j}");

    await waitFor(() => {
      const grandchildElement = result.getByText("grandchild");
      expect(grandchildElement.className).toContain(styles.lifeLogTree.selected);
    });

    // Test j: deep -> deeper (depth 2 -> depth 3)
    await userEvent.keyboard("{j}");

    await waitFor(() => {
      const greatGrandchildElement = result.getByText("great-grandchild");
      expect(greatGrandchildElement.className).toContain(styles.lifeLogTree.selected);
    });

    // Test j: deepest -> shallow (depth 3 -> depth 1)
    await userEvent.keyboard("{j}");

    await waitFor(() => {
      const child2Element = result.getByText("second child");
      expect(child2Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Test k: shallow -> deepest (depth 1 -> depth 3)
    await userEvent.keyboard("{k}");

    await waitFor(() => {
      const greatGrandchildElement = result.getByText("great-grandchild");
      expect(greatGrandchildElement.className).toContain(styles.lifeLogTree.selected);
    });

    // Test k: deepest -> deep (depth 3 -> depth 2)
    await userEvent.keyboard("{k}");

    await waitFor(() => {
      const grandchildElement = result.getByText("grandchild");
      expect(grandchildElement.className).toContain(styles.lifeLogTree.selected);
    });

    // Test k: deep -> shallow (depth 2 -> depth 1)
    await userEvent.keyboard("{k}");

    await waitFor(() => {
      const child1Element = result.getByText("first child");
      expect(child1Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "k" at the first node should not change selection
    await userEvent.keyboard("{k}");

    await waitFor(() => {
      const child1Element = result.getByText("first child");
      expect(child1Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Wait for any pending Firestore operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Exit tree mode to ensure clean shutdown
    await userEvent.keyboard("{h}");
    await waitFor(() => {
      // After pressing h, tree nodes should no longer be visible
      expect(result.queryByText("first child")).toBeNull();
    });

    result.unmount();
  });

  it("can indent/dedent nodes with Tab/Shift+Tab keys", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for lifelogs to render
    await result.findByText("first lifelog");

    // Press "l" to enter tree mode (focus on first child node - child1)
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("second child");

    // Press "j" three times to move to child2 (child1 -> grandchild -> great-grandchild -> child2)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      const grandchildElement = result.getByText("grandchild");
      expect(grandchildElement.className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      const greatGrandchildElement = result.getByText("great-grandchild");
      expect(greatGrandchildElement.className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");

    // Wait for child2 to be selected
    await waitFor(() => {
      const child2Element = result.getByText("second child");
      expect(child2Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Verify initial DOM structure: child1 and child2 are siblings (both direct children of the same ul)
    const child1Li = result.getByText("first child").closest("li")!;
    const child2Li = result.getByText("second child").closest("li")!;
    const parentUl = child1Li.parentElement!;
    expect(parentUl.tagName).toBe("UL");
    expect(child2Li.parentElement).toBe(parentUl); // child2 is sibling of child1

    // Test indent: Press Tab to indent child2 under child1
    const indentStart = performance.now();
    await userEvent.keyboard("{Tab}");

    // Verify DOM structure after indent: child2 should be inside child1's subtree
    await waitFor(() => {
      const child1LiAfterIndent = result.getByText("first child").closest("li")!;
      const child2LiAfterIndent = result.getByText("second child").closest("li")!;
      // child2 should now be nested inside child1 (child1's li contains a ul that contains child2's li)
      expect(child1LiAfterIndent.contains(child2LiAfterIndent)).toBe(true);
    });
    const indentEnd = performance.now();
    const indentDuration = indentEnd - indentStart;

    // Test dedent: Press Shift+Tab to dedent child2 back to sibling of child1
    const dedentStart = performance.now();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

    // Verify DOM structure after dedent: child2 should be sibling of child1 again
    await waitFor(() => {
      const child1LiAfterDedent = result.getByText("first child").closest("li")!;
      const child2LiAfterDedent = result.getByText("second child").closest("li")!;
      // child2 should no longer be nested inside child1
      expect(child1LiAfterDedent.contains(child2LiAfterDedent)).toBe(false);
      // They should share the same parent ul
      expect(child1LiAfterDedent.parentElement).toBe(child2LiAfterDedent.parentElement);
    });
    const dedentEnd = performance.now();
    const dedentDuration = dedentEnd - dedentStart;

    // Assert each operation completes within 100ms
    expect(indentDuration, `Indent took ${indentDuration.toFixed(2)}ms`).toBeLessThan(100);
    expect(dedentDuration, `Dedent took ${dedentDuration.toFixed(2)}ms`).toBeLessThan(100);

    result.unmount();
  });

  it("can edit node text with i key", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode (focus on first child node - child1)
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    const input = result.container.querySelector("input") as HTMLInputElement;

    // Test cursor position is preserved while typing
    // Type a character in the middle (position 5)
    input.focus();
    input.setSelectionRange(5, 5);
    await userEvent.keyboard("X");

    await waitFor(() => {
      expect(input.value).toBe("firstX child");
    });

    // Verify cursor position can be set and preserved
    // (In a controlled component with value={}, setting cursor position would be reset on next render)
    input.setSelectionRange(6, 6);
    expect(input.selectionStart).toBe(6);

    // Type another character at position 6
    await userEvent.keyboard("Y");

    await waitFor(() => {
      expect(input.value).toBe("firstXY child");
    });

    // Verify setSelectionRange still works after input
    input.setSelectionRange(3, 3);
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);

    // Press Escape to save and exit editing
    const start = performance.now();
    await userEvent.keyboard("{Escape}");

    // Verify the DOM was updated
    await waitFor(() => {
      expect(result.getByText("firstXY child")).toBeTruthy();
    });
    const end = performance.now();
    const duration = end - start;

    expect(duration, `Edit node text took ${duration.toFixed(2)}ms`).toBeLessThan(100);
    expect(result.queryByText("first child")).toBeNull();

    result.unmount();
  });

  it("can add node below with o key", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");

    // Initial state: child1 is selected
    await waitFor(() => {
      const child1Element = result.getByText("first child");
      expect(child1Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "o" to add a new node below
    const start = performance.now();
    await userEvent.keyboard("{o}");

    // Wait for input to appear (editing mode)
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });
    const end = performance.now();
    const duration = end - start;

    // Assert operation completes within 100ms
    expect(duration, `Add node below took ${duration.toFixed(2)}ms`).toBeLessThan(100);

    // Type text for the new node
    const input = result.container.querySelector("input")!;
    input.focus();
    await userEvent.keyboard("new node below");

    // Press Escape to save and exit editing
    await userEvent.keyboard("{Escape}");

    // Verify the new node is displayed
    await waitFor(() => {
      expect(result.getByText("new node below")).toBeTruthy();
    });

    // Verify the order: first child should come before new node below
    const firstChildLi = result.getByText("first child").closest("li")!;
    const newNodeLi = result.getByText("new node below").closest("li")!;
    // They should be siblings (same parent)
    expect(firstChildLi.parentElement).toBe(newNodeLi.parentElement);
    // first child should come before new node in DOM order
    const children = Array.from(firstChildLi.parentElement!.children);
    expect(children.indexOf(firstChildLi)).toBeLessThan(children.indexOf(newNodeLi));

    result.unmount();
  });

  it("can add node above with O key", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("second child");

    // Navigate to second child (j -> j -> j to skip grandchild and great-grandchild)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
    });

    // Press Shift+O to add a new node above
    const start = performance.now();
    await userEvent.keyboard("{Shift>}{o}{/Shift}");

    // Wait for input to appear (editing mode)
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });
    const end = performance.now();
    const duration = end - start;

    expect(duration, `Add node above took ${duration.toFixed(2)}ms`).toBeLessThan(100);

    // Type text for the new node
    const input = result.container.querySelector("input")!;
    input.focus();
    await userEvent.keyboard("new node above");

    // Press Escape to save and exit editing
    await userEvent.keyboard("{Escape}");

    // Verify the new node is displayed
    await waitFor(() => {
      expect(result.getByText("new node above")).toBeTruthy();
    });

    // Verify the order: new node above should come before second child
    const newNodeLi = result.getByText("new node above").closest("li")!;
    const secondChildLi = result.getByText("second child").closest("li")!;
    // They should be siblings (same parent)
    expect(newNodeLi.parentElement).toBe(secondChildLi.parentElement);
    // new node should come before second child in DOM order
    const children = Array.from(newNodeLi.parentElement!.children);
    expect(children.indexOf(newNodeLi)).toBeLessThan(children.indexOf(secondChildLi));

    result.unmount();
  });

  it("can split node with Enter key at cursor position", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");

    // Initial state: child1 is selected
    await waitFor(() => {
      const child1Element = result.getByText("first child");
      expect(child1Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    const input = result.container.querySelector("input")!;

    // Change text to "beforeafter" and set cursor position in the middle
    input.focus();
    await userEvent.keyboard("{Control>}a{/Control}beforeafter");

    // Set cursor position at index 6 (between "before" and "after")
    input.setSelectionRange(6, 6);

    // Press Enter to split the node
    const start = performance.now();
    await userEvent.keyboard("{Enter}");

    // Wait for the split to complete - original node should have "before"
    await waitFor(() => {
      expect(result.getByText("before")).toBeTruthy();
    });

    // New node should have "after" and be selected with editing mode
    // Cursor should be at position 0 (beginning of the text)
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("after");
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(0);
    });
    const end = performance.now();
    const duration = end - start;

    expect(duration, `Split node took ${duration.toFixed(2)}ms`).toBeLessThan(250);

    // Press Escape to exit editing mode
    await userEvent.keyboard("{Escape}");

    // Verify both nodes are displayed
    await waitFor(() => {
      expect(result.getByText("before")).toBeTruthy();
      expect(result.getByText("after")).toBeTruthy();
    });

    // Verify the order: "before" should come before "after"
    const beforeLi = result.getByText("before").closest("li")!;
    const afterLi = result.getByText("after").closest("li")!;
    // They should be siblings (same parent)
    expect(beforeLi.parentElement).toBe(afterLi.parentElement);
    // "before" should come before "after" in DOM order
    const children = Array.from(beforeLi.parentElement!.children);
    expect(children.indexOf(beforeLi)).toBeLessThan(children.indexOf(afterLi));

    result.unmount();
  });

  it("can add empty node below with Enter key at end of text", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    const input = result.container.querySelector("input")!;

    // Set cursor position at end (after "first child")
    input.setSelectionRange(input.value.length, input.value.length);

    // Press Enter to add new node below
    await userEvent.keyboard("{Enter}");

    // Wait for new node - original node should still have "first child"
    await waitFor(() => {
      expect(result.getByText("first child")).toBeTruthy();
    });

    // New node should be selected with editing mode and empty value
    await waitFor(() => {
      const newInput = result.container.querySelector("input");
      expect(newInput).toBeTruthy();
      expect((newInput as HTMLInputElement).value).toBe("");
    });

    result.unmount();
  });

  it("can indent/dedent nodes with Tab/Shift+Tab keys during editing", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("second child");
    await result.findByText("grandchild");
    await result.findByText("great-grandchild");

    // Wait for initial selection
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to child2 (j -> j -> j: child1 -> grandchild -> great-grandchild -> child2)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "a" to enter editing mode (cursor at end, like vim's append)
    await userEvent.keyboard("{a}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    // Type some text to modify (appends to end: "second child" -> "second child edited")
    await userEvent.keyboard(" edited");

    // Verify initial DOM structure: child1 and child2 are siblings
    const child1Li = result.getByText("first child").closest("li")!;
    const child2Li = result.container.querySelector("input")!.closest("li")!;
    expect(child1Li.parentElement).toBe(child2Li.parentElement);

    // Press Tab to indent while editing
    await userEvent.keyboard("{Tab}");

    // Verify text was saved and indent happened
    // Note: After Tab, we're still in editing mode, so the text is in the input field
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("second child edited");
      // Verify indent happened: input's li should be inside first child's li
      const child1LiAfterIndent = result.getByText("first child").closest("li")!;
      const inputLiAfterIndent = input.closest("li")!;
      expect(child1LiAfterIndent.contains(inputLiAfterIndent)).toBe(true);
    });

    // Press Shift+Tab to dedent while editing
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

    // Verify dedent happened
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("second child edited");
      // Verify dedent happened: input's li should be sibling of first child's li
      const child1LiAfterDedent = result.getByText("first child").closest("li")!;
      const inputLiAfterDedent = input.closest("li")!;
      expect(child1LiAfterDedent.contains(inputLiAfterDedent)).toBe(false);
      expect(child1LiAfterDedent.parentElement).toBe(inputLiAfterDedent.parentElement);
    });

    result.unmount();
  });

  it("preserves cursor position after Tab indent/dedent during editing", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("second child");
    await result.findByText("grandchild");
    await result.findByText("great-grandchild");

    // Wait for initial selection
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to child2 (j -> j -> j: child1 -> grandchild -> great-grandchild -> child2)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");

    // Wait for input
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    const input = result.container.querySelector("input") as HTMLInputElement;

    // Set cursor position in the middle (position 6)
    input.setSelectionRange(6, 6);
    expect(input.selectionStart).toBe(6);

    // Press Tab to indent
    await userEvent.keyboard("{Tab}");

    // Wait for indent to complete and verify cursor position is preserved
    await waitFor(() => {
      const inputAfter = result.container.querySelector("input") as HTMLInputElement;
      expect(inputAfter).toBeTruthy();
      expect(inputAfter.selectionStart).toBe(6);
    });

    // Exit editing mode before unmount to ensure clean shutdown
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    result.unmount();
  });

  it("can merge nodes with Backspace at beginning of node", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("second child");
    await result.findByText("grandchild");
    await result.findByText("great-grandchild");

    // Wait for initial selection
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to child2 (j -> j -> j: child1 -> grandchild -> great-grandchild -> child2)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "i" to enter editing mode (cursor at beginning)
    await userEvent.keyboard("{i}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("second child");
      expect((input as HTMLInputElement).selectionStart).toBe(0);
    });

    // Press Backspace at beginning - should merge with previous node (great-grandchild)
    await userEvent.keyboard("{Backspace}");

    // Wait for merge to complete
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      // Merged text: "great-grandchild" + "second child" = "great-grandchildsecond child"
      expect(input.value).toBe("great-grandchildsecond child");
      // Cursor should be at the join point (length of "great-grandchild" = 16)
      expect(input.selectionStart).toBe(16);
    });

    // Verify "second child" node is gone
    await waitFor(() => {
      expect(result.queryByText("second child")).toBeNull();
    });

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    // Verify merged text is displayed
    expect(result.getByText("great-grandchildsecond child")).toBeTruthy();

    result.unmount();
  });

  it("can delete only empty node with Backspace and move cursor to LifeLog text", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Navigate to $log2 (has text "second lifelog", no tree nodes)
    await result.findByText("first lifelog");
    await userEvent.keyboard("{j}"); // Move to $log2
    await waitFor(() => {
      const log2Element = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log2Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "l" to create a tree node with text "new"
    await userEvent.keyboard("{l}");
    await waitFor(() => {
      expect(result.getByText("new").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "a" to enter edit mode at end
    await userEvent.keyboard("{a}");
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("new");
    });

    // Delete all text (Backspace 3 times: "new" -> "ne" -> "n" -> "")
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}");
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
      expect(input.selectionStart).toBe(0);
    });

    // Press Backspace to delete the empty node
    await userEvent.keyboard("{Backspace}");

    // Verify: cursor is now in LifeLog text field at end
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("second lifelog");
      expect(input.selectionStart).toBe("second lifelog".length);
    });

    // Verify tree node is gone
    expect(result.queryByText("new")).toBeNull();

    result.unmount();
  });

  it("does not delete only node with Backspace if text is not empty", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Navigate to $log2 and create a tree node
    await result.findByText("first lifelog");
    await userEvent.keyboard("{j}");
    await userEvent.keyboard("{l}");
    await waitFor(() => {
      expect(result.getByText("new").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "i" to enter edit mode at beginning
    await userEvent.keyboard("{i}");
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.selectionStart).toBe(0);
    });

    // Press Backspace at position 0 with non-empty text
    await userEvent.keyboard("{Backspace}");

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify: node still exists, text unchanged
    const input = result.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("new");

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    result.unmount();
  });

  it("can merge nodes with Delete at end of node", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("second child");
    await result.findByText("grandchild");
    await result.findByText("great-grandchild");

    // Wait for initial selection
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to great-grandchild (j -> j: child1 -> grandchild -> great-grandchild)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "a" to enter editing mode (cursor at end)
    await userEvent.keyboard("{a}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("great-grandchild");
      expect((input as HTMLInputElement).selectionStart).toBe(16);
    });

    // Press Delete at end - should merge with next node (second child)
    await userEvent.keyboard("{Delete}");

    // Wait for merge to complete
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      // Merged text: "great-grandchild" + "second child" = "great-grandchildsecond child"
      expect(input.value).toBe("great-grandchildsecond child");
      // Cursor should stay at original position (16)
      expect(input.selectionStart).toBe(16);
    });

    // Verify "second child" node is gone
    await waitFor(() => {
      expect(result.queryByText("second child")).toBeNull();
    });

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    // Verify merged text is displayed
    expect(result.getByText("great-grandchildsecond child")).toBeTruthy();

    result.unmount();
  });

  it("can merge with Delete even when current node has children (merges with first child)", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("grandchild");
    await result.findByText("great-grandchild");

    // Wait for initial selection on "first child" (which has children)
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to grandchild (which has children - great-grandchild)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "a" to enter editing mode (cursor at end)
    await userEvent.keyboard("{a}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("grandchild");
    });

    // Press Delete at end - SHOULD merge because next node (great-grandchild) has no children
    // Even though current node (grandchild) has children
    await userEvent.keyboard("{Delete}");

    // Wait for merge to complete
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      // Merged text: "grandchild" + "great-grandchild" = "grandchildgreat-grandchild"
      expect(input.value).toBe("grandchildgreat-grandchild");
    });

    // "great-grandchild" node should be gone (merged into grandchild)
    await waitFor(() => {
      expect(result.queryByText("great-grandchild")).toBeNull();
    });

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    result.unmount();
  });

  it("does not merge with Delete when first child (next node) has children", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("grandchild");

    // Wait for initial selection on "first child"
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "a" to enter editing mode (cursor at end)
    await userEvent.keyboard("{a}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("first child");
    });

    // Press Delete at end - should NOT merge because next node (grandchild) has children
    await userEvent.keyboard("{Delete}");

    // Wait a bit and verify no merge happened
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Text should still be "first child" (no merge)
    const input = result.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("first child");

    // "grandchild" should still exist
    expect(result.queryByText("grandchild")).toBeTruthy();

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    result.unmount();
  });

  it("does not merge when cursor is not at boundary", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("second child");
    await result.findByText("great-grandchild");

    // Wait for initial selection
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to great-grandchild (j -> grandchild, j -> great-grandchild)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");

    // Wait for input
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    const input = result.container.querySelector("input") as HTMLInputElement;

    // Move cursor to middle position
    input.setSelectionRange(5, 5);

    // Press Backspace - should just delete character, not merge
    await userEvent.keyboard("{Backspace}");

    // Wait for normal backspace to work
    await waitFor(() => {
      const inputAfter = result.container.querySelector("input") as HTMLInputElement;
      // "great-grandchild" with char at position 4 deleted = "grea-grandchild"
      expect(inputAfter.value).toBe("grea-grandchild");
    });

    // "second child" should still exist
    expect(result.queryByText("second child")).toBeTruthy();

    // Exit editing mode before unmount to ensure clean shutdown
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    result.unmount();
  });

  it("does not merge with Delete when next node has children", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("second child");
    await result.findByText("third child");

    // Wait for initial selection
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to second child (j -> grandchild -> j -> great-grandchild -> j -> second child)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "a" to enter editing mode (cursor at end)
    await userEvent.keyboard("{a}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("second child");
    });

    // Press Delete at end - should NOT merge because next node (third child) has children
    await userEvent.keyboard("{Delete}");

    // Wait a bit and verify no merge happened
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Text should still be "second child" (no merge)
    const input = result.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("second child");

    // "third child" should still exist
    expect(result.queryByText("third child")).toBeTruthy();

    // Exit editing mode before unmount
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    result.unmount();
  });

  it("can merge with Backspace even when previous node has children", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Press "l" to enter tree mode
    await userEvent.keyboard("{l}");

    // Wait for tree nodes to render
    await result.findByText("first child");
    await result.findByText("grandchild");
    await result.findByText("great-grandchild");

    // Wait for initial selection
    await waitFor(() => {
      expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
    });

    // Navigate to great-grandchild (j -> grandchild -> j -> great-grandchild)
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
    });
    await userEvent.keyboard("{j}");
    await waitFor(() => {
      expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
    });

    // Press "i" to enter editing mode (cursor at beginning)
    await userEvent.keyboard("{i}");

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("great-grandchild");
      expect((input as HTMLInputElement).selectionStart).toBe(0);
    });

    // Press Backspace at beginning - should merge even though previous node (grandchild) has children
    // We only check if current node has children, and great-grandchild has no children
    await userEvent.keyboard("{Backspace}");

    // Verify merge happened - now on grandchild with merged text
    await waitFor(() => {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("grandchildgreat-grandchild");
      expect(input.selectionStart).toBe("grandchild".length);
    });

    // "great-grandchild" should no longer exist as a separate node
    expect(result.queryByText("great-grandchild")).toBeNull();

    // Exit editing mode before unmount
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(result.container.querySelector("input")).toBeNull();
    });

    result.unmount();
  });
});
