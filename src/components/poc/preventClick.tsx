import { createSignal } from "solid-js";

export function PreventClick() {
  const [text, setText] = createSignal("");
  return (
    <div>
      <input value={text()} onInput={(e) => setText(e.currentTarget.value)} />
      <button
        onMouseDown={(e) => {
          setText((text) => text + "!");
          e.preventDefault();
        }}
      >
        button
      </button>
    </div>
  );
}
