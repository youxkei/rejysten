import type { JSX } from "solid-js";

import userEvent from "@testing-library/user-event";
import { splitProps, untrack, createEffect } from "solid-js";

import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { keyboard, renderWithServicesForTest } from "@/services/test";

export function Input(props: { value: string } & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "value">) {
  let input!: HTMLInputElement;

  const [local, others] = splitProps(props, ["ref", "value"]);

  createEffect(() => {
    const value = local.value;

    if (input.value !== value) {
      input.value = value;
    }
  });

  return (
    <input
      ref={(el) => {
        input = el;

        (local.ref as ((el: HTMLInputElement) => void) | undefined)?.(el);
      }}
      value={untrack(() => local.value)}
      {...others}
    />
  );
}

if (import.meta.vitest) {
  test("with lock", async (ctx) => {
    const user = userEvent.setup();
    const { unmount, lock, findByRole } = await renderWithServicesForTest(
      ctx.task.id,
      (props) => (
        <>
          {(() => {
            const { collections } = useRxDBService();
            const lock = useLockService();

            const editor$ = createSubscribeSignal(() => collections.editors.findOne("const"));
            const text$ = createSignalWithLock(lock, () => editor$()?.text ?? "", "");

            return (
              <Input
                value={text$()}
                onInput={(e) =>
                  runWithLock(lock, async () => {
                    await collections.editors.upsert({
                      id: "const",
                      text: e.target.value,
                      updatedAt: 0,
                    });
                  })
                }
              />
            );
          })()}
          {props.children}
        </>
      ),
      ({ store: { updateState } }) => {
        updateState((state) => {
          state.mode = "insert";
        });

        return Promise.resolve();
      }
    );

    const input = await findByRole<HTMLInputElement>("textbox");

    await user.click(input);
    await keyboard(user, lock, "the quick brown fox jumps over the lazy dog");
    ctx.expect(input.value).toBe("the quick brown fox jumps over the lazy dog");

    unmount();
  });
}
