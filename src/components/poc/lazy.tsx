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
      <p>
        {"Lazy: "}
        <input
          value={message()}
          onInput={(e) => { const newMessage = e.currentTarget.value; startTransition(() => setMessage(newMessage)); }}
        />
      </p>
    </>
  );
}
