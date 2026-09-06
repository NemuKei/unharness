#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { collectProbe, probeSucceeded } from '../src/codex/probe.mjs';

const USAGE = `Usage: node bin/unharness.mjs inspect [options]

Options:
  --cwd <directory>       Directory used for Codex source discovery
  --codex <executable>    Native Codex executable (default: codex)
  --output <file>         Create a JSON report without overwriting
  --timeout-ms <integer>  Request timeout from 100 to 60000 (default: 10000)
  --help                  Show this help
`;

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  if (argv[0] !== 'inspect') return null;
  if (argv.length === 2 && argv[1] === '--help') return { help: true };

  const values = { cwd: process.cwd(), executable: 'codex', timeoutMs: 10000 };
  const names = new Map([
    ['--cwd', 'cwd'],
    ['--codex', 'executable'],
    ['--output', 'output'],
    ['--timeout-ms', 'timeoutMs'],
  ]);
  const seen = new Set();

  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = names.get(flag);
    const value = argv[index + 1];
    if (!key || value === undefined || value.length === 0 || seen.has(flag)) return null;
    seen.add(flag);
    values[key] = value;
  }

  if (!/^\d+$/.test(String(values.timeoutMs))) return null;
  values.timeoutMs = Number(values.timeoutMs);
  if (!Number.isSafeInteger(values.timeoutMs) || values.timeoutMs < 100 || values.timeoutMs > 60000) return null;
  if (/\.(?:cmd|bat)$/i.test(values.executable)) return { wrapperError: true };
  return values;
}

export async function main(argv = process.argv.slice(2), {
  stdout = process.stdout,
  stderr = process.stderr,
  collect = collectProbe,
  executableArgs = [],
} = {}) {
  const options = parseArgs(argv);
  if (options?.help) {
    stdout.write(USAGE);
    return 0;
  }
  if (options?.wrapperError) {
    stderr.write('A native codex.exe executable is required; .cmd and .bat wrappers are unsupported.\n');
    return 2;
  }
  if (!options) {
    stderr.write('Invalid command usage. Run with --help for supported options.\n');
    return 2;
  }

  let report;
  try {
    report = await collect({
      executable: options.executable,
      executableArgs,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
    });
  } catch {
    stderr.write('The Codex inventory could not be collected.\n');
    return 1;
  }

  const json = `${JSON.stringify(report)}\n`;
  let outputWritten = true;
  if (options.output) {
    try {
      await mkdir(dirname(options.output), { recursive: true });
      await writeFile(options.output, json, { encoding: 'utf8', flag: 'wx' });
    } catch {
      outputWritten = false;
      stderr.write('Unable to create output file.\n');
    }
  }
  stdout.write(json);
  return outputWritten && probeSucceeded(report) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
