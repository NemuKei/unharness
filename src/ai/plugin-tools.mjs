import { z } from 'zod';
import { AI_OUTPUT_SCHEMA } from './tools.mjs';

const schema = z.strictObject({});
const { $schema, ...inputSchema } = z.toJSONSchema(schema);
export const PLUGIN_STATUS_TOOL = Object.freeze({ action: 'installation-status', write: false, schema,
  definition: { name: 'installation_status',
    description: 'Read this local plugin connection and its exact native data directory. When configuration is required, use the bundled local configure command with the user-selected Codex profile and project; tools cannot change that binding or register sources. Existing configuration is never inferred from a task working directory.',
    inputSchema, outputSchema: AI_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } } });
