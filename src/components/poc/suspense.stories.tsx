import { type Meta, type StoryObj } from "@kachurun/storybook-solid-vite";
import {
  type JSXElement,
  Show,
  Suspense,
  createComputed,
  createEffect,
  createRenderEffect,
  createResource,
  createRoot,
  createSignal,
  useTransition,
} from "solid-js";

export default {
  title: "poc/suspense",
} satisfies Meta;

function Count(props: { count: number }) {
  console.log("Count render", props.count);

  return <div>{props.count}</div>;
}

function NestedCount(Component: (props: { count: number }) => JSXElement) {
  return (props: { count: number }) => {
    console.log("NestedCount render", props.count);

    const [resource] = createResource(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return true;
    });

    return (
      <Show when={resource()}>
        <div>{props.count}</div>
        <Component count={props.count + 1} />
      </Show>
    );
  };
}

export const SuspenseWithNestedResource: StoryObj = {
  render: () => (
    <Suspense>
      {(() => {
        const [enabled$, setEnabled] = createSignal(false);
        const [_, startTransition] = useTransition();

        createRoot(() => {
          createComputed(() => {
            console.log("compuned enabled", enabled$());
          });
        });

        createRoot(() => {
          createEffect(() => {
            console.log("effect enabled", enabled$());
          });
        });

        createRoot(() => {
          createRenderEffect(() => {
            console.log("render effect enabled", enabled$());
          });
        });

        function onClick() {
          void startTransition(() => {
            setEnabled(true);
          });
        }

        const Component = NestedCount(NestedCount(Count));

        return (
          <>
            <div>
              <Show when={enabled$()}>
                <Component count={1} />
              </Show>
            </div>
            <button onClick={onClick}>Enable</button>
          </>
        );
      })()}
    </Suspense>
  ),
};
