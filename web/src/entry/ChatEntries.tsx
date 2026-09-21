import { text as t } from '../locale.ts';
import { AiRequestButton } from '../AiRequestButton';
import { chatRequests, modeChatRequest } from '../chat-requests';

export function ChatEntries() {
  return <section className="entry-functions" aria-labelledby="entry-functions-title">
    <p className="eyebrow">{t("使い方は、あなたに合わせて。", "YOUR WAY TO USE IT")}</p>
    <h2 id="entry-functions-title">{t("画面で操作。チャットで依頼。", "Use the screen. Ask in chat.")}</h2>
    <p>{t("導入後は、画面から操作しても、チャットで頼んでも同じ機能を使えます。依頼例を押すとコピーできます。", "After installation, the screen and chat use the same operations. Select a request example to copy it.")}</p>
    <dl className="chat-examples">{chatRequests.map(request => <div key={request.id}>
      <dt>{request.label}</dt><dd><AiRequestButton label={'「' + request.example + '」'}
        prompt={request.id === 'mode' ? modeChatRequest('trueform') : request.example}
        description={null} preview={false}/><p>{request.description}</p></dd>
    </div>)}</dl>
    <p className="entry-functions-note">{t("ローカル画面は「モード」が入口です。「記録・比較」「外観」「設定」「接続・復旧」は「その他」から開けます。公開サイトへの接続許可は不要です。", "Start with Mode in the local workbench. Open Work records, Appearance, Settings or Connection & recovery from More. No public-site pairing is needed.")}</p>
  </section>;
}
