/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_MODE?: "otlp" | "console" | "memory" | "none";
  readonly VITEST?: boolean | string;
}

/** Committer time of HEAD (strict ISO 8601), embedded at build time via vite define. Empty when git was unavailable. */
declare const __COMMIT_TIME__: string;
