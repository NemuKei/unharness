import { collectProbe } from '../../src/codex/probe.mjs';

const fixtureIndex = process.argv.indexOf('--fixture');
if (fixtureIndex === -1) process.exit(0);

const scenarioIndex = process.argv.indexOf('--scenario');
const pidFileIndex = process.argv.indexOf('--pid-file');
const timeoutIndex = process.argv.indexOf('--timeout-ms');
const fixture = process.argv[fixtureIndex + 1];
const scenario = process.argv[scenarioIndex + 1];
const pidFile = process.argv[pidFileIndex + 1];
const timeoutMs = Number(process.argv[timeoutIndex + 1]);

const report = await collectProbe({
  executable: process.execPath,
  executableArgs: [fixture, '--scenario', scenario, '--pid-file', pidFile],
  timeoutMs,
});
process.stdout.write(`${JSON.stringify(report)}\n`);
