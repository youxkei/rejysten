import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditableValue } from "@/components/editableValue";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("<EditableValue />", () => {
  it("cancels a debounced save when unmounted during editing", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();

    const result = render(() => (
      <EditableValue
        value="old"
        onSave={onSave}
        isSelected
        isEditing
        setIsEditing={() => undefined}
        toText={(value) => value}
        fromText={(text) => text}
        debounceMs={50}
      />
    ));
    const input = result.container.querySelector("input")!;

    fireEvent.input(input, { target: { value: "new" } });
    result.unmount();
    vi.advanceTimersByTime(100);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps an explicit blur save and does not run the canceled debounce again on unmount", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();

    const result = render(() => (
      <EditableValue
        value="old"
        onSave={onSave}
        isSelected
        isEditing
        setIsEditing={() => undefined}
        toText={(value) => value}
        fromText={(text) => text}
        debounceMs={50}
      />
    ));
    const input = result.container.querySelector("input")!;

    fireEvent.input(input, { target: { value: "new" } });
    fireEvent.blur(input);
    result.unmount();
    vi.advanceTimersByTime(100);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("new", true);
  });
});
