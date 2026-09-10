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
  releaseLabel: "開発プレビュー",
  publicRepositoryUrl: null as string | null,
  // Set only after the selected public archive and source can be retrieved and verified.
  macCodexRelease: null as MacCodexRelease | null,
});
