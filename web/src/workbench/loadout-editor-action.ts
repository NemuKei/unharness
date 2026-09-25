import { ApiError } from '../api.ts';
import type { SourceMode } from '../sources.ts';

type Reply = { status: 'completed'; result: unknown } | { status: 'failed'; error: unknown }
  | { status: 'context-updated' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function applyLoadout({ execute, proposal, mode }: {
  execute: (action: string, input: object) => Promise<Reply>;
  proposal: object; mode: Exclude<SourceMode, 'normal'>;
}): Promise<{ preparedMode: SourceMode; readback: 'matched' }> {
  const call = async (action: string, input: object): Promise<Record<string, unknown>> => {
    const response = await execute(action, input);
    if (response.status === 'failed') throw response.error;
    if (response.status !== 'completed' || !response.result || typeof response.result !== 'object')
      throw new ApiError('gui-source-context-changed');
    return response.result as Record<string, unknown>;
  };
  const review = await call('review-setup', { proposal });
  if (!id(review.reviewId) || review.sourceFilesChanged !== 0) throw new ApiError('invalid-response');
  const adopted = await call('apply-setup', { reviewId: review.reviewId });
  if (!id(adopted.setupId) || adopted.adopted !== true) throw new ApiError('invalid-response');
  const plan = await call('plan', { mode });
  if (!id(plan.planId) || plan.mode !== mode) throw new ApiError('invalid-response');
  const applied = await call('apply', { planId: plan.planId });
  if (applied.preparedMode !== mode || applied.readback !== 'matched') throw new ApiError('readback-unconfirmed');
  return { preparedMode: mode, readback: 'matched' };
}
