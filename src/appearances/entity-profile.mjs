// Immutable presentation contract shared by the importer and renderer. Changes
// to placement or motion require a new profile ID, not new meanings for v1.
export const ENTITY_PROFILE_ID = 'entity-awakening/v1';
export const ENTITY_MOTION_PROFILE_ID = 'entity-awakening/v2';
export const ENTITY_MODES = Object.freeze(['normal', 'unseal', 'trueform']);
export const ENTITY_UNFOLD_FRAMES = Object.freeze(Array.from({length:9},(_,i)=>'unfold-'+i));
export const ENTITY_MOTION_FRAMES = Object.freeze(['normal','unseal',...ENTITY_UNFOLD_FRAMES,'trueform']);
export const ENTITY_SHEETS = Object.freeze({
  'entity-poses':Object.freeze({profileId:ENTITY_PROFILE_ID,frames:ENTITY_MODES}),
  'entity-motion':Object.freeze({profileId:ENTITY_MOTION_PROFILE_ID,frames:ENTITY_MOTION_FRAMES}),
});
export const ENTITY_ANCHOR = Object.freeze({ x: 362, y: 330 });
export const ENTITY_RELEASE_CENTERS = Object.freeze({ normal: 375, unseal: 375, trueform: 315 });
export const ENTITY_MAX_HEIGHT = 420;
export const ENTITY_CROWN_FRACTION = 0.075;
const closed = [355,164,369,164,539,370,539,398,372,575,350,575,183,397,183,355];
// A point must remain inside every edge with clearance for idle motion and
// raster rounding. The capsule is convex and its winding is clockwise on screen.
export function entityPointFits(mode, x, y) {
  const worldY = y - ENTITY_ANCHOR.y + ENTITY_RELEASE_CENTERS[mode];
  if (mode === 'trueform') return x >= 194 && x <= 530 && worldY >= 100 && worldY <= 538;
  if (mode !== 'normal' && mode !== 'unseal') return false;
  for (let i = 0; i < closed.length; i += 2) {
    const j = (i+2) % closed.length, dx = closed[j]-closed[i], dy = closed[j+1]-closed[i+1];
    if ((dx*(worldY-closed[i+1])-dy*(x-closed[i])) / Math.hypot(dx,dy) < 16) return false;
  }
  return true;
}
export function entityModeAtRelease(release) { return release < 0.7 ? 'normal' : release < 1.65 ? 'unseal' : 'trueform'; }
export function entityFrameAtRelease(profileId,release) {
  if(profileId!==ENTITY_MOTION_PROFILE_ID || release<1)return entityModeAtRelease(release);
  // Equal release intervals; retargeting/reversal samples this same sequence.
  const index=Math.round(Math.max(0,Math.min(1,release-1))*10+1e-9);
  return ENTITY_MOTION_FRAMES[index+1];
}
export function entityMotion(mode, time, effects) {
  if (!effects) return { y: 0, emission: 0, crown: 0, field: 0 };
  if (mode === 'normal') return { y: Math.sin(time*Math.PI/4)*0.6, emission: 0.05, crown: 0, field: 0 };
  if (mode === 'unseal') return { y: Math.sin(time*Math.PI/3.5)*1.2, emission: 0.16 + Math.sin(time*0.7)**2*0.07, crown: 0, field: 0 };
  return { y: Math.sin(time*1.4)*2.8, emission: 0.5 + Math.sin(time*1.8)**2*0.22,
    crown: 3 + Math.sin(time*1.5)**2*2, field: 0.55 + Math.sin(time*1.2)**2*0.2 };
}
export function entityAssetIds(manifest) {
  return manifest.schemaVersion === 2 ? entityFrameAssets(manifest).map(row=>row.assetId) : [manifest.layers.entity.assetId];
}
export function entityFrameAssets(manifest) {
  if(manifest.schemaVersion!==2)return [];
  const entity=manifest.layers.entity,frames=entity.profileId===ENTITY_MOTION_PROFILE_ID?ENTITY_MOTION_FRAMES:ENTITY_MODES;
  return frames.map(frameId=>({frameId,mode:ENTITY_MODES.includes(frameId)?frameId:'trueform',
    assetId:frameId.startsWith('unfold-')?entity.unfold[Number(frameId.slice(7))].assetId:entity.poses[frameId].assetId}));
}
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v,key));
export function validEntityLayer(entity, version, assetIds) {
  const part = v => exact(v,['assetId']) && assetIds.has(v.assetId);
  if(version===1) return part(entity);
  if(version!==2 || !entity || !exact(entity.poses,ENTITY_MODES) || !ENTITY_MODES.every(mode=>part(entity.poses[mode])))return false;
  if(entity.profileId===ENTITY_PROFILE_ID)return exact(entity,['profileId','poses']);
  return entity.profileId===ENTITY_MOTION_PROFILE_ID && exact(entity,['profileId','poses','unfold'])
    && Array.isArray(entity.unfold) && entity.unfold.length===ENTITY_UNFOLD_FRAMES.length && entity.unfold.every(part);
}
export function entityEmission(r,g,b) {
  const cyan=Math.max(0,Math.min(g,b)-r-45)/150;
  const amber=Math.max(0,Math.min(r,g*1.4)-b-45)/150 * Math.max(0,Math.min(1,(r-180)/55));
  return amber>cyan ? {strength:Math.min(1,amber),theme:'amber',color:0xffbf69}
    : {strength:Math.min(1,cyan),theme:'cyan',color:0x7bf4ff};
}
