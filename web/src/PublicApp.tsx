import { useEffect, useState, useSyncExternalStore } from "react";
import { BrandFooter } from "./BrandFooter";
import { PublicWorkbench } from "./PublicWorkbench";
import { PublicEntry, PublicDemo, PublicInstall } from "./entry/PublicEntry";
import { registerConnectionTools } from "./connection-tools";
import type { PageModelContext } from "./connection-tools";
import type { PublicConnection } from "./connection";
import { siteConfig } from "./site-config";

export function PublicApp({ client }: { client: PublicConnection }) {
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
  return <div className="public-shell"><header className="topbar"><a className="wordmark" href="#main" onClick={() => choose("start")}>UNHARNESS<span>装備を見直す。</span></a>
    <div className="header-right"><span className="public-release-label">{siteConfig.releaseLabel}</span></div></header>
    {page !== "start" && <nav className="public-nav" aria-label="公開画面"><button aria-current={page === "demo" ? "page" : undefined} onClick={() => choose("demo")}>{view.phase === "connected" ? "接続を閉じてデモを見る" : "デモ"}</button>
      <button aria-current={page === "install" ? "page" : undefined} onClick={() => choose("install")}>導入</button><button aria-current={page === "connect" ? "page" : undefined} onClick={() => choose("connect")}>接続して開く</button></nav>}
    {page === "start" ? <PublicEntry choose={choose}/> : page === "demo" ? <PublicDemo/> : page === "install" ? <PublicInstall/> : <PublicWorkbench client={client} view={view}/>}
    {page === "connect" && <p className="public-tool-note">{pageTools === "available" ? "AI操作の入口を、このブラウザーに登録しました。"
      : pageTools === "checking" ? "このブラウザーのAI操作機能を確認しています…" : "このブラウザーではページのAI操作機能を確認できません。ボタン、またはローカルのUnharness接続で操作できます。"}</p>}
    <BrandFooter/>
  </div>;
}
