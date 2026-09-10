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
  releaseLabel: "0.0.1 開発プレビュー",
  publicRepositoryUrl: "https://github.com/NemuKei/unharness" as string | null,
  // Set only after the selected public archive and source can be retrieved and verified.
  macCodexRelease: Object.freeze({
    version: "0.0.1",
    archiveUrl: "https://github.com/NemuKei/unharness/releases/download/v0.0.1/unharness-0.0.1-macos-arm64.zip",
    archiveSha256: "581f523d663958ddb78b016f8901305f5fa9cf4551b474364368d1bc8a0bc2d2",
    distributionId: "dcacd38531d8a07e38da2488713966668548b09b585e47f6b7eac865674a28e3",
    sourceUrl: "https://github.com/NemuKei/unharness/tree/v0.0.1",
  }) as MacCodexRelease | null,
});
