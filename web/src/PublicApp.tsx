import { useEffect, useState } from "react";
import { BrandFooter } from "./BrandFooter";
import { PublicEntry, PublicDemo, PublicInstall } from "./entry/PublicEntry";
import { LocalLaunch } from './entry/LocalLaunch';
import { siteConfig } from "./site-config";

import { LanguageSwitch, useLocale } from './LanguageSwitch';
import { text as t } from './locale.ts';

export function PublicApp() {
  const locale = useLocale();
  useEffect(() => { document.title = locale === "ja" ? "Unharness — AIの装備を見直す" : "Unharness — Find your fit"; }, [locale]);
  type PublicPage = "start" | "demo" | "install" | "open";
  const [page, setPage] = useState<PublicPage>("start");
  function choose(next: PublicPage) {
    setPage(next);
  }
  const siteNavigation = <nav className="public-nav" aria-label={t("公開画面", "Public pages")}><button aria-current={page === "demo" ? "page" : undefined} onClick={() => choose("demo")}>{t("デモ", "Demo")}</button>
    <button aria-current={page === "install" ? "page" : undefined} onClick={() => choose("install")}>{t("導入", "Get started")}</button><button aria-current={page === "open" ? "page" : undefined} onClick={() => choose("open")}>{t("開き方を見る", "How to open")}</button></nav>;
  return <div className="public-shell"><header className="topbar"><a className="wordmark" href="#main" onClick={() => choose("start")}>UNHARNESS<span>{t("装備を見直す。", "Find your fit.")}</span></a>
    <div className="header-right"><span className="public-release-label">{siteConfig.macCodexRelease?.version} {t("Macプレビュー", "Mac preview")}</span>{siteConfig.publicRepositoryUrl && <a href={siteConfig.publicRepositoryUrl} target="_blank" rel="noopener noreferrer">GitHub</a>}<LanguageSwitch/></div></header>
    {siteNavigation}
    {page === "start" ? <PublicEntry choose={choose}/> : page === "demo" ? <PublicDemo/> : page === "install" ? <PublicInstall/> : <LocalLaunch/>}
    <BrandFooter/>
  </div>;
}
