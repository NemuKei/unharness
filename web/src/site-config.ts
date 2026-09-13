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
  releaseLabel: "0.0.6 Macプレビュー",
  publicRepositoryUrl: "https://github.com/NemuKei/unharness" as string | null,
  // Set only after the selected public archive and source can be retrieved and verified.
  macCodexRelease: Object.freeze({
    version: "0.0.6",
    archiveUrl: "https://github.com/NemuKei/unharness/releases/download/v0.0.6/unharness-0.0.6-macos-arm64.zip",
    archiveSha256: "8e91968f875f1d43a33e48783151f7370c8a07579e408214f7daf729e39d8e69",
    distributionId: "b34064ce6a91d48309e92481e3869e9d6af92b1ea986571ddfb6fee128a0a9f2",
    sourceUrl: "https://github.com/NemuKei/unharness/tree/b384bddc39805b0bccffce71ab981e7c133a51bb",
  }) as MacCodexRelease | null,
});
