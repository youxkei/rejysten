import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { useRxDatabase } from "./rxdb";

export function ErrorBoundary(props: { children: React.ReactNode }) {
  const db = useRxDatabase();

  return (
    <ReactErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <>
          <div>Something went wrong.</div>
          <pre>{`${error}`}</pre>
          <button onClick={resetErrorBoundary}>retry</button>
          <button onClick={() => location.reload()}>reload</button>
          <button
            onClick={async () => {
              await db.remove();
              location.reload();
            }}
          >
            reset rxdb & reload
          </button>
        </>
      )}
    >
      {props.children}
    </ReactErrorBoundary>
  );
}
