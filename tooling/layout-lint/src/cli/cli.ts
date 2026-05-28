#!/usr/bin/env node
/**
 * Thin CLI shell around the pure {@link checkLayout} function.
 *
 * Usage: `layout-lint [path...]`
 *
 * Each path is treated as a package root (a directory expected to contain
 * a `src/` child). With no arguments, the current working directory is
 * scanned. Violations are printed to stderr grouped by package; the
 * process exits 1 if any are found.
 *
 * Per-package opt-in is structural: a package opts into enforcement by
 * adding a `check` script in its `package.json` that invokes this CLI.
 * Turbo's `check` task then picks it up.
 */
import { resolve } from "node:path";
import { checkLayout, type Violation } from "../check-layout/check-layout.ts";
import { readTree } from "../read-tree/read-tree.ts";

const args = process.argv.slice(2);
const targets =
  args.length === 0 ? [process.cwd()] : args.map((a) => resolve(a));

let totalViolations = 0;
for (const target of targets) {
  const tree = readTree(target);
  const violations = checkLayout(tree);
  totalViolations += violations.length;
  for (const v of violations) printViolation(target, v);
}

if (totalViolations > 0) {
  console.error(`\nlayout-lint: ${totalViolations} violation(s)`);
  process.exit(1);
}

function printViolation(target: string, v: Violation): void {
  console.error(`  [${v.rule}] ${target}: ${v.path}: ${v.message}`);
}
