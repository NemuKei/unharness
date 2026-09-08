import { isAbsolute, resolve } from 'node:path';

export const MCP_USAGE = '  node bin/unharness.mjs mcp --workspace <registered-workspace>\n';
export async function mcpMain(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  if (argv.length === 2 && argv[1] === '--help') { stdout.write(MCP_USAGE); return 0; }
  if (argv.length !== 3 || argv[1] !== '--workspace' || !isAbsolute(argv[2]) || resolve(argv[2]) !== argv[2]) {
    stderr.write('Unharness MCP requires one existing absolute registered workspace.\n');
    return 2;
  }
  try {
    const { serveAiStdio } = await import('./server.mjs');
    return await serveAiStdio({ workspace: argv[2], stdin, stdout, stderr });
  } catch {
    stderr.write('Unharness MCP could not open the registered workspace or its local runtime.\n');
    return 1;
  }
}
