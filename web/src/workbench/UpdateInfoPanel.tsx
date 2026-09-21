import packageInfo from '../../../package.json';
import { text as t } from '../locale.ts';
import { AiRequestButton } from '../AiRequestButton';

export function updateCheckPrompt() {
  return t('Unharnessのcheck_updatesで、導入済み版と利用可能な更新を確認してください。表示中のローカル画面版は' + packageInfo.version + 'ですが、それだけで導入版や最新版と断定しないでください。更新内容と保存したNormal・記録・復旧への影響を説明し、更新の適用はしないでください。', 'Use Unharness check_updates to inspect the installed version and available updates. This local screen reports version ' + packageInfo.version + ', but do not infer the installed or latest version from that alone. Explain the update and effects on saved Normal, records and recovery. Do not apply the update. Please answer in English.');
}

export function UpdateInfoPanel() {
  return <section className="update-info-panel" aria-label={t('更新情報', 'Update information')}>
    <div className="section-heading"><h2>{t('更新情報', 'Update information')}</h2><span>{t('確認できる事実だけを表示', 'Showing only verified facts')}</span></div>
    <dl><div><dt>{t('表示中の画面版', 'Displayed screen version')}</dt><dd>{packageInfo.version}</dd></div><div><dt>{t('導入版', 'Installed version')}</dt><dd>{t('未確認', 'Unconfirmed')}</dd></div><div><dt>{t('利用可能な最新版', 'Latest available version')}</dt><dd>{t('未確認', 'Unconfirmed')}</dd></div></dl>
    <p>{t('この画面自体は更新照会を行いません。依頼文をコピーして、別の確認としてAIに送ります。', 'This screen does not query for updates. Copy a request and send it to your AI as a separate check.')}</p>
    <AiRequestButton label={t('更新をAIに確認', 'Ask AI to check for updates')} prompt={updateCheckPrompt()} preview={false}/>
  </section>;
}
