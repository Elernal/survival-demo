'use strict';
// Local, decoded artwork. Cached into a single world surface before Ready.
// Images are only environment layers: characters and gameplay remain live.
window.EmberScene = (() => {
  const assets = [
    {src:'assets/art/scene-west.webp',x:0,width:1770,heightScale:1.07},
    {src:'assets/art/scene-east.webp',x:1770,width:1770,heightScale:1.14}
  ];
  let ready=false;
  let loaded=[];
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
    ready=loaded.every(Boolean);
    return ready;
  };
  function paint(ctx,width,height,ground){
    if(!ready)return false;
    ctx.save();
    ctx.fillStyle='#111514';ctx.fillRect(0,0,width,height);
    for(const asset of loaded)ctx.drawImage(asset.image,asset.x,0,asset.width,height*asset.heightScale);
    // A structural column conceals the junction, without blocking the walk lane.
    let joint=ctx.createLinearGradient(1728,0,1812,0);
    joint.addColorStop(0,'#080b0a00');joint.addColorStop(.4,'#080b0a99');joint.addColorStop(.53,'#090b0bcc');joint.addColorStop(1,'#080b0a00');
    ctx.fillStyle=joint;ctx.fillRect(1728,0,84,ground-8);
    // Foreground slab anchors actor feet and separates the playable plane.
    let floor=ctx.createLinearGradient(0,ground+3,0,height);
    floor.addColorStop(0,'#10110e00');floor.addColorStop(.24,'#0b0e0d80');floor.addColorStop(1,'#030505f0');
    ctx.fillStyle=floor;ctx.fillRect(0,ground,width,height-ground);
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
  return {load,paint,foreground,get ready(){return ready}};
})();
