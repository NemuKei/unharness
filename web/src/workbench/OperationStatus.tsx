import { text as t } from '../locale.ts';

export type OperationKind = 'review' | 'save' | 'history' | 'compare' | 'output' | 'favorite';

const labels: Record<OperationKind, () => string> = {
  review: () => t('選んだ仕事の完了範囲を確認しています…', 'Reviewing the completed work…'),
  save: () => t('仕事の記録を保存しています…', 'Saving the work record…'),
  history: () => t('保存した仕事を確認しています…', 'Loading saved work…'),
  compare: () => t('選んだ記録を並べています…', 'Arranging selected records…'),
  output: () => t('保存した回答を開いています…', 'Opening the saved answer…'),
  favorite: () => t('記録の構成を保存しています…', 'Saving the recorded loadout…'),
};

export function OperationStatus({ kind }: { kind: OperationKind | null }) {
  return kind ? <p className="operation-status" role="status" aria-live="polite">{labels[kind]()}</p> : null;
}
