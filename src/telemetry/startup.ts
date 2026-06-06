import { startSpan } from "@/telemetry/span";

// The startup trace: anchored at the navigation start (performance.timeOrigin)
// and closed when the first pane reaches ready. Because the telemetry SDK is
// loaded lazily (dynamic import in index.tsx), phases are buffered as plain
// timestamps and materialized into spans retroactively at endStartup, by which
// time the SDK chunk has loaded.
type StartupPhase = { name: string; startMs: number; endMs?: number };

let active = false;
let startedAtMs: number | undefined;
let phases: StartupPhase[] = [];
let events: { name: string; timeMs: number }[] = [];

export function beginStartup(): void {
  if (active) return;
  active = true;
  startedAtMs = performance.timeOrigin;
  phases = [];
  events = [];
}

/**
 * Records a child phase and returns its end callback. Each phase runs at most
 * once; outside the startup window this is a no-op.
 */
export function beginStartupPhase(name: string): () => void {
  if (!active || phases.some((phase) => phase.name === name)) return () => undefined;

  const phase: StartupPhase = { name, startMs: Date.now() };
  phases.push(phase);
  return () => {
    phase.endMs ??= Date.now();
  };
}

export function addStartupEvent(name: string): void {
  if (!active) return;
  events.push({ name, timeMs: Date.now() });
}

/**
 * Closes the startup window and materializes the buffered phases into spans.
 * Called when the first pane is ready; idempotent.
 */
export function endStartup(): void {
  if (!active || startedAtMs === undefined) return;
  active = false;

  const endMs = Date.now();
  const root = startSpan("startup", { root: true, startTime: startedAtMs });
  for (const event of events) {
    root.addEvent(event.name, undefined, event.timeMs);
  }
  for (const phase of phases) {
    const span = startSpan(`startup.${phase.name}`, { parent: root, startTime: phase.startMs });
    span.end(phase.endMs ?? endMs);
  }
  root.end(endMs);

  startedAtMs = undefined;
  phases = [];
  events = [];
}

export function resetStartupForTest(): void {
  active = false;
  startedAtMs = undefined;
  phases = [];
  events = [];
}
