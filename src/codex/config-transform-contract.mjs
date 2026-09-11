export const MAX_CONFIG_BYTES = 128 * 1024;
export const configTransformFailed = () => Object.assign(
  new Error('Codex configuration could not be safely transformed'), { kind: 'config-transform-failed' },
);
