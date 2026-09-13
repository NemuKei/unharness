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
  releaseLabel: "0.0.7 Macプレビュー",
  publicRepositoryUrl: "https://github.com/NemuKei/unharness" as string | null,
  // Set only after the selected public archive and source can be retrieved and verified.
  macCodexRelease: Object.freeze({
    version: "0.0.7",
    archiveUrl: "https://github.com/NemuKei/unharness/releases/download/v0.0.7/unharness-0.0.7-macos-arm64.zip",
    archiveSha256: "e09df97262117306f5d4f4c108fc6181687b1d3cc44743087250b9900eddb9cd",
    distributionId: "716ffa9aab9f0cfbdd218ed9de4ec0431cfd9eee3d0cead166bc073cad606f3f",
    sourceUrl: "https://github.com/NemuKei/unharness/tree/12647cd10a94819550d8fb08320af07772ca5d0b",
  }) as MacCodexRelease | null,
});
