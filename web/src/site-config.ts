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
  releaseLabel: "0.0.9 Macプレビュー",
  publicRepositoryUrl: "https://github.com/NemuKei/unharness" as string | null,
  // Set only after the selected public archive and source can be retrieved and verified.
  macCodexRelease: Object.freeze({
    version: "0.0.9",
    archiveUrl: "https://github.com/NemuKei/unharness/releases/download/v0.0.9/unharness-0.0.9-macos-arm64.zip",
    archiveSha256: "d0e57db8b420e1c9e6891c9273f9137a0c330764200bae318f6c325be15dfdbd",
    distributionId: "4c5fe814d629a869df5ccdd30cdeff0680f5fa6d2dc4eb57b452203ad2c8b89b",
    sourceUrl: "https://github.com/NemuKei/unharness/tree/45a9a4c721ff03a002ab3e09dac451b7aa3923d4",
  }) as MacCodexRelease | null,
});
