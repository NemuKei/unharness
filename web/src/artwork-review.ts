import type {ArtworkReview,ArtworkUpload} from './artwork.ts';
import {ENTITY_MODES} from '../../src/appearances/entity-profile.mjs';

/** One review correspondence contract for private and paired-page receipts.
 * An entity sheet produces three rows; it is still one explicit input file. */
export function matchesArtworkUpload(review:ArtworkReview,upload:{manifest:ArtworkUpload['manifest'];expectedStateId:string|null;files:Array<{fileId:string}>}) {
  const manifest=upload.manifest;
  if(!manifest || !Array.isArray(manifest.parts) || !Array.isArray(upload.files))return false;
  const same=(a:unknown[],b:unknown[])=>a.length===b.length && JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  const poseFile=manifest.parts.find(part=>part.partId==='entity-poses')?.fileId;
  const expectedFiles=upload.files.flatMap(file=>file.fileId===poseFile ? ENTITY_MODES.map(mode=>'entity-poses-'+mode):[file.fileId]);
  if(poseFile) {
    const result=review.manifest;
    if(result.schemaVersion!==2 || ENTITY_MODES.some(mode=>review.images.find(image=>image.fileId==='entity-poses-'+mode)?.assetId!==result.layers.entity.poses[mode].assetId))return false;
  }
  return review.expectedStateId===upload.expectedStateId && review.baseItemId===manifest.baseItemId
    && review.manifest.templateId===manifest.templateId && review.name===manifest.name.trim() && review.author===manifest.author.trim()
    && same(review.replacedParts,manifest.parts.map(part=>part.partId)) && same(review.images.map(file=>file.fileId),expectedFiles);
}
