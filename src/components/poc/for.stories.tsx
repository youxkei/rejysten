import { type Meta, type StoryObj } from "@kachurun/storybook-solid-vite";
import { produce } from "immer";
import { For, Index, createSignal } from "solid-js";

export default {
  title: "poc/for",
} satisfies Meta;

export const ForTest: StoryObj = {
  render: () => {
    function Element(props: { value: string }) {
      console.log("Element");

      const value$ = () => {
        console.log("value$", props.value);

        return props.value;
      };

      return <div>{value$()}</div>;
    }

    const [array$, setArray] = createSignal(["1", "2", "3"], {});

    return (
      <>
        <For each={array$()}>{(value) => <Element value={value} />}</For>
        <button onClick={() => setArray((array) => [`${Number(array[0]) - 1}`, ...array].map((x) => x))}>
          prepend
        </button>
        <button onClick={() => setArray((array) => [...array, `${Number(array[array.length - 1]) + 1}`].map((x) => x))}>
          append
        </button>
        <button
          onClick={() =>
            setArray(
              produce((array) => {
                array[1] = `${Number(array[1]) + 1}`;
              }),
            )
          }
        >
          change
        </button>
        <button
          onClick={() =>
            setArray(
              produce((array) => {
                const tmp = array[1];
                array[1] = array[2];
                array[2] = tmp;
              }),
            )
          }
        >
          exchange
        </button>
      </>
    );
  },
};

export const IndexTest: StoryObj = {
  render: () => {
    function Element(props: { value: string }) {
      console.log("Element");

      const value$ = () => {
        console.log("value$", props.value);

        return props.value;
      };

      return <div>{value$()}</div>;
    }

    const [array$, setArray] = createSignal(["1", "2", "3"], {});

    return (
      <>
        <Index each={array$()}>{(value) => <Element value={value()} />}</Index>
        <button onClick={() => setArray((array) => [`${Number(array[0]) - 1}`, ...array].map((x) => x))}>
          prepend
        </button>
        <button onClick={() => setArray((array) => [...array, `${Number(array[array.length - 1]) + 1}`].map((x) => x))}>
          append
        </button>
        <button
          onClick={() =>
            setArray(
              produce((array) => {
                array[1] = `${Number(array[1]) + 1}`;
              }),
            )
          }
        >
          change
        </button>
        <button
          onClick={() =>
            setArray(
              produce((array) => {
                const tmp = array[1];
                array[1] = array[2];
                array[2] = tmp;
              }),
            )
          }
        >
          exchange
        </button>
      </>
    );
  },
};
