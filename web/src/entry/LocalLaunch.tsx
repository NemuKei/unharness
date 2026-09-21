import { text as t } from '../locale.ts';
import { codexDraftLink } from './codex-start';
import { CopyRequest } from './CopyRequest';

export function localOpenRequest() {
  return t('アンハーネスのローカル画面を開いてください。Unharnessのstatusで登録済みの接続先を確認し、open_workbenchが返す確認済みURLをCodex内で開いてください。公開サイトへの接続許可は不要です。今のモードや保存した設定は変えないでください。', 'Open the local Unharness workbench. Use status to check the registered connection, then open the verified URL from open_workbench inside Codex. No public-site pairing is needed. Preserve the prepared mode and saved settings. Please guide me in English.');
}

export function LocalLaunch({ legacyAvailable = false, onLegacy }: { legacyAvailable?: boolean; onLegacy?: () => void }) {
  const request = localOpenRequest();
  return <main id="main" className="public-entry local-launch-entry"><section className="public-panel">
    <p className="eyebrow">{t('導入済みの方へ', 'ALREADY INSTALLED')}</p>
    <h1>{t('操作は、このMacの画面で。', 'Use the workbench on your Mac.')}</h1>
    <p className="entry-lead">{t('Codexに「アンハーネスを開いて」と頼むだけ。モード変更も、仕事の記録も、復旧も、開いた画面で行えます。', 'Ask Codex to open Unharness. Change modes, review work and recover from that same local screen.')}</p>
    <a className="primary codex-start-link" href={codexDraftLink(request)}>{t('Codexに開く依頼を渡す', 'Pass the opening request to Codex')} <span aria-hidden="true">↗</span></a>
    <p className="codex-start-hint">{t('依頼文がCodexの入力欄に入ります。内容を確認して送信してください。', 'Opens a draft in Codex. Review the request and send it when ready.')}</p>
    <CopyRequest text={request} button={t('開くための依頼文をコピー', 'Copy the opening request')} label={t('Unharnessを開く依頼', 'Request to open Unharness')}/>
    {legacyAvailable && onLegacy && <button className="entry-returning" onClick={onLegacy}>{t('以前の接続・操作結果を確認', 'Review an earlier connection or operation result')}</button>}
    <p className="boundary">{t('公開サイトは紹介・デモ・導入案内の場所です。設定や作品は、これまでどおりPC内に残ります。', 'This site provides information, demos and installation guidance. Your settings and artwork remain on your computer.')}</p>
  </section></main>;
}
