import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (/@modelcontextprotocol|(^|\/)zod|yaml|catalog\.mjs|config-editor\.mjs|skill-policy\.mjs/.test(specifier))
    throw Error('Non-Node dependency');
  return next(specifier, context);
} });
const { main } = await import('../bin/unharness.mjs');
const [workspace] = process.argv.slice(2);
const output = { value: '', write(text) { this.value += text; } };
const error = { value: '', write(text) { this.value += text; } };
const codes = [];
for (const args of [['--help'], ['mcp', '--help'], ['sources', 'status', '--json', JSON.stringify({ workspace })],
  ['sources', 'recover', '--json', JSON.stringify({ workspace })]])
  codes.push(await main(args, { stdout: output, stderr: error }));
process.stdout.write(JSON.stringify({ codes, help: output.value.includes('mcp --workspace'), errors: error.value.length }));
