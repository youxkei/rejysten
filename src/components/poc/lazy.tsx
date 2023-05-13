import { createSignal, createResource, startTransition } from "solid-js";

function LazyComponent(props: { message: string }) {
  const [message] = createResource(
    () => props.message,
    async (message) => {
      await new Promise((r) => setTimeout(r, 500));
      return message;
    }
  );

  return <p>{message()}</p>;
}

export function Lazy() {
  const [message, setMessage] = createSignal("");

  return (
    <>
      <LazyComponent message={message()} />
      <span>
        {"Lazy: "}
        <input
          value={message()}
          onInput={async (e) => {
            const newMessage = e.currentTarget.value;
            await startTransition(() => setMessage(newMessage));
          }}
        />
      </span>
    </>
  );
}
