import {
  type ContextProvider,
  type ContextProviderProps,
  createContextProvider as createContextProviderOriginal,
} from "@solid-primitives/context";

export function createContextProvider<T, P extends ContextProviderProps>(
  name: string,
  factoryFn: (props: P) => T,
): [provider: ContextProvider<P>, useContext: () => T] {
  const [provider, useContext] = createContextProviderOriginal(factoryFn);

  return [
    provider,
    function () {
      const ctx = useContext();
      if (!ctx) {
        throw new Error(`use${name} must be used within ${name}Provider`);
      }

      return ctx;
    },
  ];
}
