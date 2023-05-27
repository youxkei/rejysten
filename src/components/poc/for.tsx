import { produce } from "immer";
import { createSignal, For, Index } from "solid-js";

export function PrimitiveForTest() {
  function Element(props: { value: number }) {
    console.log("Element");

    const value$ = () => {
      console.log("value$", props.value);

      return props.value;
    };

    return <div>{value$()}</div>;
  }

  const [array$, setArray] = createSignal([1, 2, 3], {});

  return (
    <>
      <For each={array$()}>{(value) => <Element value={value} />}</For>
      <button onClick={() => setArray((array) => [...array, array[array.length - 1] + 1])}>add (new array)</button>
      <button
        onClick={() =>
          setArray(
            produce((array) => {
              array[1]++;
            })
          )
        }
      >
        change
      </button>
    </>
  );
}
export function PrimitiveIndexTest() {
  function Element(props: { value: number }) {
    console.log("Element");

    const value$ = () => {
      console.log("value$", props.value);

      return props.value;
    };

    return <div>{value$()}</div>;
  }

  const [array$, setArray] = createSignal([1, 2, 3], {});

  return (
    <>
      <Index each={array$()}>{(value) => <Element value={value()} />}</Index>
      <button onClick={() => setArray((array) => [...array, array[array.length - 1] + 1])}>add (new array)</button>
      <button
        onClick={() =>
          setArray(
            produce((array) => {
              array[1]++;
            })
          )
        }
      >
        change
      </button>
    </>
  );
}
