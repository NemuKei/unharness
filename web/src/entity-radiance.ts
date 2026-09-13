import {BlurFilter,ColorMatrixFilter,Container,Graphics} from 'pixi.js';
import type {EntityBounds} from './entity-awakening';

/** The v2 crest repeats its own silhouette outward; light never covers the body. */
export function createEntityRadiance(parent:Container) {
  const root=new Container(),line=new Graphics(),wide=new Graphics({context:line.context}),close=new Graphics({context:line.context});
  const wideBlur=new BlurFilter({strength:22,quality:3}),closeBlur=new BlurFilter({strength:6,quality:2});
  const gain=new ColorMatrixFilter();gain.brightness(2.4,false);
  wide.filters=[wideBlur,gain];close.filters=[closeBlur];
  wide.blendMode=close.blendMode=line.blendMode='add';
  wide.alpha=.95;close.alpha=1;
  root.addChild(wide,close,line);parent.addChild(root);root.visible=false;
  const angles=[0,.36,.81,1.1,1.52,1.96,2.27,2.73,3.1,3.51,3.98,4.36,4.7,5.14,5.48,5.87];
  function render(bounds:EntityBounds|undefined,time:number,strength:number) {
    root.visible=!!bounds && strength>0;line.clear();if(!bounds || !strength)return;
    const cx=(bounds.left+bounds.right)/2,cy=bounds.top+Math.min(90,(bounds.bottom-bounds.top)*.24);
    const amber=bounds.theme==='amber',color=amber?0xffb957:0x71eaff,white=amber?0xffecc4:0xd7fbff;
    const rotation=Math.sin(time*.12)*.07;
    const point=(x:number,y:number,scale:number,angle:number)=>({x:cx+(x*Math.cos(angle)-y*Math.sin(angle))*scale,
      y:cy+(x*Math.sin(angle)+y*Math.cos(angle))*scale});
    const crest=(scale:number,alpha:number,width:number,strokeColor=color)=>{
      if(amber) {
        // Irregular, broad radial strokes keep the familiar asterisk character.
        for(let i=0;i<angles.length;i++) {
          const angle=angles[i]+rotation,inner=27+(i%3)*3,outer=105+(i*7%5)*6;
          const a=point(inner,0,scale,angle),b=point(outer,0,scale,angle);
          line.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color:strokeColor,width:width*(i%3===0?2.3:1.4),alpha});
        }
      } else {
        // Six interlaced curved folds around a clear hexagonal centre.
        for(let i=0;i<6;i++) {
          const angle=rotation+i*Math.PI/3;
          const p=(x:number,y:number)=>point(x,y,scale,angle);
          const a=p(25,-14),b=p(25,-61),c=p(25,-98),d=p(70,-114),e=p(98,-81);
          const f=p(122,-54),g=p(111,-18),h=p(83,-2),j=p(43,21);
          line.moveTo(a.x,a.y).lineTo(b.x,b.y).bezierCurveTo(c.x,c.y,d.x,d.y,e.x,e.y)
            .bezierCurveTo(f.x,f.y,g.x,g.y,h.x,h.y).lineTo(j.x,j.y);
          line.stroke({color:strokeColor,width,alpha,join:'round',cap:'round'});
        }
      }
    };
    const breath=.9+Math.sin(time*1.5)**2*.1;
    crest(1,strength*breath,amber?4.8:6.5);
    crest(1,strength*.8,1.4,white);
    // Expanding echoes emerge from the crest, then dissolve into short rays.
    for(let echo=0;echo<3;echo++) {
      const phase=(time*.23+echo/3)%1;
      crest(1+phase*1.0,Math.sin(phase*Math.PI)*Math.pow(1-phase,1.4)*strength*.36,1.4);
    }
    for(let i=0;i<40;i++) {
      const phase=(time*(.28+i%3*.035)+i*.618034)%1;
      const angle=amber?angles[i%angles.length]+Math.sin(i*7)*.04:Math.floor(i/7)*Math.PI/3+(i%7-3)*.09+rotation;
      const from=95+phase*150,length=6+phase*19,fade=Math.sin(phase*Math.PI)*strength;
      const a=point(from,0,1,angle),b=point(from+length,0,1,angle);
      line.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color:i%4===0?white:color,width:i%4===0?2.4:1.4,alpha:fade*.7});
      if(i%3===0)line.rect(Math.round(b.x)-1,Math.round(b.y)-1,2.5,2.5).fill({color:white,alpha:fade});
    }
  }
  return {render,destroy(){wideBlur.destroy();closeBlur.destroy();gain.destroy();}};
}
