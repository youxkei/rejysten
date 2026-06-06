/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_MODE?: "otlp" | "console" | "memory" | "none";
  readonly VITEST?: boolean | string;
}
