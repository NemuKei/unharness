import { siteConfig } from "./site-config";
export function BrandFooter() {
  return <footer className="brand-footer"><span>UNHARNESS <span className="muted">／ 設定と作品は、あなたのPCに。</span></span>
    <a href={siteConfig.authorUrl} rel="noopener noreferrer" target="_blank">{siteConfig.author}</a>
  </footer>;
}
