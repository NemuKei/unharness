export type MacCodexRelease = Readonly<{
  version: string;
  archiveUrl: string;
  archiveSha256: string;
  distributionId: string;
  sourceUrl: string;
}>;

export const siteConfig = Object.freeze({
  author: "DeltaHelm Lab",
  authorUrl: "https://deltahelmlab.com/",
  releaseLabel: "0.0.8 Macプレビュー",
  publicRepositoryUrl: "https://github.com/NemuKei/unharness" as string | null,
  // Set only after the selected public archive and source can be retrieved and verified.
  macCodexRelease: Object.freeze({
    version: "0.0.8",
    archiveUrl: "https://github.com/NemuKei/unharness/releases/download/v0.0.8/unharness-0.0.8-macos-arm64.zip",
    archiveSha256: "77c3e3a4bb6fdf310d2bbc6c6bd2b0a66597ca7e780aed11bced11ce6c292d41",
    distributionId: "a2f07e892ba61be1cbc33914895587aa5ede0a571f5c99413a5e6a1aa2cccd68",
    sourceUrl: "https://github.com/NemuKei/unharness/tree/e4f557d204f6beb48602616143fe98ac0ca5d390",
  }) as MacCodexRelease | null,
});
