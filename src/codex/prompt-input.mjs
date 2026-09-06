import { spawn } from 'node:child_process';

import { shutDownOwnedProcess, trackOwnedProcess } from './owned-process.mjs';

const MARKER_KEYS = ['fixed', 'procedure', 'skillCatalog', 'skillBody', 'userPrompt'];
const MESSAGE_ROLES = new Set(['system', 'developer', 'user', 'assistant']);
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function invalidResponse() {
  return Object.assign(new Error('Invalid prompt-input response'), { kind: 'invalid-response' });
}

export function summarizePromptInput(value, markers) {
  if (!Array.isArray(value)) throw invalidResponse();

  const texts = [];
  for (const message of value) {
    if (message?.type !== 'message'
      || !MESSAGE_ROLES.has(message.role)
      || !Array.isArray(message.content)
      || message.content.length === 0) {
      throw invalidResponse();
    }
    for (const content of message.content) {
      if (content?.type !== 'input_text' || typeof content.text !== 'string') {
        throw invalidResponse();
      }
      texts.push(content.text);
    }
  }

  return Object.fromEntries(MARKER_KEYS.map((key) => [
    key,
    texts.some((text) => text.includes(markers[key])),
  ]));
}

function commandError(kind) {
  return Object.assign(new Error(kind), { kind });
}

export function readPromptInput({
  executable,
  executableArgs = [],
  cwd,
  timeoutMs,
  markers,
  configOverride,
}) {
  const args = [
    ...executableArgs,
    'debug',
    'prompt-input',
    '--disable',
    'hooks',
    '--disable',
    'memories',
  ];
  if (configOverride !== undefined) args.push('--config', configOverride);
  args.push(markers.userPrompt);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      reject(commandError('spawn-error'));
      return;
    }

    const closeTracker = trackOwnedProcess(child);
    const chunks = [];
    let bytes = 0;
    let active = true;

    const finish = (operation) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      operation();
    };
    const stopWith = async (kind) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      await shutDownOwnedProcess(child, closeTracker, () => child.kill());
      reject(commandError(kind));
    };

    const timer = setTimeout(() => {
      void stopWith('timeout');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (!active) return;
      bytes += chunk.length;
      if (bytes <= MAX_RESPONSE_BYTES) chunks.push(chunk);
      else void stopWith('response-too-large');
    });
    child.stderr.on('data', () => {});
    child.on('error', () => finish(() => reject(commandError('spawn-error'))));
    child.on('close', (code) => {
      if (!active) return;
      if (code !== 0) {
        finish(() => reject(commandError('process-exit')));
        return;
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const summary = summarizePromptInput(value, markers);
        finish(() => resolve(summary));
      } catch {
        finish(() => reject(commandError('invalid-response')));
      }
    });
  });
}
