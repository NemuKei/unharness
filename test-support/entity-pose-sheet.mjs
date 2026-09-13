import {PNG} from 'pngjs';
export function entityPoseSheet({ opaque=false, missing=false, touching=false }={}) {
  const png=new PNG({width:600,height:600});
  const fill=(x,y,w,h,color)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)png.data.set(color,(j*600+i)*4);};
  if(opaque)fill(0,0,600,600,[30,30,30,255]);
  for(const [mode,[x,y,h]] of [[80,180,190],[270,180,190],...(missing?[]:[[460,60,430]])].entries()) {
    fill(x,y,60,h,[170,160,200,255]);fill(x+10,y+20,40,20,[0,200+mode*20,240,255]);
  }
  if(touching)fill(0,250,600,1,[80,80,80,255]);
  return PNG.sync.write(png);
}

export function entityMotionSheet({opaque=false,missing=false,crossing=false}={}) {
  const side=960,png=new PNG({width:side,height:side});
  const fill=(x,y,w,h,color)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)png.data.set(color,(j*side+i)*4);};
  if(opaque)fill(0,0,side,side,[30,30,30,255]);
  for(let frame=0;frame<(missing?11:12);frame++) {
    const height=frame<2?120:120+(frame-1)*14;
    const x=(frame%4)*240+95,y=Math.floor(frame/4)*320+Math.floor((320-height)/2);
    fill(x,y,50,height,[160+frame,150,190,255]);
    fill(x+10,y+12,30,18,[0,220,240,255]);
  }
  if(crossing)fill(190,150,70,5,[160,150,190,255]);
  return PNG.sync.write(png);
}
