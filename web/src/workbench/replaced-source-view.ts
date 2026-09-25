import { text as t } from '../locale.ts';

export type ReplacedSourceReview = {
  reviewId: string; sourceId: string; nextScopeId: string; label: string; bodyChanged: boolean;
  body?: string; missingPreparedFiles: string[];
  details: { path: string; previousDirectory: { ino: number }; currentDirectory: { ino: number }; nextSourceId: string };
};
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function validReplacementReview(value: unknown, sourceId: string): value is ReplacedSourceReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>, details = row.details as Record<string, unknown> | undefined;
  return hash(row.reviewId) && row.sourceId === sourceId && hash(row.nextScopeId)
    && typeof row.label === 'string' && row.label.length > 0 && row.label.length <= 256
    && typeof row.bodyChanged === 'boolean' && (!row.bodyChanged || typeof row.body === 'string')
    && Array.isArray(row.missingPreparedFiles) && row.missingPreparedFiles.every(v => v === 'policy' || v === 'format')
    && !!details && typeof details.path === 'string' && details.path.length > 0
    && typeof details.nextSourceId === 'string' && /^skill-[a-f0-9]{64}$/.test(details.nextSourceId)
    && !!details.previousDirectory && typeof (details.previousDirectory as { ino?: unknown }).ino === 'number'
    && !!details.currentDirectory && typeof (details.currentDirectory as { ino?: unknown }).ino === 'number';
}
export const replacedSourceHeadline = (label: string) => t(`「${label}」が更新され、フォルダーが入れ替わりました。新しい中身を確認して、登録し直してください。`,
  `“${label}” was updated and its folder was replaced. Review the new contents before registering it again.`);
export const canApplyReplacement = (review: ReplacedSourceReview, location: boolean, content: boolean) =>
  location && (!review.bodyChanged || content);
