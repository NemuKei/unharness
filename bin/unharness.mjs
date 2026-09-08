#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { collectProbe, probeSucceeded } from '../src/codex/probe.mjs';
import { collectSourceInventory } from '../src/codex/inventory.mjs';
import { desktopMain, DESKTOP_USAGE } from '../src/codex/desktop-cli.mjs';
import { loadoutMain, LOADOUT_USAGE } from '../src/loadouts/cli.mjs';
import { sourcesMain, SOURCES_USAGE } from '../src/sources/cli.mjs';
import { guiMain, GUI_USAGE } from '../src/gui/cli.mjs';
import { mcpMain, MCP_USAGE } from '../src/ai/cli.mjs';
import {
  collectSourceControlProbe,
  sourceControlProbeSucceeded,
} from '../src/codex/source-controls.mjs';

const USAGE = `Usage:
  node bin/unharness.mjs inspect [options]
  node bin/unharness.mjs inspect-sources [options]
  node bin/unharness.mjs probe-controls [options]

Options:
  --cwd <directory>       Directory used for inspect source discovery
  --codex <executable>    Native Codex executable (default: codex)
  --output <file>         Create a JSON report without overwriting
  --timeout-ms <integer>  Request timeout from 100 to 60000 (default: 10000)
  --help                  Show this help
${DESKTOP_USAGE}\n${LOADOUT_USAGE}\n${GUI_USAGE}\n${SOURCES_USAGE}\n${MCP_USAGE}`;

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  const command = argv[0];
  if (!['inspect', 'inspect-sources', 'probe-controls'].includes(command)) return null;
  if (argv.length === 2 && argv[1] === '--help') return { help: true };

  const values = { command, executable: 'codex', timeoutMs: 10000 };
  if (command !== 'probe-controls') values.cwd = process.cwd();
  const names = new Map([
    ['--codex', 'executable'],
    ['--output', 'output'],
    ['--timeout-ms', 'timeoutMs'],
  ]);
  if (command !== 'probe-controls') names.set('--cwd', 'cwd');
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
  collectSources = collectSourceInventory,
  collectControls = collectSourceControlProbe,
  executableArgs = [],
} = {}) {
  if (['desktop-fixture', 'inspect-desktop'].includes(argv[0])) return desktopMain(argv, { stdout, stderr });
  if (argv[0] === 'loadouts') return loadoutMain(argv, { stdout, stderr });
  if (argv[0] === 'sources') return sourcesMain(argv, { stdout, stderr });
  if (argv[0] === 'gui') return guiMain(argv, { stdout, stderr });
  if (argv[0] === 'mcp') return mcpMain(argv, { stdout, stderr });
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
    const common = {
      executable: options.executable,
      executableArgs,
      timeoutMs: options.timeoutMs,
    };
    report = options.command === 'inspect'
      ? await collect({ ...common, cwd: options.cwd })
      : options.command === 'inspect-sources'
        ? await collectSources({ ...common, cwd: options.cwd })
        : await collectControls(common);
  } catch {
    stderr.write('The Codex inventory could not be collected.\n');
    return 1;
  }

  const json = `${JSON.stringify(report)}\n`;
  let outputWritten = true;
  if (options.output) {
    try {
      await mkdir(dirname(options.output), { recursive: true });
      await writeFile(options.output, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch {
      outputWritten = false;
      stderr.write('Unable to create output file.\n');
    }
  }
  stdout.write(json);
  const succeeded = options.command === 'inspect'
    ? probeSucceeded(report)
    : options.command === 'inspect-sources'
      ? probeSucceeded(report.probe) && report.instructions?.status === 'ok'
      : sourceControlProbeSucceeded(report);
  return outputWritten && succeeded ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
