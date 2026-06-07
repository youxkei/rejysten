/** Formats the build-time commit timestamp in the viewer's local time; empty for missing/invalid input. */
export function formatCommitTime(isoTime: string): string {
  if (!isoTime) return "";

  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
