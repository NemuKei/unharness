import { ApiError } from '../api.ts';
import type { SourceMode, SourceView } from '../sources.ts';

type Reply = { status: 'completed'; result: unknown; state?: SourceView } | { status: 'failed'; error: unknown }
  | { status: 'context-updated' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function applyLoadout({ execute, proposal, mode }: {
  execute: (action: string, input: object) => Promise<Reply>;
  proposal: object; mode: Exclude<SourceMode, 'normal'>;
}): Promise<{ preparedMode: SourceMode; readback: 'matched'; state: SourceView | null }> {
  let finalState: SourceView | null = null;
  const call = async (action: string, input: object): Promise<Record<string, unknown>> => {
    const response = await execute(action, input);
    if (response.status === 'failed') throw response.error;
    if (response.status !== 'completed' || !response.result || typeof response.result !== 'object')
      throw new ApiError('gui-source-context-changed');
    if (action === 'apply') finalState = response.state ?? null;
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
  return { preparedMode: mode, readback: 'matched', state: finalState };
}

function confirmsNewMode(view: SourceView | null, mode: Exclude<SourceMode, 'normal'>, beforeRevision: number): view is SourceView {
  const source = view?.source;
  return !!source && source.preparedMode === mode && Number.isSafeInteger(source.revision)
    && source.revision > beforeRevision && !source.conflict && source.recovery.pending === false
    && source.registration.modeChangeRequired !== true;
}

export async function completeLoadoutChange({ execute, refresh, proposal, mode, beforeRevision }: {
  execute: (action: string, input: object) => Promise<Reply>;
  refresh: () => Promise<SourceView | null>; proposal: object;
  mode: Exclude<SourceMode, 'normal'>; beforeRevision: number;
}): Promise<SourceView> {
  let applied: Awaited<ReturnType<typeof applyLoadout>> | null = null, failure: unknown = null;
  try { applied = await applyLoadout({ execute, proposal, mode }); }
  catch (error) { failure = error; }
  let reread: SourceView | null = null;
  try { reread = await refresh(); } catch { /* The apply response may still carry a verified state. */ }
  if (reread) {
    if (!failure && confirmsNewMode(reread, mode, beforeRevision)) return reread;
    if (failure) throw failure;
    throw new ApiError('readback-unconfirmed');
  }
  if (applied?.state && confirmsNewMode(applied.state, mode, beforeRevision)) return applied.state;
  if (failure) throw failure;
  throw new ApiError('readback-unconfirmed');
}
