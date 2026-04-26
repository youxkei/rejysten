export function buildTestCasePattern(rawTitle) {
  const title = rawTitle.normalize("NFC").trim();

  if (!title) {
    return undefined;
  }

  const pattern = title
    .split(/\s+/u)
    .map((part) => part.replace(/[\\^$.*+?()[\]{}|/-]/gu, "\\$&"))
    .join("\\s+");

  return `(?:^|\\s)${pattern}$`;
}

export function buildTestCaseCliArgs(rawArgs) {
  const title = rawArgs.join(" ").normalize("NFC").trim();
  const anchoredPattern = buildTestCasePattern(title);
  return anchoredPattern ? ["test", "-t", anchoredPattern] : undefined;
}

export function runTestCaseCli(rawArgs, deps) {
  const args = buildTestCaseCliArgs(rawArgs);

  if (!args) {
    deps.error('Usage: pnpm test/case "test title"');
    deps.exit(1);
    return;
  }

  const child = deps.spawn("pnpm", args, {
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      deps.kill(deps.pid, signal);
      return;
    }

    deps.exit(code ?? 1);
  });
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  const { spawn } = await import("node:child_process");
  runTestCaseCli(process.argv.slice(2), {
    spawn,
    error: console.error,
    exit: process.exit,
    kill: process.kill,
    pid: process.pid,
  });
}
