import type {ArtworkReview,ArtworkUpload} from './artwork.ts';
import {ENTITY_SHEETS,entityFrameAssets} from '../../src/appearances/entity-profile.mjs';

/** One review correspondence contract for private and paired-page receipts.
 * A pose/motion sheet expands to fixed rows from one explicit input file. */
export function matchesArtworkUpload(review:ArtworkReview,upload:{manifest:ArtworkUpload['manifest'];expectedStateId:string|null;files:Array<{fileId:string}>}) {
  const manifest=upload.manifest;
  if(!manifest || !Array.isArray(manifest.parts) || !Array.isArray(upload.files))return false;
  const same=(a:unknown[],b:unknown[])=>a.length===b.length && JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  const sheet=manifest.parts.find(part=>Object.hasOwn(ENTITY_SHEETS,part.partId));
  const spec=sheet?ENTITY_SHEETS[sheet.partId as keyof typeof ENTITY_SHEETS]:null;
  const expectedFiles=upload.files.flatMap(file=>file.fileId===sheet?.fileId ? spec!.frames.map(frame=>sheet.partId+'-'+frame):[file.fileId]);
  if(sheet) {
    const result=review.manifest;
    if(result.schemaVersion!==2 || result.layers.entity.profileId!==spec!.profileId
      || entityFrameAssets(result).some(row=>review.images.find(image=>image.fileId===sheet.partId+'-'+row.frameId)?.assetId!==row.assetId))return false;
  }
  return review.expectedStateId===upload.expectedStateId && review.baseItemId===manifest.baseItemId
    && review.manifest.templateId===manifest.templateId && review.name===manifest.name.trim() && review.author===manifest.author.trim()
    && same(review.replacedParts,manifest.parts.map(part=>part.partId)) && same(review.images.map(file=>file.fileId),expectedFiles);
}
