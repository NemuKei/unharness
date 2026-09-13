import { PNG } from 'pngjs';
import { decodeLayerPng, normalizeLayerPng } from './assets.mjs';
import { ENTITY_ANCHOR, ENTITY_MODES, ENTITY_MAX_HEIGHT, entityPointFits } from './entity-profile.mjs';
import { fail } from '../sources/errors.mjs';

const invalid = () => fail('appearance-entity-poses-invalid');
export function normalizeEntityPoseSheet(input) {
  const png = decodeLayerPng(input), side = png.width;
  // Below 8/255 alpha is export dust, not a silhouette guide. Clear it before
  // silhouette detection and fitting so invisible specks cannot shrink the body.
  for(let i=3;i<png.data.length;i+=4) if(png.data[i]<8)png.data[i]=0;
  let opaque = 0;
  for(let i=3;i<png.data.length;i+=4)if(png.data[i])opaque++;
  if (!opaque || opaque > side*side*0.7) invalid();
  // Find three connected silhouettes, rather than cropping equal columns.
  // Long hair may overlap a neighbour's bounding rectangle at a different
  // height. The ownership mask keeps every output isolated in that case.
  const labels=new Int32Array(side*side),groups=[];
  for(let index=0;index<labels.length;index++) {
    if(labels[index] || !png.data[index*4+3])continue;
    if(groups.length>=4096)invalid();
    const id=groups.length+1,stack=[index],points=[];
    let left=side,right=-1,top=side,bottom=-1;labels[index]=id;
    while(stack.length) {
      const pixel=stack.pop(),x=pixel%side,y=Math.floor(pixel/side);points.push([x,y]);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(let yy=Math.max(0,y-1);yy<=Math.min(side-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(side-1,x+1);xx++) {
        const next=yy*side+xx;
        if(!labels[next] && png.data[next*4+3]) {labels[next]=id;stack.push(next);}
      }
    }
    groups.push({id,left,right,top,bottom,points});
  }
  groups.sort((a,b)=>b.points.length-a.points.length);
  if(groups.length<3 || groups[2].points.length<32)invalid();
  const primary=groups.slice(0,3), dust=groups.slice(3);
  // Tiny disconnected export flecks may be reassociated only by nearby pixels.
  // A fourth substantive part/pose is never silently discarded or merged.
  if(dust.some(g=>g.points.length>32) || dust.reduce((n,g)=>n+g.points.length,0)>Math.max(8,opaque*0.001))invalid();
  const primaryIds=new Set(primary.map(g=>g.id));
  const mainLabels=labels.slice();
  for(const group of dust) {
    let distance=Infinity,owner=null,ambiguous=false;
    for(const [x,y] of group.points)for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++) {
      const xx=x+dx,yy=y+dy,d=dx*dx+dy*dy;
      if(xx<0 || xx>=side || yy<0 || yy>=side || d>distance)continue;
      const id=mainLabels[yy*side+xx];if(!primaryIds.has(id))continue;
      if(d<distance){distance=d;owner=id;ambiguous=false;}else if(id!==owner)ambiguous=true;
    }
    if(ambiguous)invalid();
    if(owner!==null) {
      const to=primary.find(g=>g.id===owner);
      for(const [x,y] of group.points){labels[y*side+x]=owner;to.points.push([x,y]);to.left=Math.min(to.left,x);to.right=Math.max(to.right,x);to.top=Math.min(to.top,y);to.bottom=Math.max(to.bottom,y);}
    }
  }
  const regions=primary.sort((a,b)=>(a.left+a.right)-(b.left+b.right)).map((r,i)=>{
    if(r.left<1 || r.right>=side-1 || r.top<1 || r.bottom>=side-1)invalid();
    return {...r,mode:ENTITY_MODES[i],cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2};
  });
  let low=0,high=ENTITY_MAX_HEIGHT/Math.max(...regions.map(r=>r.bottom-r.top+1));
  const fits = scale => regions.every(r => r.points.every(([x,y])=>
    entityPointFits(r.mode,ENTITY_ANCHOR.x+(x-r.cx)*scale,ENTITY_ANCHOR.y+(y-r.cy)*scale)));
  for(let i=0;i<20;i++) { const mid=(low+high)/2; if(fits(mid))low=mid;else high=mid; }
  // Leave one raster pixel of slack rather than clipping the normalized result.
  const scale=low*0.99;
  if(!Number.isFinite(scale) || scale<=0 || Math.max(...regions.map(r=>(r.bottom-r.top)*scale))<80) invalid();
  const poses=regions.map(r=>{
    const data=Buffer.alloc(724*724*4);
    for(let y=0;y<724;y++)for(let x=0;x<724;x++) {
      const sx=Math.round(r.cx+(x-ENTITY_ANCHOR.x)/scale), sy=Math.round(r.cy+(y-ENTITY_ANCHOR.y)/scale);
      if(sx<r.left || sx>r.right || sy<r.top || sy>r.bottom)continue;
      const from=(sy*side+sx)*4, to=(y*724+x)*4;
      if(!png.data[from+3] || labels[sy*side+sx]!==r.id)continue;
      if(!entityPointFits(r.mode,x,y)) invalid();
      png.data.copy(data,to,from,from+4);
    }
    const image=normalizeLayerPng(PNG.sync.write({width:724,height:724,data}));
    return {...image,mode:r.mode,sourceWidth:side,sourceHeight:side,resized:side!==724};
  });
  return {scale,poses};
}
