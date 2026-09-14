import { useEffect, useState, useSyncExternalStore } from "react";
import { BrandFooter } from "./BrandFooter";
import { PublicWorkbench } from "./PublicWorkbench";
import { PublicEntry, PublicDemo, PublicInstall } from "./entry/PublicEntry";
import { registerConnectionTools } from "./connection-tools";
import type { PageModelContext } from "./connection-tools";
import type { PublicConnection } from "./connection";
import { siteConfig } from "./site-config";

import { LanguageSwitch, useLocale } from './LanguageSwitch';
import { text as t } from './locale.ts';

export function PublicApp({ client }: { client: PublicConnection }) {
  const locale = useLocale();
  useEffect(() => { document.title = locale === "ja" ? "Unharness — AIの装備を見直す" : "Unharness — Find your fit"; }, [locale]);
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [page, setPage] = useState<"start" | "demo" | "install" | "connect">(view.phase === "disconnected" ? "start" : "connect");
  const [pageTools, setPageTools] = useState("checking");
  useEffect(() => { if (view.phase === "pairing" || view.phase === "incompatible") setPage("connect"); }, [view.phase]);
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: PageModelContext }).modelContext;
    const registration = registerConnectionTools(modelContext, client); let stopped = false;
    void registration.ready.then(result => { if (!stopped) setPageTools(result); });
    const timer = window.setInterval(() => client.tick(), 1000);
    return () => { stopped = true; registration.dispose(); window.clearInterval(timer); };
  }, [client]);
  function choose(next: "start" | "demo" | "install" | "connect") {
    if (next === "demo") client.disconnect();
    setPage(next);
  }
  const working = page === 'connect' && (view.phase === 'connected' || !!view.lastOperation || !!view.lastArtworkOperation);
  const siteNavigation = <nav className="public-nav" aria-label={t("公開画面", "Public pages")}><button aria-current={page === "demo" ? "page" : undefined} onClick={() => choose("demo")}>{view.phase === "connected" ? t("接続を閉じてデモを見る", "Disconnect and try the demo") : t("デモ", "Demo")}</button>
    <button aria-current={page === "install" ? "page" : undefined} onClick={() => choose("install")}>{t("導入", "Get started")}</button><button aria-current={page === "connect" ? "page" : undefined} onClick={() => choose("connect")}>{t("接続して開く", "Connect")}</button></nav>;
  return <div className="public-shell"><header className="topbar"><a className="wordmark" href="#main" onClick={() => choose("start")}>UNHARNESS<span>{t("装備を見直す。", "Find your fit.")}</span></a>
    <div className="header-right"><span className="public-release-label">{siteConfig.macCodexRelease?.version} {t("Macプレビュー", "Mac preview")}</span>{siteConfig.publicRepositoryUrl && <a href={siteConfig.publicRepositoryUrl} target="_blank" rel="noopener noreferrer">GitHub</a>}<LanguageSwitch/></div></header>
    {(working ? <details className="public-site-navigation"><summary>{t("紹介・導入", "About & installation")}</summary>{siteNavigation}</details> : siteNavigation)}
    {page === "start" ? <PublicEntry choose={choose}/> : page === "demo" ? <PublicDemo/> : page === "install" ? <PublicInstall/> : <PublicWorkbench client={client} view={view}/>}
    {page === "connect" && <details className="public-tool-note"><summary>{t("AIとの接続状況", "AI connection status")}</summary><p>{pageTools === "available" ? t("AI操作の入口を、このブラウザーに登録しました。", "AI controls are registered in this browser.")
      : pageTools === "checking" ? t("このブラウザーのAI操作機能を確認しています…", "Checking this browser’s AI controls…") : t("このブラウザーではページのAI操作機能を確認できません。ボタン、またはローカルのUnharness接続で操作できます。", "AI page controls are unavailable here. Use the buttons or your local Unharness connection.")}</p></details>}
    <BrandFooter/>
  </div>;
}
