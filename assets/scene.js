'use strict';
// Local, decoded artwork. Cached into a single world surface before Ready.
// Images are only environment layers: characters and gameplay remain live.
window.EmberScene = (() => {
  const assets = [
    {src:'assets/art/scene-west.webp',x:0,width:1770,heightScale:1.07},
    {src:'assets/art/scene-east.webp',x:1770,width:1770,heightScale:1.14},
    {src:'assets/art/scene-shelter.webp',shelter:true}
  ];
  let ready=false;
  let loaded=[];
  let shelterSurface=null;

  // Procedural material breakup and practical lighting; deterministic and cached.
  let patina=null;
  function buildPatina(){
    const c=document.createElement('canvas');c.width=256;c.height=256;
    const g=c.getContext('2d'),data=g.createImageData(256,256);
    let seed=381729;for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;const v=(seed>>>24);data.data[i]=176;data.data[i+1]=164;data.data[i+2]=143;data.data[i+3]=v>228?17:v>180?8:0;}
    g.putImageData(data,0,0);patina=c;
  }
  function light(ctx,x,y,r,color,alpha=1){
    const g=ctx.createRadialGradient(x,y,2,x,y,r);
    g.addColorStop(0,color.replace('ALPHA',String(.35*alpha)));
    g.addColorStop(.22,color.replace('ALPHA',String(.18*alpha)));
    g.addColorStop(1,color.replace('ALPHA','0'));
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function shelterLighting(ctx,time,workbench,bed){
    const evening=Math.max(0,Math.min(1,(time-900)/180));
    ctx.save();
    // Exterior light entering broken windows, reduced as dusk falls.
    ctx.globalCompositeOperation='screen';
    for(const x of [250,900]){
      const g=ctx.createLinearGradient(x-125,140,x+190,560);
      g.addColorStop(0,`rgba(159,191,185,${.13*(1-evening*.75)})`);
      g.addColorStop(1,'rgba(111,146,145,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-75,180);ctx.lineTo(x+95,180);ctx.lineTo(x+350,575);ctx.lineTo(x-130,575);ctx.closePath();ctx.fill();
    }
    const flicker=1+Math.sin(performance.now()*.0037)*.025;
    light(ctx,715,272,260,'rgba(242,184,103,ALPHA)',flicker);
    light(ctx,1010,431,185,'rgba(255,193,110,ALPHA)',.55*flicker);
    if(workbench)light(ctx,505,485,145,'rgba(244,211,155,ALPHA)',.55);
    if(bed)light(ctx,465,260,120,'rgba(238,174,114,ALPHA)',.25);
    ctx.globalCompositeOperation='source-over';
    const vignette=ctx.createRadialGradient(640,345,170,640,350,790);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.47)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,1280,720);
    ctx.restore();
  }
  function exteriorLighting(ctx,cam,viewWidth,time){
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const [x,y,r] of [[690,235,220],[1470,285,185],[2190,265,235],[2880,215,190]]){
      const sx=x-cam;if(sx<-r||sx>viewWidth+r)continue;
      light(ctx,sx,y,r,'rgba(234,183,111,ALPHA)',.36+Math.sin(time*1.7+x)*.025);
    }
    ctx.restore();
  }

  const load = async (progress) => {
    let complete=0;
    loaded=await Promise.all(assets.map(asset=>new Promise(resolve=>{
      const image=new Image();
      const timer=setTimeout(()=>finish(null),12000);
      let done=false;
      function finish(value){if(done)return;done=true;clearTimeout(timer);complete++;progress?.(complete,assets.length);resolve(value)}
      image.onload=()=>image.decode().then(()=>finish({...asset,image})).catch(()=>finish(null));
      image.onerror=()=>finish(null);
      image.src=asset.src;
    })));
    ready=Boolean(loaded[0]&&loaded[1]);
    if(!patina)buildPatina();
    if(loaded[2]){
      shelterSurface=document.createElement('canvas');shelterSurface.width=1280;shelterSurface.height=720;
      const c=shelterSurface.getContext('2d');
      c.fillStyle='#050706';c.fillRect(0,0,1280,720);
      c.drawImage(loaded[2].image,0,0,1280,696);
      let shade=c.createLinearGradient(0,575,0,720);shade.addColorStop(0,'#06090800');shade.addColorStop(1,'#020403cc');
      c.fillStyle=shade;c.fillRect(0,575,1280,145);
    }
    return ready;
  };
  function paint(ctx,width,height,ground){
    if(!ready)return false;
    ctx.save();
    ctx.fillStyle='#111514';ctx.fillRect(0,0,width,height);
    for(const asset of loaded.slice(0,2))ctx.drawImage(asset.image,asset.x,0,asset.width,height*asset.heightScale);
    // A structural column conceals the junction, without blocking the walk lane.
    let joint=ctx.createLinearGradient(1728,0,1812,0);
    joint.addColorStop(0,'#080b0a00');joint.addColorStop(.4,'#080b0a99');joint.addColorStop(.53,'#090b0bcc');joint.addColorStop(1,'#080b0a00');
    ctx.fillStyle=joint;ctx.fillRect(1728,0,84,ground-8);
    // Foreground slab anchors actor feet and separates the playable plane.
    let floor=ctx.createLinearGradient(0,ground+3,0,height);
    floor.addColorStop(0,'#10110e00');floor.addColorStop(.24,'#0b0e0d80');floor.addColorStop(1,'#030505f0');
    ctx.fillStyle=floor;ctx.fillRect(0,ground,width,height-ground);
    if(patina){ctx.save();ctx.globalAlpha=.33;ctx.fillStyle=ctx.createPattern(patina,'repeat');ctx.fillRect(0,0,width,height);ctx.restore();}
    ctx.restore();return true;
  }
  function foreground(ctx,cam,viewWidth,time){
    ctx.save();
    // Defocused foreground silhouettes move faster than the architecture.
    ctx.fillStyle='#030606c9';
    for(const x of [-85,3590]){
      let sx=x-cam*1.045;
      if(sx < -180 || sx > viewWidth+180)continue;
      ctx.beginPath();ctx.moveTo(sx,720);ctx.lineTo(sx+12,460);ctx.lineTo(sx+27,432);ctx.lineTo(sx+39,720);ctx.fill();
      ctx.beginPath();ctx.moveTo(sx+25,545);ctx.lineTo(sx+110,511);ctx.lineTo(sx+113,518);ctx.lineTo(sx+29,561);ctx.fill();
    }
    ctx.restore();
  }
  function paintShelter(ctx,width,height){
    if(!shelterSurface)return false;
    ctx.drawImage(shelterSurface,0,0,width,height);return true;
  }
  return {load,paint,paintShelter,foreground,shelterLighting,exteriorLighting,get ready(){return ready},get shelterReady(){return Boolean(shelterSurface)}};
})();
