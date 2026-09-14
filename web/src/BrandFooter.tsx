import { text as t } from './locale.ts';
import { siteConfig } from "./site-config";
export function BrandFooter() {
  return <footer className="brand-footer"><span>UNHARNESS <span className="muted">{t("／ 設定と作品は、あなたのPCに。", "/ Settings and artwork stay on your computer.")}</span></span>
    <a href={siteConfig.authorUrl} rel="noopener noreferrer" target="_blank">{siteConfig.author}</a>
  </footer>;
}
