import { text as t } from '../locale.ts';
import { AiRequestButton, stateCheckPrompt } from '../AiRequestButton.tsx';
import { bindChatScope } from '../chat-requests.ts';

export function FailureNotice({ message, detail, scopeId }: { message: string; detail: string | null; scopeId?: string | null }) {
  return <div className="home-failure" role="alert"><p>{message}</p>
    <AiRequestButton label={t('AIに調べてもらう', 'Ask AI to investigate')}
      prompt={bindChatScope(stateCheckPrompt(), scopeId ?? undefined)} preview={false} description={null}/>
    {detail && <details><summary>{t('詳しく', 'Details')}</summary><code>{detail}</code></details>}
  </div>;
}
