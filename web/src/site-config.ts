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
  releaseLabel: "0.0.4 Macプレビュー",
  publicRepositoryUrl: "https://github.com/NemuKei/unharness" as string | null,
  // Set only after the selected public archive and source can be retrieved and verified.
  macCodexRelease: Object.freeze({
    version: "0.0.4",
    archiveUrl: "https://github.com/NemuKei/unharness/releases/download/v0.0.4/unharness-0.0.4-macos-arm64.zip",
    archiveSha256: "ef2e44aee408f20fce05c1ae76cdade3f9879485c09775abee1e16b2dc752221",
    distributionId: "9d4c0cb53618fcb08fa9cad1d51afa65be5469bf1b8f9be43da5722ef895ace6",
    sourceUrl: "https://github.com/NemuKei/unharness/tree/f785edd9fc5a7061723133a34eddd3aa4998ef22",
  }) as MacCodexRelease | null,
});
