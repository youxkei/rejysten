import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";

import { useLockService, runWithLock, createSignalWithLock } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { RxDBServiceProviderForTest } from "@/services/rxdb/test";
import { keyboard, renderWithServicesForTest } from "@/services/test";

function SignalInput() {
  const [text$, setText] = createSignal("");

  return <input value={text$()} onInput={(e) => setText(e.currentTarget.value)} />;
}

function RxDBInput() {
  const { collections } = useRxDBService();
  const lock = useLockService();

  const editor$ = createSubscribeSignal(() => collections.editors.findOne("const"));
  const text$ = createSignalWithLock(lock, () => editor$()?.text ?? "", "");

  return (
    <input
      value={text$()}
      onInput={(e) =>
        runWithLock(lock, async () => {
          await collections.editors.upsert({ id: "const", text: e.target.value, updatedAt: 0 });
        })
      }
    />
  );
}

if (import.meta.vitest) {
  test("SignalInput", async (ctx) => {
    const user = userEvent.setup();
    const { unmount, findByRole } = render(() => (
      <RxDBServiceProviderForTest tid={ctx.meta.id}>
        <SignalInput />
      </RxDBServiceProviderForTest>
    ));

    const input = await findByRole<HTMLInputElement>("textbox");

    await user.click(input);
    await user.keyboard("abcde");
    ctx.expect(input.value).toBe("abcde");

    unmount();
  });

  test("RxDBInput", async (ctx) => {
    const user = userEvent.setup();
    const { unmount, lock, findByRole } = await renderWithServicesForTest(
      ctx.meta.id,
      (props) => (
        <>
          <RxDBInput />
          {props.children}
        </>
      ),
      async ({ store: { updateStore } }) => {
        await updateStore((store) => {
          store.mode = "insert";
        });
      }
    );

    const input = await findByRole<HTMLInputElement>("textbox");

    await user.click(input);
    await keyboard(user, lock, "abcde");
    ctx.expect(input.value).toBe("abcde");

    unmount();
  });
}
