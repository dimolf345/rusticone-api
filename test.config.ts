import process from "node:process";
import { run } from "node:test";
import { spec } from "node:test/reporters";

// Ensure spawned per-file test processes resolve types against the test tsconfig.
process.env.TSX_TSCONFIG_PATH ??= "tsconfig.test.json";

run({
  globPatterns: ["**/*.test.ts"],
  concurrency: 1,
  timeout: 60_000,
  forceExit: true
})
  .on("test:fail", () => {
    process.exitCode = 1;
  })
  .compose(spec)
  .pipe(process.stdout);
