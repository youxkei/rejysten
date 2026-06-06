import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  type ReadableSpan,
  type SpanProcessor,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { uuidv7 } from "uuidv7";

import { recordLongTask, resetTelemetrySpanStateForTest, setTelemetryTracer } from "@/telemetry/span";
import { resetStartupForTest } from "@/telemetry/startup";

export type TelemetryMode = "otlp" | "console" | "memory" | "none";

export type TelemetryInitOptions = {
  /** Defaults to "none" under vitest, otherwise VITE_TELEMETRY_MODE or "otlp". */
  mode?: TelemetryMode;
  /** OTLP/HTTP endpoint. Defaults to the same-origin proxy "/api/traces". */
  endpoint?: string;
  sessionId?: string;
};

const TRACER_NAME = "rejysten3";
const SERVICE_NAME = "rejysten3";

let provider: WebTracerProvider | undefined;
let inMemoryExporter: InMemorySpanExporter | undefined;
let cleanups: (() => void)[] = [];

function defaultMode(): TelemetryMode {
  if (import.meta.env.MODE === "test" || import.meta.env.VITEST) return "none";

  return import.meta.env.VITE_TELEMETRY_MODE ?? "otlp";
}

export function initTelemetry(options?: TelemetryInitOptions): void {
  if (provider) return;

  const mode = options?.mode ?? defaultMode();
  if (mode === "none") return;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    "session.id": options?.sessionId ?? uuidv7(),
    "device.user_agent": navigator.userAgent,
    "device.viewport_width": window.innerWidth,
    "device.viewport_height": window.innerHeight,
    "device.pixel_ratio": window.devicePixelRatio,
    "device.touch": navigator.maxTouchPoints > 0,
  });

  let spanProcessor: SpanProcessor;
  switch (mode) {
    case "memory": {
      inMemoryExporter = new InMemorySpanExporter();
      spanProcessor = new SimpleSpanProcessor(inMemoryExporter);
      break;
    }
    case "console": {
      spanProcessor = new SimpleSpanProcessor(new ConsoleSpanExporter());
      break;
    }
    case "otlp": {
      spanProcessor = new BatchSpanProcessor(new OTLPTraceExporter({ url: options?.endpoint ?? "/api/traces" }), {
        maxQueueSize: 512,
        maxExportBatchSize: 64,
        scheduledDelayMillis: 3000,
        exportTimeoutMillis: 8000,
      });
      break;
    }
  }

  const newProvider = new WebTracerProvider({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [spanProcessor],
  });
  provider = newProvider;
  setTelemetryTracer(newProvider.getTracer(TRACER_NAME));

  if (mode === "otlp") installFlushOnHide(newProvider);
  if (mode !== "memory") installLongTaskObserver();
}

// BatchSpanProcessor flushes on a timer, which loses queued spans when a
// mobile browser kills the backgrounded page. Flush eagerly when the page is
// hidden or being unloaded.
function installFlushOnHide(target: WebTracerProvider): void {
  const flush = () => {
    void target.forceFlush();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") flush();
  };

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibilityChange);
  cleanups.push(() => {
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}

// Hand-rolled replacement for @opentelemetry/instrumentation-long-task: that
// package needs a context manager (zone.js) to parent entries, while this one
// attaches long tasks to the current action span directly.
function installLongTaskObserver(): void {
  if (typeof PerformanceObserver === "undefined") return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordLongTask(performance.timeOrigin + entry.startTime, entry.duration);
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    cleanups.push(() => {
      observer.disconnect();
    });
  } catch (_error) {
    // The longtask entry type is unsupported on this browser.
  }
}

export function getFinishedSpansForTest(): ReadableSpan[] {
  return inMemoryExporter?.getFinishedSpans() ?? [];
}

export function clearFinishedSpansForTest(): void {
  inMemoryExporter?.reset();
}

export async function resetTelemetryForTest(): Promise<void> {
  const target = provider;
  provider = undefined;
  inMemoryExporter = undefined;

  for (const cleanup of cleanups) cleanup();
  cleanups = [];

  setTelemetryTracer(undefined);
  resetTelemetrySpanStateForTest();
  resetStartupForTest();

  await target?.shutdown();
}
