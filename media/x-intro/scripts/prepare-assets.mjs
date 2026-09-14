import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const here = fileURLToPath(new URL("../", import.meta.url)),
  root = resolve(here, "../..");
const assets = [
  ["web/assets/hangar-states-v1.png", "art/hangar-states.png"],
  ["web/assets/hangar-empty-v4.png", "art/hangar-empty.png"],
  ...["silver-v2", "amber-v2"].flatMap((kind) =>
    [
      "normal",
      "unseal",
      "trueform",
      ...Array.from({ length: 9 }, (_, i) => "unfold-" + i),
    ].map((frame) => [
      "assets/appearance-examples/" + kind + "/entity-" + frame + ".png",
      "art/" + kind + "/entity-" + frame + ".png",
    ]),
  ),
];
const records = [];
for (const [from, to] of assets) {
  const target = join(here, "public", to);
  await mkdir(resolve(target, ".."), { recursive: true });
  await copyFile(join(root, from), target);
  records.push({
    source: from,
    file: to,
    sha256: createHash("sha256")
      .update(await readFile(target))
      .digest("hex"),
  });
}
await writeFile(
  join(here, "public", "asset-manifest.json"),
  JSON.stringify(
    { source: "Unharness bundled original artwork", files: records },
    null,
    2,
  ) + "\n",
);
console.log(`Prepared ${records.length} original product assets.`);
