import { BlurFilter, Container, Graphics, Mesh, MeshGeometry, Texture } from 'pixi.js';
import { ENTITY_ANCHOR, ENTITY_MODES, ENTITY_MOTION_FRAMES, ENTITY_PROFILE_ID,ENTITY_MOTION_PROFILE_ID,ENTITY_CROWN_FRACTION, entityMotion,entityModeAtRelease,entityFrameAtRelease } from '../../src/appearances/entity-profile.mjs';
import type { EntityFrameId,EntityProfileId } from '../../src/appearances/entity-profile.mjs';
import {createEntityRadiance} from './entity-radiance';

export type EntityBounds = {left:number;top:number;right:number;bottom:number;theme:'cyan'|'amber'};
export type EntityLayout = Partial<Record<EntityFrameId,EntityBounds>> & {profileId?:EntityProfileId};

/** Pose-local motion only. Texture ownership remains with the scene selection. */
export function createAwakeningEntity(parent:Container) {
  const root=new Container(), field=new Graphics();
  root.position.set(-ENTITY_ANCHOR.x,-ENTITY_ANCHOR.y);
  root.addChild(field); parent.addChild(root); root.visible=false;
  const radiance=createEntityRadiance(root);
  const glow=new BlurFilter({strength:3,quality:2});
  let active=false,profileId:EntityProfileId=ENTITY_PROFILE_ID,shownFrame:EntityFrameId|null=null;
  const poses=ENTITY_MOTION_FRAMES.map(frameId=>{
    const positions=new Float32Array(9*4*2), uvs=positions.slice(), indices=[];
    for(let y=0;y<3;y++)for(let x=0;x<8;x++) {const a=y*9+x;indices.push(a,a+1,a+9,a+1,a+10,a+9);}
    const geometry=new MeshGeometry({positions,uvs,indices:new Uint32Array(indices)});
    const emission=new Mesh({texture:Texture.EMPTY,geometry}), body=new Mesh({texture:Texture.EMPTY,geometry});
    emission.blendMode='add';emission.filters=[glow];
    root.addChild(body,emission);
    return {frameId,geometry,body,emission,bounds:{left:0,top:0,right:724,bottom:724,theme:'cyan'} as EntityBounds,rest:positions.slice()};
  });
  function setLayers(textures:ReadonlyMap<string,Texture>|null,layout:EntityLayout={}) {
    profileId=layout.profileId??ENTITY_PROFILE_ID;
    const frames=profileId===ENTITY_MOTION_PROFILE_ID?ENTITY_MOTION_FRAMES:ENTITY_MODES;
    active=frames.every(frame=>textures?.has('entity-'+frame) && layout[frame]);
    shownFrame=null;
    root.visible=active;
    for(const pose of poses) {
      pose.body.texture=textures?.get('entity-'+pose.frameId)??Texture.EMPTY;
      pose.emission.texture=textures?.get('entity-emission-'+pose.frameId)??Texture.EMPTY;
      if(!active || !layout[pose.frameId])continue;
      pose.bounds=layout[pose.frameId]!;
      const b=pose.bounds, rows=[0,b.top,b.top+(b.bottom-b.top+1)*ENTITY_CROWN_FRACTION,724];
      for(let y=0;y<4;y++)for(let x=0;x<9;x++) {
        const i=(y*9+x)*2, px=x*724/8, py=rows[y];
        pose.rest[i]=px;pose.rest[i+1]=py;
        pose.geometry.uvs[i]=px/724;pose.geometry.uvs[i+1]=py/724;
      }
      pose.geometry.positions.set(pose.rest);pose.geometry.getBuffer('aUV').update();pose.geometry.getBuffer('aPosition').update();
    }
  }
  function render(release:number,time:number,effects:boolean) {
    if(!active)return;
    const mode=entityModeAtRelease(release),frame=entityFrameAtRelease(profileId,release);
    shownFrame=frame;
    const motion=entityMotion(mode,time,effects);
    for(const pose of poses) {
      pose.body.visible=pose.frameId===frame;pose.emission.visible=pose.frameId===frame && motion.emission>0;
      if(pose.frameId!==frame)continue;
      pose.emission.alpha=motion.emission*(profileId===ENTITY_MOTION_PROFILE_ID?1.5:1);
      pose.geometry.positions.set(pose.rest);
      // Only the crown row moves; the next row pins the forehead/face and all
      // remaining pixels exactly. No whole-body stretch or inferred skeleton.
      if(motion.crown && frame==='trueform')for(let x=0;x<9;x++) {
        const i=(9+x)*2, px=pose.rest[i], center=(pose.bounds.left+pose.bounds.right)/2;
        const distance=Math.abs(px-center)/Math.max(1,(pose.bounds.right-pose.bounds.left)/2);
        const influence=Math.max(0,1-distance);
        pose.geometry.positions[i]+=Math.round(Math.sign(px-center)*motion.crown*0.25*influence);
        pose.geometry.positions[i+1]-=Math.round(motion.crown*(0.65+0.35*Math.sin(x*1.7+time))*influence);
      }
      pose.geometry.getBuffer('aPosition').update();
    }
    const trueform=poses.find(p=>p.frameId==='trueform')!.bounds;
    const reveal=Math.max(0,Math.min(1,(release-1.3)/.7));
    radiance.render(trueform,time,profileId===ENTITY_MOTION_PROFILE_ID && effects?reveal*reveal*(3-2*reveal):0);
    field.clear();field.visible=profileId===ENTITY_PROFILE_ID && motion.field>0;
    if(field.visible) {
      const b=trueform,cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2,color=b.theme==='amber'?0xffbf69:0x7bf4ff;
      // Original geometric light crests, not official marks. They live behind
      // the opaque body and share the profile's effects-off/reduced-motion gate.
      const crestY=cy-64,turn=time*0.09;
      if(b.theme==='amber') {
        field.circle(cx,crestY,61).stroke({color,width:1.2,alpha:motion.field*0.32});
        const angles=[0,.36,.81,1.1,1.52,1.96,2.27,2.73,3.1,3.51,3.98,4.36,4.7,5.14,5.48,5.87];
        for(let ray=0;ray<angles.length;ray++) {
          const angle=turn+angles[ray],inner=64+(ray%3)*7,outer=127+(ray*7%4)*11;
          field.moveTo(cx+Math.cos(angle)*inner,crestY+Math.sin(angle)*inner);
          field.lineTo(cx+Math.cos(angle)*outer,crestY+Math.sin(angle)*outer);
          field.stroke({color,width:ray%2?2:3.5,alpha:motion.field*0.7});
        }
      } else {
        for(let orbit=0;orbit<6;orbit++) {
          const angle=turn+orbit*Math.PI/3+.32,ca=Math.cos(angle),sa=Math.sin(angle);
          for(let step=0;step<=44;step++) {
            const t=step/44*Math.PI*2,x=65+Math.cos(t)*48,y=Math.sin(t)*72;
            const px=cx+x*ca-y*sa,py=crestY+x*sa+y*ca;
            if(step===0 || step===23)field.moveTo(px,py);else if(step!==22)field.lineTo(px,py);
          }
          field.stroke({color,width:2.7,alpha:motion.field*0.65});
        }
        field.circle(cx,crestY,142).stroke({color,width:1,alpha:motion.field*0.3});
      }
      for(let ring=0;ring<3;ring++) {
        const rx=90+ring*24,ry=20+ring*7,centerY=cy-95+ring*98;
        for(let step=0;step<=44;step++) {
          const a=time*(0.3+ring*0.07)+step/44*Math.PI*1.65+ring;
          const x=cx+Math.cos(a)*rx,y=centerY+Math.sin(a)*ry+Math.cos(a)*15;
          if(!step)field.moveTo(x,y);else field.lineTo(x,y);
        }
        field.stroke({color,width:2.4,alpha:motion.field*(0.95-ring*0.1)});
      }
      for(let i=0;i<16;i++) {
        const phase=((time*(0.09+i%3*0.015)+i/16)%1);
        const x=cx+Math.sin(i*9.73+phase*1.1)*(80+i%4*12),y=b.bottom-phase*(b.bottom-b.top+30);
        field.rect(Math.round(x),Math.round(y),2,5+i%3).fill({color,alpha:Math.sin(phase*Math.PI)*motion.field});
      }
    }
  }
  return {setLayers,render,get active(){return active;},get profileId(){return profileId;},get frame(){return shownFrame;},destroy(){poses.forEach(p=>p.geometry.destroy(true));glow.destroy();radiance.destroy();}};
}
