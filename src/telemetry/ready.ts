// Lightweight signal that initTelemetry has completed, without importing the
// SDK chunk. Lets early actions (e.g. share on cold start) wait for the real
// tracer instead of recording their root span on the noop tracer.

let resolveReady!: () => void;

export const telemetryReady = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

export function markTelemetryReady(): void {
  resolveReady();
}
