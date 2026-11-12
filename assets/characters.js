'use strict';
/* Original articulated Canvas figures. Rendering only: no input or simulation state. */
(() => {
  const TAU = Math.PI * 2;
  function path(c, points, color) {
    c.fillStyle = color; c.beginPath(); c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
    c.closePath(); c.fill();
  }
  function stroke(c, x, y, xx, yy, color, width) {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy); c.stroke();
  }
  function ellipse(c, x, y, rx, ry, color, rotation = 0) {
    c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, TAU); c.fill();
  }
  // A tapered, lit limb between two joints, with fabric folds rather than round sticks.
  function limb(c, x, y, xx, yy, topWidth, endWidth, color, lit, seam = false) {
    const dx = xx - x, dy = yy - y, length = Math.hypot(dx, dy);
    c.save(); c.translate(x, y); c.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    const g = c.createLinearGradient(-topWidth, 0, topWidth, 0);
    g.addColorStop(0, '#0d1213'); g.addColorStop(.22, color); g.addColorStop(.67, color); g.addColorStop(1, lit);
    c.fillStyle=g; c.beginPath();c.moveTo(-topWidth*.65,-1);
    c.quadraticCurveTo(-topWidth*1.1,length*.2,-topWidth*.76,length*.5);
    c.lineTo(-endWidth,length);c.quadraticCurveTo(0,length+1.8,endWidth,length);
    c.lineTo(topWidth*.76,length*.5);c.quadraticCurveTo(topWidth*1.08,length*.2,topWidth*.65,-1);c.closePath();c.fill();
    if (seam) {
      stroke(c, topWidth*.42, 5, endWidth*.5, length-4, '#b7b9a326', .7);
      stroke(c, -topWidth*.55, length*.58, topWidth*.45, length*.66, '#101a1a70', 1.1);
      stroke(c, -topWidth*.3, length*.66, topWidth*.5, length*.7, '#c4c3a51c', .6);
    }
    c.restore();
  }
  function leg(c, hx, hy, fx, fy, dark, light, front) {
    // Two bone inverse kinematics: feet stay grounded during the stance phase.
    const dx=fx-hx, dy=fy-hy, distance=Math.min(71.5,Math.max(1,Math.hypot(dx,dy)));
    const angle=Math.atan2(dy,dx), bend=Math.acos(Math.min(1,distance/72));
    const kx=hx+Math.cos(angle-bend)*36, ky=hy+Math.sin(angle-bend)*36;
    limb(c,hx,hy,kx,ky,front?6.5:5.8,5.2,dark,light,true);
    ellipse(c,kx,ky,5.2,5.7,dark);
    limb(c,kx,ky,fx,fy-4,4.8,3.7,dark,light,true);
    // Ankle cuff, toe cap and raised sole; roughly realistic boot proportions.
    path(c,[fx-4.6,fy-9,fx+4.2,fy-9,fx+5.2,fy-4,fx+13,fy-2,fx+14,fy+1,fx-5,fy+1],front?'#222a29':'#151b1c');
    stroke(c,fx-4,fy+1,fx+13,fy+1,'#0a1011',2.2);
    stroke(c,fx+2,fy-4,fx+8,fy-3,front?'#9a9b7a7a':'#444c43',.8);
    if (front) stroke(c,fx-2,fy-8,fx+3,fy-7,'#a09d7d66',.7);
  }
  function head(c,x,y,enemy,type) {
    c.save(); c.translate(x,y); c.rotate(enemy?.15:-.035);c.scale(.70,.70);
    // Neck tendon and shadow under the jaw.
    path(c,[-4,9,-4,19,4,21,7,12],enemy?'#66685a':'#9b8d72');
    path(c,[-4,13,5,12,1,18,-4,17],'#333f39');
    const g=c.createLinearGradient(-8,-9,10,11);
    g.addColorStop(0,enemy?'#7d8370':'#b6a18a');g.addColorStop(.55,enemy?'#787c66':'#a69176');g.addColorStop(1,'#4d5849');
    // Human profile: brow, bridge, nose, lips and chin are small at this scale.
    c.fillStyle=g;c.beginPath();c.moveTo(-7,-9);c.bezierCurveTo(-10,-17,2,-19,7,-13);
    c.lineTo(9,-7);c.lineTo(9,-2);c.lineTo(12,1);c.lineTo(9.5,3);c.lineTo(9.8,7);c.lineTo(7,12);
    c.quadraticCurveTo(2,14,-2,10);c.lineTo(-6,4);c.closePath();c.fill();
    ellipse(c,-5,0,2.6,4.2,enemy?'#757963':'#ac9c80',-.14);
    c.fillStyle=enemy?(type?'#343c34':'#333b36'):'#242b2b';c.beginPath();
    c.moveTo(-7,3);c.bezierCurveTo(-12,-9,-8,-18,1,-18);c.quadraticCurveTo(9,-18,9,-10);
    c.lineTo(6,-11);c.lineTo(3,-9);c.lineTo(-2,-10);c.lineTo(-4,-2);c.closePath();c.fill();
    stroke(c,6,-3,9,-2,enemy?'#b4b2a17a':'#25302c',1);
    stroke(c,6,7,9,7,'#3c453a',.65);
    stroke(c,-4,-11,4,-14,'#a9b6a04f',.8);
    if(enemy){path(c,[2,5,5,4,6,11,2,9],'#493b32');stroke(c,-5,8,-1,11,'#4c3f34',1.3);}
    else{stroke(c,1,9,7,10,'#494d3d',1.4);stroke(c,-4,2,-3,7,'#535a48',.8);}
    c.restore();
  }
  function corpse(c,type,face){
    c.save();c.scale(face,1);
    ellipse(c,1,0,62,5,'#0206079c');
    // Grounded, compressed silhouette. Does not rotate the standing figure below the floor.
    limb(c,-7,-9,-40,-5,8,5,'#2f3934','#626a54',true);
    limb(c,-40,-5,-68,-3,5,3.5,'#2c3531','#58604c',true);
    path(c,[-70,-7,-59,-7,-57,-3,-68,0,-75,-1],'#19211e');
    limb(c,-5,-8,-31,-14,7,5,'#344038','#687158',true);
    limb(c,-31,-14,-57,-4,5,3.5,'#333e34','#6b735a',true);
    path(c,[-59,-8,-52,-7,-48,-3,-60,0,-66,-1],'#1b241f');
    path(c,[-14,-14,-8,-26,8,-31,28,-24,35,-12,22,-5,-3,-5],type?'#4e5140':'#535748');
    stroke(c,-4,-22,18,-26,'#8b8b6970',1);
    path(c,[11,-28,22,-25,25,-13,10,-10],'#344136');
    limb(c,21,-23,38,-12,5.5,4,'#555a49','#777a60',true);
    limb(c,38,-12,50,-6,3.8,2.8,'#7b7a60','#919079');
    ellipse(c,52,-6,4,2.4,'#7b7a62');
    ellipse(c,39,-18,11.5,9.5,'#757866',.25);
    path(c,[31,-25,37,-28,45,-26,48,-20,42,-20,36,-23,31,-19],'#2d3730');
    path(c,[21,-18,30,-19,29,-12,22,-9],'#4e342d');
    c.restore();
  }
  function drawVector(c,s) {
    c.save(); c.translate(s.x,s.y); c.scale(s.face||1,1);
    if(s.dead){corpse(c,s.type,1);c.restore();return;}
    const enemy=!!s.isEnemy, moving=s.moving===undefined?true:!!s.moving;
    const phase=s.walk||0, swing=moving?Math.sin(phase):0;
    const crouch=!!s.crouch, run=!!s.run;
    const stride=crouch?14:run?29:enemy?(s.alert?20:13):21;
    const bob=moving?Math.cos(phase*2)*(run?2.7:1.4):Math.sin((s.time||0)*1.8)*.45;
    const hipY=(crouch?-46:-69)+bob;
    const lift1=moving?Math.max(0,Math.cos(phase))* (run?14:8):0;
    const lift2=moving?Math.max(0,-Math.cos(phase))* (run?14:8):0;
    const lean=crouch?16:enemy?(s.alert?10:14):run?8:2;
    const topY=hipY-(crouch?43:46);
    const frontX=swing*stride+3, rearX=-swing*stride-3;
    ellipse(c,2,2,crouch?28:22,3.8,'#02060885');
    ellipse(c,0,1,12,2,'#010406a8');
    leg(c,-5,hipY,rearX,-lift2,enemy?'#303a34':'#293539',enemy?'#5c644d':'#60716a',false);
    // Far arm and hand behind torso.
    const armSwing=moving?swing*(enemy?8:14):0;
    limb(c,lean-4,topY+5,lean-13-armSwing*.45,topY+28,5.3,4.2,enemy?'#464d40':'#3d4946','#737b64',true);
    limb(c,lean-13-armSwing*.45,topY+28,lean-9-armSwing,topY+44,3.7,2.8,enemy?'#777a61':'#5e6c5c','#9b9b7e');
    ellipse(c,lean-9-armSwing,topY+44,3,4,enemy?'#74775d':'#9d9476');
    if(!enemy){
      // Worn canvas backpack: silhouette, gusset, pockets, seam and straps.
      c.fillStyle='#353d34';c.beginPath();c.moveTo(lean-13,topY+1);c.quadraticCurveTo(lean-26,topY-1,lean-27,topY+10);
      c.lineTo(lean-26,topY+40);c.quadraticCurveTo(lean-24,topY+46,lean-11,topY+43);c.closePath();c.fill();
      path(c,[lean-25,topY+10,lean-20,topY+6,lean-13,topY+9,lean-14,topY+39,lean-23,topY+39],'#5b6150');
      path(c,[lean-28,topY+23,lean-20,topY+21,lean-20,topY+35,lean-27,topY+36],'#464f41');
      stroke(c,lean-23,topY+12,lean-23,topY+20,'#9f9b746b',.8);
      stroke(c,lean-26,topY+24,lean-20,topY+23,'#9c987372',.8);
    }
    leg(c,5,hipY,frontX,-lift1,enemy?'#424a3c':'#3b4749',enemy?'#7b8060':'#82907d',true);
    // Coat with natural shoulder, rib cage and irregular hems.
    const coat=c.createLinearGradient(lean-15,0,lean+16,0);
    coat.addColorStop(0,enemy?'#333e34':'#2e403e');
    coat.addColorStop(.35,enemy?(s.type?'#62624b':'#666953'):'#626f5a');
    coat.addColorStop(.72,enemy?'#525b46':'#566650');coat.addColorStop(1,'#283b35');
    c.fillStyle=coat;c.beginPath();c.moveTo(lean-8,topY-1);c.quadraticCurveTo(lean+3,topY-7,lean+12,topY+1);
    c.quadraticCurveTo(lean+19,topY+12,lean+14,topY+28);
    c.lineTo(10,hipY+7);c.lineTo(3,hipY+9);c.lineTo(-3,hipY+6);c.lineTo(-14,hipY+8);
    c.quadraticCurveTo(-17,hipY-10,lean-14,topY+19);c.quadraticCurveTo(lean-17,topY+5,lean-8,topY-1);c.fill();
    path(c,[lean-6,topY,lean+1,topY+5,4,hipY+3,-1,hipY+4],'#a7a68622');
    stroke(c,lean-6,topY+3,1,hipY+3,'#2b3c32',1.1);
    stroke(c,lean-9,topY+2,lean+3,topY-1,'#b6b69a94',.9);
    stroke(c,-10,hipY-9,10,hipY-11,'#1e2b26',2.4);
    path(c,[4,hipY-12,12,hipY-12,12,hipY-3,5,hipY-2],'#434e3c');
    stroke(c,5,hipY-10,11,hipY-10,'#9a9b7357',.7);
    stroke(c,-10,hipY-2,-4,hipY+2,'#9695795c',.7);
    // Fine, stable thread and abrasion marks remain subtle at normal game scale.
    for(let n=0;n<10;n++){
      const yy=topY+13+n*2.8, xx=lean-8+Math.sin(n*3.7)*6;
      stroke(c,xx,yy,xx+2.5+Math.sin(n*2),yy+.7,n%3?'#182d242b':'#d0c9a127',.55);
    }
    stroke(c,lean-3,topY+14,lean+5,topY+17,'#bfc3a31f',.7);
    stroke(c,lean-6,topY+24,lean+8,topY+26,'#15261f50',.8);
    if(!enemy){
      stroke(c,lean-8,topY,lean-4,topY+30,'#293b2e',3.4);
      stroke(c,lean-9,topY,lean-5,topY+30,'#a1a27c94',.9);
      path(c,[lean-9,topY+26,lean-3,topY+26,lean-3,topY+31,lean-9,topY+31],'#a7a68c');
      stroke(c,lean-8,topY+28,lean-4,topY+28,'#323f35',1.3);
    }else{
      path(c,[lean+2,topY+11,lean+9,topY+15,8,hipY-14,3,hipY-17],'#593d302e');
      path(c,[-13,hipY+5,-8,hipY-2,-6,hipY+9,-2,hipY+3,1,hipY+8],'#18261f');
      stroke(c,lean+7,topY+19,lean+13,topY+22,'#9b94744f',.7);
    }
    head(c,lean+2+(enemy?4:0),topY-20,enemy,s.type);
    // Collar sits above neck; asymmetric folds catch the overhead light.
    path(c,[lean-7,topY,lean-2,topY-7,lean+3,topY-3,lean+9,topY-5,lean+13,topY+2,lean+5,topY+7],enemy?'#454f3d':'#7e8267');
    stroke(c,lean-1,topY-3,lean+4,topY+4,'#b5b39791',.8);
    const firing=!enemy&&(s.shootTimer||0)>.17;
    const melee=!enemy&&(s.attackTimer||0)>.20&&(s.shootTimer||0)<=0;
    let elbowX=lean+17,elbowY=topY+25,handX=lean+22,handY=topY+36;
    if(enemy){elbowX+=s.alert?11:4;handX+=s.alert?17:9;elbowY-=s.alert?4:0;handY-=s.alert?10:0;}
    else if(firing){elbowX=lean+19;elbowY=topY+11;handX=lean+40;handY=topY+9;}
    else if(melee){const a=(s.attackTimer-.2)/.32;elbowX=lean+22;elbowY=topY-12+22*(1-a);handX=lean+37;handY=topY-31+58*(1-a);}
    else if(moving){elbowX+=armSwing*.2;handX-=armSwing*.4;}
    limb(c,lean+10,topY+5,elbowX,elbowY,6.2,4.3,enemy?'#575e47':'#62705a','#a0a087',true);
    ellipse(c,elbowX,elbowY,4.6,4.2,enemy?'#545c43':'#5a6a53');
    limb(c,elbowX,elbowY,handX,handY,4.1,2.9,enemy?'#74785b':'#5b6c54','#a9a48a',true);
    ellipse(c,handX+1.5,handY+1,3.4,4,enemy?'#7c8064':'#b0a185',-.3);
    if(!enemy){
      c.save();c.translate(handX,handY);
      if(melee){c.rotate(-.7+(s.attackTimer-.2)*1.4);path(c,[0,-3,5,-3,5,12,0,12],'#333a31');path(c,[0,-3,1,-29,3,-36,5,-27,5,-3],'#b7b6a2');stroke(c,1,-5,2,-29,'#ece4c178',.7);}
      else{c.rotate(firing?-.09:.6);path(c,[0,-6,22,-6,24,-3,20,-1,10,-1,7,7,2,7,3,-1,0,-1],'#192324');stroke(c,2,-6,21,-6,'#a6af9b',.75);stroke(c,4,0,6,5,'#666b56',1);}
      c.restore();
      if(firing){
        const light=c.createRadialGradient(handX+27,handY-4,0,handX+27,handY-4,37);
        light.addColorStop(0,'#fff0c5b0');light.addColorStop(.18,'#e7ad5750');light.addColorStop(1,'#d99e3600');
        ellipse(c,handX+27,handY-4,37,37,light);
        path(c,[handX+23,handY-5,handX+37,handY-11,handX+32,handY-4,handX+45,handY-2,handX+32,handY+1,handX+35,handY+5,handX+23,handY-1],'#ffe9ba');
      }
    }
    if((enemy&&(s.hitFlash||0)>0)||(!enemy&&(s.hurtTimer||0)>0)){
      // Localized strike detail rather than a screen-colored rectangular overlay.
      stroke(c,lean+5,topY+10,lean+10,topY+24,'#d5b3a587',2);
      path(c,[lean+3,topY+18,lean+8,topY+19,lean+6,topY+31,lean+2,topY+27],'#8d4c3b');
    }
    c.restore();
  }
  const scriptURL=document.currentScript&&document.currentScript.src;
  const assetURL=scriptURL?new URL('art/characters.webp',scriptURL).href:'assets/art/characters.webp';
  const sprite=new Image();
  let spriteReady=false, loading=null;
  function load(onProgress) {
    if(typeof onProgress==='function')onProgress(0,'人物材质');
    if(!loading)loading=new Promise(resolve=>{
      let settled=false;
      const finish=ok=>{
        if(settled)return;settled=true;clearTimeout(timeout);
        sprite.onload=null;sprite.onerror=null;spriteReady=ok;resolve(ok);
      };
      const timeout=setTimeout(()=>finish(false),12000);
      sprite.onload=()=>{
        const decode=sprite.decode?sprite.decode():Promise.resolve();
        decode.then(()=>finish(sprite.naturalWidth===1536&&sprite.naturalHeight===1024),()=>finish(false));
      };
      sprite.onerror=()=>finish(false);
      sprite.src=assetURL;
    });
    return loading.then(ok=>{if(typeof onProgress==='function')onProgress(1,ok?'人物已就绪':'人物使用绘制回退');return ok;});
  }
  // A four-frame, two-row photographic art sheet. The gait is tied to simulation
  // walk phase, never to render frame rate. A rejected asset keeps vector fallback.
  const handX=[174,198,205,214], handY=[264,266,268,267];
  function drawSprite(c,s) {
    const enemy=!!s.isEnemy;
    const walking=s.moving===undefined?true:!!s.moving;
    let frame=walking?Math.floor((((s.walk||0)%TAU+TAU)%TAU)/TAU*4):1;
    const sourceX=frame*384,sourceY=enemy?512:0;
    const firing=!enemy&&(s.shootTimer||0)>.17;
    const melee=!enemy&&(s.attackTimer||0)>.20&&(s.shootTimer||0)<=0;
    const action=firing||melee;
    c.save();c.translate(s.x,s.y);c.scale(s.face||1,1);
    ellipse(c,s.dead?23:0,1,s.dead?64:20,s.dead?3.8:3.1,'#01030480');
    ellipse(c,s.dead?22:0,0,s.dead?43:11,1.9,'#00030696');
    const scale=150/470;
    if(s.dead){
      // Rotate around a lowered torso rather than around the feet, and flatten
      // slightly in depth so the corpse stays above the traversable ground plane.
      c.translate(-45,-20);c.scale(.9,.42);c.rotate(Math.PI/2+.075);
    }else if(action){
      c.rotate(firing?-.024:Math.sin((s.attackTimer||0)*13)*.037);
    }
    c.scale(scale,scale*(!enemy&&s.crouch?.76:1));
    if(enemy&&s.type){c.filter='brightness(.91) sepia(.12)';}
    if(!s.dead&&action){
      const hx=handX[frame]-200,hy=handY[frame]-490;
      // The supplied sprite holds a lowered pistol. Cover just that pistol with
      // a sampled piece of its own trousers, then draw the current weapon at the
      // original hand. No second hand or disconnected animated arm is added.
      c.save();c.beginPath();c.rect(-200,-490,384,512);
      c.rect(hx-12,hy+9,30,54);c.clip('evenodd');
      c.drawImage(sprite,sourceX,sourceY,384,512,-200,-490,384,512);c.restore();
      c.drawImage(sprite,sourceX+handX[frame]+23,sourceY+handY[frame]+10,22,53,hx-12,hy+9,30,54);
      c.save();c.translate(hx+5,hy+5);
      if(melee){
        c.rotate(-1.3+Math.sin((s.attackTimer||0)*10)*.7);
        path(c,[-3,-4,9,-4,9,30,-3,30],'#2d322c');
        path(c,[-2,-3,-2,-65,4,-86,9,-64,9,-3],'#a6ac9b');
        stroke(c,0,-9,1,-68,'#e0ded099',1.7);stroke(c,-9,-5,15,-5,'#4e5b50',3);
      }else{
        c.rotate(-.055);
        path(c,[-7,-13,53,-13,57,-6,52,0,22,0,18,22,3,22,6,0,-7,0],'#171e1d');
        stroke(c,-2,-13,51,-13,'#a7afa38f',1.8);stroke(c,8,2,15,19,'#666f5b',2);
        stroke(c,23,-6,47,-6,'#6c756952',1.2);
      }
      c.restore();
      if(firing){
        const mx=hx+64,my=hy-6;
        const g=c.createRadialGradient(mx,my,0,mx,my,104);
        g.addColorStop(0,'#ffedbd88');g.addColorStop(.2,'#dc9c4940');g.addColorStop(1,'#d8953000');
        ellipse(c,mx,my,104,104,g);
        path(c,[mx-8,my-5,mx+18,my-19,mx+11,my-5,mx+45,my,mx+13,my+7,mx+17,my+17,mx-8,my+5],'#ffe9bd');
      }
    }else{
      c.drawImage(sprite,sourceX,sourceY,384,512,-200,-490,384,512);
    }
    c.filter='none';
    // Texture stays readable: hit feedback is a small, translucent rim rather
    // than a flash rectangle which would expose the sprite tile boundary.
    if(!s.dead&&((enemy&&(s.hitFlash||0)>0)||(!enemy&&(s.hurtTimer||0)>0))){
      ellipse(c,8,-294,27,10,'#ad493727',.4);
    }
    c.restore();
  }
  function draw(c,s){if(spriteReady)drawSprite(c,s);else drawVector(c,s);}
  window.EmberCharacters=Object.freeze({draw,load,get ready(){return spriteReady;}});
})();
