import {
  type Attributes,
  type Context,
  type Link,
  type Span,
  type SpanContext,
  type Tracer,
  context as otelContext,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

export { SpanStatusCode } from "@opentelemetry/api";
export type { Attributes, Link, Span } from "@opentelemetry/api";

const noopTracer = trace.getTracer("rejysten3");

let tracer: Tracer = noopTracer;

// Called by initTelemetry/resetTelemetryForTest in @/telemetry/provider.
// Until then the no-op tracer keeps every helper side-effect free.
export function setTelemetryTracer(newTracer: Tracer | undefined): void {
  tracer = newTracer ?? noopTracer;
}

// The current user action. A module variable is sound because awaitable()
// runs action bodies strictly sequentially.
let currentActionSpan: Span | undefined;
let currentActionContext: Context | undefined;
let lastActionSpanContext: SpanContext | undefined;

function recordError(span: Span, error: unknown): void {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({ code: SpanStatusCode.ERROR });
}

export type ActionHandle = {
  readonly span: Span;

  /** Records the time spent waiting for prior awaitable callbacks as a child span. Returns the end callback. */
  startQueueWait: () => () => void;

  /** Runs the action body with this action installed as the current one, then ends the root span. */
  runBody: <T>(body: () => Promise<T>) => Promise<T>;

  /** Ends the root span immediately, for synchronous actions that never reach awaitable(). */
  endSync: (error?: unknown) => void;
};

export type BeginActionOptions = {
  attributes?: Attributes;
  links?: Link[];
  /** Forces a root span even while another action is running. */
  root?: boolean;
};

/**
 * Starts a root span for a user action. When another action body is currently
 * running (an action invoking another action synchronously), the new span is
 * parented to it instead of becoming a root, unless `root` is set.
 */
export function beginAction(name: string, options?: BeginActionOptions): ActionHandle {
  const span = tracer.startSpan(
    `action:${name}`,
    { attributes: options?.attributes, links: options?.links, root: options?.root },
    currentActionContext,
  );
  const ctx = trace.setSpan(otelContext.active(), span);
  lastActionSpanContext = span.spanContext();

  let ended = false;
  const end = (error?: unknown) => {
    if (ended) return;
    ended = true;
    if (error !== undefined) recordError(span, error);
    span.end();
  };

  return {
    span,

    startQueueWait: () => {
      const queueWaitSpan = tracer.startSpan("awaitable.queueWait", undefined, ctx);
      return () => {
        queueWaitSpan.end();
      };
    },

    runBody: async (body) => {
      const prevSpan = currentActionSpan;
      const prevContext = currentActionContext;
      currentActionSpan = span;
      currentActionContext = ctx;
      try {
        return await body();
      } catch (error) {
        recordError(span, error);
        throw error;
      } finally {
        currentActionSpan = prevSpan;
        currentActionContext = prevContext;
        end();
      }
    },

    endSync: end,
  };
}

// Handoff slot between the action registry wrapper (which knows the action
// name) and awaitable() (which owns the callback lifecycle). The wrapper
// offers the handle just before invoking the registered function; awaitable()
// takes it synchronously in the same tick. A leftover handle means the action
// was synchronous, and the wrapper ends it itself.
let actionHandoff: ActionHandle | undefined;

export function offerActionHandoff(handle: ActionHandle): void {
  actionHandoff = handle;
}

export function takeActionHandoff(): ActionHandle | undefined {
  const handle = actionHandoff;
  actionHandoff = undefined;
  return handle;
}

/**
 * Wraps a registered action so every invocation gets a span named after the
 * registry key. The handle is offered to awaitable() through the handoff
 * slot; when the wrapped function never reaches awaitable() (a synchronous
 * action), the leftover handle is ended here.
 */
export function wrapAction<Args extends unknown[], Result>(
  name: string,
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args) => {
    const previous = takeActionHandoff();
    const handle = beginAction(name);
    offerActionHandoff(handle);
    try {
      return fn(...args);
    } catch (error) {
      handle.endSync(error);
      throw error;
    } finally {
      const leftover = takeActionHandoff();
      if (leftover === handle) handle.endSync();
      if (previous !== undefined) offerActionHandoff(previous);
    }
  };
}

export type SpanOptions = {
  /** Explicit parent. Defaults to the current action span; with neither, the span becomes a root. */
  parent?: Span;
  /** Forces a root span even while an action is running. */
  root?: boolean;
  attributes?: Attributes;
  links?: Link[];
  /** Epoch milliseconds. */
  startTime?: number;
};

/** Starts a span the caller is responsible for ending, e.g. one outliving the current action. */
export function startSpan(name: string, options?: SpanOptions): Span {
  return tracer.startSpan(
    name,
    {
      attributes: options?.attributes,
      links: options?.links,
      root: options?.root,
      startTime: options?.startTime,
    },
    options?.parent ? trace.setSpan(otelContext.active(), options.parent) : currentActionContext,
  );
}

export function endSpan(span: Span, error?: unknown): void {
  if (error !== undefined) recordError(span, error);
  span.end();
}

/**
 * Runs fn inside a span and ends the span when fn completes, preserving fn's
 * synchronous or asynchronous return shape. Errors are recorded and rethrown.
 */
export function withSpan<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T {
  const span = startSpan(name, options);
  try {
    const result = fn(span);
    if (result instanceof Promise) {
      const promise = result.then(
        (value: unknown) => {
          span.end();
          return value;
        },
        (error: unknown) => {
          recordError(span, error);
          span.end();
          throw error;
        },
      );
      return promise as T;
    }
    span.end();
    return result;
  } catch (error) {
    recordError(span, error);
    span.end();
    throw error;
  }
}

export function getCurrentActionSpan(): Span | undefined {
  return currentActionSpan;
}

/**
 * Installs a span as the current parent for the SYNCHRONOUS duration of fn,
 * so spans created within (e.g. overlay.mergeQuery during a snapshot
 * callback) nest under it. Must not be used across awaits — unrelated code
 * interleaving on the microtask queue would inherit the scope.
 */
export function withCurrentSpan<T>(span: Span, fn: () => T): T {
  const prevSpan = currentActionSpan;
  const prevContext = currentActionContext;
  currentActionSpan = span;
  currentActionContext = trace.setSpan(otelContext.active(), span);
  try {
    return fn();
  } finally {
    currentActionSpan = prevSpan;
    currentActionContext = prevContext;
  }
}

/** Adds an event to the current action span, or does nothing outside an action. */
export function addActionEvent(name: string, attributes?: Attributes): void {
  currentActionSpan?.addEvent(name, attributes);
}

/** Link to the most recently started action, for root spans fired outside any action (snapshots, debounces). */
export function lastActionLink(): Link | undefined {
  return lastActionSpanContext ? { context: lastActionSpanContext } : undefined;
}

/** Called by the longtask PerformanceObserver in @/telemetry/provider. Times are epoch milliseconds. */
export function recordLongTask(startTimeMs: number, durationMs: number): void {
  if (currentActionSpan) {
    currentActionSpan.addEvent("longtask", { "app.duration_ms": durationMs }, startTimeMs);
    return;
  }

  const span = tracer.startSpan("longtask", {
    startTime: startTimeMs,
    attributes: { "app.duration_ms": durationMs },
  });
  span.end(startTimeMs + durationMs);
}

export function resetTelemetrySpanStateForTest(): void {
  currentActionSpan = undefined;
  currentActionContext = undefined;
  lastActionSpanContext = undefined;
  actionHandoff = undefined;
}
