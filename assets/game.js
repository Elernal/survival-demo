
(()=>{'use strict';
const canvas=document.querySelector('#game');let ctx=canvas.getContext('2d',{alpha:true});const hud={hp:document.querySelector('#hpFill'),sp:document.querySelector('#spFill'),hpText:document.querySelector('#hpText'),spText:document.querySelector('#spText'),ammo:document.querySelector('#ammoText'),task:document.querySelector('#task'),hint:document.querySelector('#hint'),toast:document.querySelector('#toast'),zone:document.querySelector('#zoneName')};const overlay=document.querySelector('#overlay'),startBtn=document.querySelector('#startBtn');
const WORLD=3540,GROUND=575,HEIGHT=720;let w=1280,h=720,dpr=1,viewW=1280,cam=0,frame=0,acc=0,last=0,paused=true,started=false,finished=false,dead=false,audio=null,soundOn=true,quality=1;
const lifecycle=new GameLifecycle(tick,draw,showError);
// Persistent shelter simulation is independent of expedition resets.
let scene='Shelter',shelterX=430,shelterFood=2,shelterParts=3,shelterMeds=1,day=1,dayMinutes=480,workbenchBuilt=false,bedRepaired=false;
const dayDurationSeconds=120;let clockDisplayMinute=-1;
const shelterHUD=document.querySelector('#shelterHUD'),shelterMap=document.querySelector('#shelterMap');
function updateShelterHUD(){
 document.querySelector('#shelterInventory').textContent=`食物 ${shelterFood} · 零件 ${shelterParts} · 药品 ${shelterMeds}`;
 const night=dayMinutes>=1080,hour=Math.floor(dayMinutes/60),minute=Math.floor(dayMinutes%60);
 document.querySelector('#shelterClock').textContent=`第 ${day} 天 · ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} · ${night?'夜晚探索':'白天建设'}`;
 const depart=document.querySelector('#shelterDepart');depart.disabled=!night;depart.textContent=night?'夜晚：选择探索区域':'18:00 后可外出';
}
function showShelter(){
 scene='Shelter';document.documentElement.dataset.scene=scene;
 shelterHUD.hidden=false;shelterMap.hidden=true;document.querySelector('#hud').style.display='none';
 document.querySelector('#touchUI').style.display='';document.querySelector('#desktopHelp').style.display='none';
 player.crouch=false;player.run=false;player.attackTimer=0;player.shootTimer=0;updateShelterHUD();
}
function hideShelter(){
 scene='Explore';document.documentElement.dataset.scene=scene;
 shelterHUD.hidden=true;shelterMap.hidden=true;document.querySelector('#hud').style.display='';document.querySelector('#desktopHelp').style.display='';
 document.querySelector('#worldTime').textContent=`第 ${String(day).padStart(2,'0')} 天 / 18:00 / 雾雨`;
}
function openShelterMap(){
 if(!started||paused||scene!=='Shelter')return;
 if(dayMinutes<1080){document.querySelector('#shelterTip').textContent='白天先建设和整理物资，18:00 后才能外出';return;}
 clearInput();shelterMap.hidden=false;
}
function buildShelter(){
 if(!started||paused||scene!=='Shelter'||!shelterMap.hidden)return;
 const tip=document.querySelector('#shelterTip');
 if(!workbenchBuilt){if(shelterParts<2){tip.textContent='修复工作台需要 2 个零件';return;}shelterParts-=2;workbenchBuilt=true;tip.textContent='工作台修复完成！可用于后续制作';}
 else if(!bedRepaired){if(shelterParts<1){tip.textContent='修复床铺需要 1 个零件';return;}shelterParts--;bedRepaired=true;tip.textContent='床铺修复完成！休息条件改善';}
 else tip.textContent='目前设施已经修复，等待夜晚探索获取更多物资';
 updateShelterHUD();
}
function activatePlaying(){
 clearInput();createAudio();started=true;paused=false;overlay.hidden=true;
 // Scene changes may happen inside a running frame. Keep that frame's scheduler.
 if(lifecycle.state!=='Playing')lifecycle.setState('Playing');
}
function departShelter(){
 if(!started||paused||scene!=='Shelter'||shelterMap.hidden||dayMinutes<1080)return;
 reset();hideShelter();activatePlaying();
}
document.querySelector('#shelterDepart').addEventListener('click',openShelterMap);
document.querySelector('#shelterBuild').addEventListener('click',buildShelter);
document.querySelector('#shelterBack').addEventListener('click',()=>{shelterMap.hidden=true;clearInput();});
document.querySelector('#shelterGo').addEventListener('click',departShelter);
const keys=Object.create(null),touch={move:0,run:false,crouch:false,fire:false};const player={x:160,y:GROUND,face:1,hp:100,stamina:100,ammo:6,reserve:18,meds:1,food:0,parts:0,caseFound:false,walk:0,attackTimer:0,shootTimer:0,hurtTimer:0,crouch:false,run:false,noise:0,lastFx:0};
let enemies=[],loots=[],fx=[],dust=[],rain=[],cameraShake=0,bullets=[],lastHint='',hintUntil=0,toastUntil=0,ambientTime=0,winShown=false;
function r(seed){let x=Math.sin(seed*112.9898+78.233)*43758.5453;return x-Math.floor(x)}
function rng(a,b,s){return a+(b-a)*r(s)}
function reset(){Object.assign(player,{x:160,y:GROUND,face:1,hp:100,stamina:100,ammo:6,reserve:18,meds:1,food:0,parts:0,caseFound:false,walk:0,attackTimer:0,shootTimer:0,hurtTimer:0,crouch:false,run:false,noise:0,lastFx:0});enemies=[{x:882,origin:882,hp:2,maxHp:2,type:0},{x:1315,origin:1315,hp:2,maxHp:2,type:0},{x:1650,origin:1650,hp:3,maxHp:3,type:1},{x:2075,origin:2075,hp:2,maxHp:2,type:0},{x:2420,origin:2420,hp:3,maxHp:3,type:1},{x:2890,origin:2890,hp:3,maxHp:3,type:1},{x:3260,origin:3260,hp:2,maxHp:2,type:0}].map((e,i)=>({...e,alert:false,dead:false,attackCooldown:r(i)*.7,walk:r(i)*8,face:i%2?-1:1,hitFlash:0,deathTime:0,home:e.x}));loots=[{x:640,t:'food',name:'罐头食品',taken:false},{x:1150,t:'parts',name:'工具和零件',taken:false},{x:1555,t:'ammo',name:'手枪弹药',taken:false},{x:2020,t:'case',name:'急救物资箱',taken:false},{x:2640,t:'med',name:'消毒药品',taken:false},{x:3160,t:'parts',name:'备用零件',taken:false}];fx=[];bullets=[];cam=0;finished=false;dead=false;winShown=false;started=false;paused=true;ambientTime=0;toast('');setTask();}
function resize(){w=Math.max(1,innerWidth);h=Math.max(1,innerHeight);dpr=Math.min(devicePixelRatio||1, w<700?1.6:1.9);canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';viewW=Math.min(WORLD,HEIGHT*w/h);quality=w<650?.8:1}
addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,200));
function createAudio(){if(!soundOn)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{})}catch{}}
function sound(freq,duration=.11,type='triangle',gain=.07,slide=0){if(!soundOn||!audio)return;try{let o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(24,freq+slide),audio.currentTime+duration);g.gain.setValueAtTime(gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function toast(s,duration=2.5){hud.toast.textContent=s;hud.toast.classList.toggle('show',!!s);toastUntil=ambientTime+duration}
function hint(s,duration=.35){lastHint=s;hintUntil=ambientTime+duration;hud.hint.textContent=s;hud.hint.classList.toggle('show',!!s)}
function setTask(){hud.task.innerHTML=player.caseFound?'任务：安全撤离<span>医疗箱已找到。返回最左侧入口，带它回到避难所。</span>':'任务：寻找医疗物资<span>深入旧居民楼，在临时诊室找到医疗箱。</span>'}
function openOverlay(title,sub,story,action){paused=true;shelterMap.hidden=true;clearInput();lifecycle.setState(finished?'Completed':dead?'GameOver':'Paused');overlay.hidden=false;document.querySelector('#overlayTitle').textContent=title;document.querySelector('#overlaySub').textContent=sub;document.querySelector('#overlayStory').innerHTML=story;startBtn.textContent=action;}
function clearInput(){Object.keys(keys).forEach(k=>keys[k]=false);Object.assign(touch,{move:0,run:false,crouch:false,fire:false});stickPointer=null;resetStick();document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));releaseActions.forEach(fn=>fn());}
function start(){if(!window.__gameReady||lifecycle.state==='Playing'&&!paused)return;if(dead||finished){reset();showShelter();}activatePlaying();}
startBtn.addEventListener('click',start);
function togglePause(){if(!started||dead||finished)return;if(paused){start()}else{openOverlay('暂 停',scene==='Shelter'?'灰烬之家 · SHELTER':'外面还不安全',scene==='Shelter'?'整理物资、修复设施。<br>夜幕降临后，选择区域外出探索。':'你已经离开了避难所。<br>继续深入搜索，或者带着物资从左侧入口撤离。','继续游戏')}}
document.querySelector('#pauseBtn').addEventListener('click',togglePause);document.querySelector('#soundToggle').addEventListener('click',()=>{soundOn=!soundOn;document.querySelector('#soundToggle').textContent=soundOn?'♫':'♪̸';if(soundOn)createAudio()});
function end(win){
 if(win){
  shelterFood+=player.food;shelterParts+=player.parts;shelterMeds+=player.meds;day++;dayMinutes=480;clockDisplayMinute=-1;shelterX=430;
  reset();showShelter();activatePlaying();
  document.querySelector('#shelterTip').textContent='清晨返回基地，昨晚搜刮物资已入库。开始新一天建设。';
  sound(570,.5,'sine',.13,300);return;
 }
 finished=false;dead=true;paused=true;
 sound(130,.5,'sawtooth',.13,-85);
 openOverlay('失 守','探索失败 · LOST','你没能活着走出废墟。<br>本次带回的物资全部丢失。保持潜行，利用近战节省弹药；遭遇包围时可以撤退。','返回避难所');
}
function forward(){return (keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)||touch.move}
function interact(){if(!started||paused||!shelterMap.hidden)return;
 if(scene==='Shelter'){
  if(Math.abs(shelterX-1010)<125){openShelterMap();return;}
  if(Math.abs(shelterX-270)<115){document.querySelector('#shelterTip').textContent='储物柜：食物 '+shelterFood+' · 零件 '+shelterParts+' · 药品 '+shelterMeds;return;}
  if(Math.abs(shelterX-500)<110){buildShelter();return;}
  document.querySelector('#shelterTip').textContent='白天可以修复工作台与床铺，夜晚才能外出';return;
 }
 if(player.x<295){if(player.caseFound){end(true)}else toast('还没找到医疗箱。可以继续探索。');return;}let near=loots.find(v=>!v.taken&&Math.abs(v.x-player.x)<95);if(!near){toast('附近没有可以搜刮的物资',1.4);return;}near.taken=true;let text='';if(near.t==='food'){player.food+=2;text='找到罐头 ×2'}if(near.t==='parts'){player.parts+=3;text='找到零件 ×3'}if(near.t==='ammo'){player.reserve+=8;text='找到 9mm 子弹 ×8'}if(near.t==='case'){player.caseFound=true;text='找到急救箱！现在返回入口撤离';setTask()}if(near.t==='med'){player.meds+=2;text='找到绷带 ×2'}particles(near.x,GROUND-80,15,'#e4c896');sound(550,.12,'triangle',.08,220);toast(text,3)}
function reload(){if(!started||paused||scene!=='Explore'||!shelterMap.hidden)return;let n=Math.min(6-player.ammo,player.reserve);if(n<=0){toast(player.reserve?'弹匣已满':'没有备用弹药',1.3);return}player.ammo+=n;player.reserve-=n;sound(480,.08,'square',.04,-170);toast('换弹完成',1.2)}
function heal(){if(!started||paused||scene!=='Explore'||!shelterMap.hidden)return;if(player.meds<=0){toast('没有医疗物资',1.5);return}if(player.hp>=99){toast('不需要治疗',1.3);return}player.meds--;player.hp=Math.min(100,player.hp+45);sound(700,.24,'sine',.08,260);toast('使用绷带，生命恢复',2)}
function particles(x,y,n,color){for(let i=0;i<n;i++)fx.push({x,y,vx:(r(i*9+frame)-.5)*270,vy:-r(i*3+frame)*190,life:.3+r(i+frame)*.5,col:color,size:1+r(i*6+frame)*3});}
function attack(gun){if(!started||paused||scene!=='Explore'||!shelterMap.hidden)return;if(gun){if(player.shootTimer>0)return;if(player.ammo<=0){sound(340,.05,'square',.04);toast('弹匣已空，按换弹',1.2);return}player.ammo--;player.shootTimer=.34;player.attackTimer=.18;player.noise=1.7;cameraShake=7;bullets.push({x:player.x+player.face*(window.Ember3DCharacters?.ready?61:23),y:GROUND-(window.Ember3DCharacters?.ready?105:90),life:.17,face:player.face,originPending:true});sound(170,.11,'sawtooth',.18,-130);sound(86,.2,'triangle',.12,-50);enemies.forEach(e=>{if(!e.dead&&Math.abs(e.x-player.x)<670)e.alert=true});}else{if(player.attackTimer>0||player.stamina<12)return;player.stamina-=17;player.attackTimer=.52;player.noise=Math.max(player.noise,.14);sound(190,.09,'triangle',.04,-100)}let range=gun?610:96;let options=enemies.filter(e=>!e.dead&&(e.x-player.x)*player.face>-16&&Math.abs(e.x-player.x)<range).sort((a,b)=>Math.abs(a.x-player.x)-Math.abs(b.x-player.x));let e=options[0];if(!e){if(gun)toast('射击落空',.85);return;}let stealthStrike=!gun&&!e.alert&&((player.x-e.x)*e.face<0)&&Math.abs(e.x-player.x)<85;e.hp-=gun?2:stealthStrike?3:1;e.hitFlash=.18;e.alert=true;e.face=Math.sign(player.x-e.x)||e.face;particles(e.x,GROUND-100,gun?11:6,'#945047');sound(70,.12,'sawtooth',.07,-35);if(e.hp<=0){e.dead=true;e.deathTime=0;toast(stealthStrike?'无声处决 · 感染者倒下':'感染者倒下',1.1)}else if(!gun)toast('近战命中',.85)}
addEventListener('keydown',e=>{if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.repeat)return;if(e.code==='KeyF'||e.code==='KeyE')interact();if(e.code==='KeyJ'||e.code==='Space')attack(false);if(e.code==='KeyK')attack(true);if(e.code==='KeyR')reload();if(e.code==='KeyH')heal();if(e.code==='Escape')togglePause()});addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>{clearInput();if(started&&!paused)togglePause()});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(started&&!paused)togglePause()}});
const stick=document.querySelector('#stick'),knob=document.querySelector('#knob');let stickPointer=null;function resetStick(){knob.style.transform='translate(0px,0px)'}function stickMove(e){let rect=stick.getBoundingClientRect(),center=rect.left+rect.width/2,dx=e.clientX-center,lim=rect.width*.32,m=Math.min(lim,Math.abs(dx)),v=Math.abs(dx)<lim*.22?0:Math.sign(dx);touch.move=v;knob.style.transform=`translate(${Math.sign(dx)*m}px,0px)`}
stick.addEventListener('pointerdown',e=>{e.preventDefault();if(stickPointer!==null||paused)return;stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e)});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)stickMove(e)});for(let ev of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(ev,e=>{if(e.pointerId===stickPointer){touch.move=0;stickPointer=null;resetStick()}});
const releaseActions=[];function act(id,fn,hold=false){releaseActions.push(bindGameAction(document.getElementById(id),()=>{if(!paused)fn(true)},()=>{if(hold)fn(false)}));}act('btnRun',v=>touch.run=v,true);act('btnCrouch',v=>touch.crouch=v,true);act('btnFire',v=>{touch.fire=v;if(v)attack(true)},true);act('btnMelee',v=>{if(v)attack(false)});act('btnInteract',v=>{if(v)interact()});act('btnReload',v=>{if(v)reload()});act('btnHeal',v=>{if(v)heal()});document.addEventListener('contextmenu',e=>e.preventDefault());
for(let i=0;i<170;i++)dust.push({x:r(i*2)*WORLD,y:r(i*4+5)*540,v:r(i*3+2)*.23+.07,s:r(i*7+7)*2+.4});for(let i=0;i<150;i++)rain.push({x:r(i*5+2)*2000,y:r(i*3+8)*800,s:170+r(i+1)*200,length:7+r(i*7)*14});
let renderDt=0;
function tick(dt){renderDt=dt;
 if(scene==='Shelter'){
  ambientTime+=dt;frame++;
  if(!shelterMap.hidden)return;
  if(dayMinutes<1080){
   dayMinutes=Math.min(1080,dayMinutes+600*dt/dayDurationSeconds);
   const currentMinute=Math.floor(dayMinutes);
   if(currentMinute!==clockDisplayMinute){clockDisplayMinute=currentMinute;updateShelterHUD();if(dayMinutes>=1080)document.querySelector('#shelterTip').textContent='夜幕降临。现在可以选择探索区域。';}
  }
  const move=forward();shelterX=Math.max(100,Math.min(1100,shelterX+move*220*dt));
  player.walk+=Math.abs(move)*dt*8;player.face=move?Math.sign(move):player.face;
  player.crouch=false;player.run=false;return;
 }
 ambientTime+=dt;frame++;let dx=forward();player.crouch=!!(keys.ControlLeft||keys.ControlRight||touch.crouch);player.run=!!(keys.ShiftLeft||keys.ShiftRight||touch.run)&&!player.crouch&&player.stamina>4;if(dx){player.face=Math.sign(dx);let speed=player.crouch?88:player.run?300:178;player.x=Math.max(75,Math.min(WORLD-60,player.x+dx*speed*dt));player.walk+=dt*(player.crouch?5:player.run?13:9);if(player.run)player.stamina=Math.max(0,player.stamina-18*dt);player.noise=Math.max(player.noise,player.run?.25:player.crouch?.018:.075)}else player.walk+=dt*2;if(!player.run)player.stamina=Math.min(100,player.stamina+(player.crouch?20:15)*dt);player.noise=Math.max(0,player.noise-dt*.43);player.shootTimer=Math.max(0,player.shootTimer-dt);player.attackTimer=Math.max(0,player.attackTimer-dt);player.hurtTimer=Math.max(0,player.hurtTimer-dt);if(touch.fire&&player.shootTimer<=0)attack(true);for(let i=0;i<enemies.length;i++){let e=enemies[i];if(e.dead){e.deathTime+=dt;continue}e.walk+=dt*5;e.hitFlash=Math.max(0,e.hitFlash-dt);e.attackCooldown-=dt;let d=Math.abs(e.x-player.x);let range=player.crouch?110:player.run?360:235;range+=player.noise*410;let facingPlayer=(player.x-e.x)*e.face>0;let visuallySpotted=facingPlayer||!player.crouch&&d<74;let nearbySound=player.noise>.12&&d<range*.8;if(d<range&&(visuallySpotted||nearbySound))e.alert=true;if(e.alert){e.face=Math.sign(player.x-e.x)||e.face;if(d>55)e.x+=e.face*dt*(e.type?94:68);else if(e.attackCooldown<=0){e.attackCooldown=1.25;player.hp=Math.max(0,player.hp-(e.type?25:18));player.hurtTimer=.55;cameraShake=10;particles(player.x,GROUND-82,8,'#a95f59');sound(95,.16,'sawtooth',.14,-60);toast('受到感染者攻击！',1.2);if(player.hp<=0){end(false);return}}}else{let desired=e.home+Math.sin(ambientTime*.48+i*3.1)*82;let delta=desired-e.x;e.face=Math.sign(delta)||e.face;e.x+=Math.sign(delta)*Math.min(Math.abs(delta),dt*22)} }
for(const b of bullets)b.life-=dt;bullets=bullets.filter(b=>b.life>0);for(const f of fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=330*dt;f.life-=dt}fx=fx.filter(f=>f.life>0);for(const p of dust){p.y-=p.v*dt*10;if(p.y<0)p.y=580}cameraShake*=.83;cam+=(Math.max(0,Math.min(WORLD-viewW,player.x-viewW*.40))-cam)*Math.min(1,dt*4);hud.hp.style.width=player.hp+'%';hud.sp.style.width=player.stamina+'%';hud.hpText.textContent=Math.ceil(player.hp);hud.spText.textContent=Math.ceil(player.stamina);hud.ammo.textContent=String(player.ammo).padStart(2,'0')+' / '+String(player.reserve).padStart(2,'0');let name=player.x<460?'北区 · 街道入口':player.x<1750?'北区 · 废弃住宅':player.x<2600?'北区 · 临时诊室':'北区 · 仓储区';hud.zone.textContent=name;let nearby=loots.find(v=>!v.taken&&Math.abs(v.x-player.x)<95);let h=player.x<290?'◇ 入口 · '+(player.caseFound?'点击搜刮 / 按 F 撤离':'继续寻找医疗箱'):nearby?'◇ 搜刮：'+nearby.name+' · 按 F / 搜刮':'';if(h)hint(h,.2);else if(ambientTime>hintUntil)hud.hint.classList.remove('show');if(ambientTime>toastUntil)hud.toast.classList.remove('show');}
// --- Painterly 2.5D rendering: original geometry, noise, lighting and animation ---
function fill(x,y,W,H,c){ctx.fillStyle=c;ctx.fillRect(x,y,W,H)}function line(x,y,x2,y2,c,width=1){ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()}function polygon(points,c){ctx.fillStyle=c;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill()}function grad(x,y,rad,c0,c1){let g=ctx.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,c0);g.addColorStop(1,c1);ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,rad*2,rad*2)}
const skyline=Array.from({length:36},(_,i)=>({x:i*130+r(i)*45,h:95+r(i+3)*210,w:80+r(i+10)*110}));
function sky(){ctx.save();let g=ctx.createLinearGradient(0,0,0,GROUND);g.addColorStop(0,'#202e33');g.addColorStop(.54,'#344144');g.addColorStop(1,'#0c171b');fill(0,0,viewW,HEIGHT,g);let bx=cam*.19;ctx.save();ctx.translate(-bx,0);for(let i=0;i<skyline.length;i++){let b=skyline[i];let x=b.x-400;fill(x,GROUND-b.h,b.w,b.h, i%2?'#1d2b30':'#233038');for(let yy=GROUND-b.h+19;yy<GROUND-30;yy+=24)for(let xx=x+12;xx<x+b.w-10;xx+=24){let lit=r(i*100+xx*2+yy)> .91;fill(xx,yy,7,11,lit?'#856b50a2':'#111e2599')}if(i%3===0){fill(x+b.w*.38,GROUND-b.h-35,3,38,'#2a3338');line(x+b.w*.38,GROUND-b.h-35,x+b.w*.38+12,GROUND-b.h-38,'#2b3436',2)}}ctx.restore();let haze=ctx.createLinearGradient(0,110,0,GROUND);haze.addColorStop(0,'#83938b00');haze.addColorStop(.75,'#87938c28');haze.addColorStop(1,'#333b3a52');fill(0,0,viewW,GROUND,haze);ctx.restore()}
function wallRect(x,y,W,H,i){fill(x,y,W,H,'#555d59');fill(x+4,y+3,W-8,H-6,i%2?'#505956':'#555b57');let g=ctx.createLinearGradient(x,y,x+W,y+H);g.addColorStop(0,'#bbc0aa0e');g.addColorStop(.5,'#17242633');g.addColorStop(1,'#0c111466');fill(x,y,W,H,g);for(let j=0;j<180;j++){let xx=x+r(i*223+j)*W,yy=y+r(i*373+j*9)*H,ww=2+r(i*911+j)*48,hh=1+r(i*233+j)*8;fill(xx,yy,ww,hh,j%4?'#131f1d18':'#abb3a417')}for(let j=0;j<35;j++){let xx=x+r(i*37+j*3)*W,yy=y+r(i*73+j*9)*H;line(xx,yy,xx+r(j*2+i)*70-15,yy+r(j*3+i)*32,'#252c2c48',r(j+i)*1.3+.4)}}
function windowObj(x,y,W=118,H=155){fill(x-12,y-14,W+24,H+30,'#283034');fill(x,y,W,H,'#1a2d31');let g=ctx.createLinearGradient(x,y,x,y+H);g.addColorStop(0,'#879895');g.addColorStop(.55,'#637577');g.addColorStop(1,'#303b3e');fill(x+6,y+6,W-12,H-12,g);for(let j=0;j<12;j++){let xx=x+r(x*3+j)*W,yy=y+r(x*7+j)*H;line(xx,yy,xx+r(j*4+x)*25,yy+22,'#a9b5a028',1)}fill(x+W*.46,y,9,H,'#272d31');fill(x,y+H*.55,W,8,'#262d31');polygon([[x+W*.55,y+H*.56],[x+W*.94,y+H*.56],[x+W*.74,y+H*.76]],'#141f22b4');ctx.save();ctx.globalCompositeOperation='screen';polygon([[x,y+H*.85],[x+W,y+H*.85],[x+W*2.5,GROUND],[x-W*.6,GROUND]],'#a8b5a010');ctx.restore();}
function shelf(x,y,W,H){fill(x+5,y+5,W,H,'#161f22aa');fill(x,y,W,H,'#343532');fill(x+10,y+7,W-20,H-14,'#252a2a');for(let j=0;j<4;j++){let yy=y+15+j*((H-35)/3);fill(x,yy,W,7,'#57594f');for(let k=0;k<5;k++){let seed=j*9+k+x,ww=12+r(seed)*14,xx=x+10+k*(W-20)/5;fill(xx,yy-19-r(seed+1)*7,ww,17+r(seed+1)*7,k%2?'#71715b':'#4e615e')}}fill(x,y,8,H,'#292c2b');fill(x+W-8,y,8,H,'#292c2b')}
function crate(x,y,s=1){ctx.save();ctx.translate(x,y);ctx.scale(s,s);polygon([[4,0],[79,0],[90,-14],[14,-14]],'#626051');fill(4,0,75,59,'#514d3d');fill(4,0,5,59,'#282c2a');fill(74,0,6,59,'#292c2a');line(9,6,72,53,'#353c38',5);line(72,6,9,53,'#555745',4);line(0,20,79,20,'#84785a44',2);ctx.restore()}
function tableObj(x,y,W=155){fill(x+9,y-2,W,16,'#3d4240');fill(x,y,W,12,'#77766a');fill(x+10,y+9,10,70,'#343a38');fill(x+W-17,y+9,9,70,'#343a38');fill(x+20,y+34,W-40,6,'#303b39')}
function bedObj(x,y){fill(x+4,y,173,15,'#a1a497');fill(x,y+10,190,20,'#4f5957');fill(x+15,y-15,131,17,'#646f6b');fill(x+22,y-18,40,15,'#9a9f97');fill(x,y+20,9,55,'#3a4444');fill(x+175,y+20,9,55,'#3a4444')}
function lamp(x,y){line(x,105,x,y,'#24292b',3);polygon([[x-27,y],[x+27,y],[x+13,y-19],[x-13,y-19]],'#222a2c');fill(x-20,y+1,40,5,'#b1a177');grad(x,y+8,180,'#f2d19c2e','#cab08700')}
function pipes(x,y,W){for(let i=0;i<3;i++){line(x,y+i*8,x+W,y+i*8,i%2?'#2a393b':'#303f42',5);for(let k=0;k<4;k++)fill(x+30+k*W/4,y+i*8-3,9,6,'#67716a') }}
function building(){// ground and cutaway wall
fill(0,GROUND, WORLD,HEIGHT-GROUND,'#242e2c');fill(0,GROUND+7,WORLD,7,'#66695c');for(let j=0;j<500;j++){let x=r(j*7)*WORLD,y=GROUND+r(j*13)*100;line(x,y,x+r(j*5)*34,y+2,'#a1a8950e',1)}
// outside street
for(let x=0;x<470;x+=170){line(x,GROUND+48,x+88,GROUND+48,'#b8b5a830',4)}for(let x=2980;x<WORLD;x+=150)line(x,GROUND+48,x+78,GROUND+48,'#b8b5a830',4);
// exterior facade and interior frames
for(let k=0;k<4;k++){let xs=[435,1115,1750,2405][k],xe=[1115,1750,2405,2930][k];wallRect(xs,134,xe-xs,GROUND-134,k+1);fill(xs,116,xe-xs,20,'#303b3b');fill(xs,125,xe-xs,7,'#7c817341');fill(xs,GROUND-20,xe-xs,18,'#444945');fill(xs,GROUND-8,xe-xs,8,'#92908321');fill(xs,GROUND-34,xe-xs,3,'#d2c6a119');fill(xs,130,13,GROUND-130,'#303938');fill(xs+13,145,5,GROUND-160,'#81867920')}
for(let x of [1115,1750,2405,2930]){fill(x-11,123,24,GROUND-123,'#293536');fill(x-3,123,5,GROUND-123,'#60696058');}
// breaks in partition to simulate passages
for(let x of [1115,1750,2405]){fill(x-22,350,44,225,'#1e2a2b');fill(x-16,351,33,224,'#101c20');fill(x-23,350,7,225,'#72776b');fill(x+17,350,7,225,'#414b49');}
windowObj(650,225,133,156);windowObj(1425,215,130,161);windowObj(2145,220,120,154);windowObj(2695,208,110,140);
pipes(500,154,540);pipes(1810,145,490);
// room descriptions, objects and debris
ctx.font='12px sans-serif';ctx.fillStyle='#c9d1c954';ctx.fillText('北区第七住宅楼  /  BUILDING 07',540,193);ctx.fillText('TEMPORARY MEDICAL CENTER',1870,193);ctx.fillText('WAREHOUSE / STORAGE',2540,193);
shelf(512,330,102,164);crate(965,492,1);crate(1045,517,.7);tableObj(850,480,140);
crate(1185,505,1.1);shelf(1290,318,115,204);tableObj(1580,478,115);
bedObj(1855,490);bedObj(2210,486);tableObj(2020,448,80);shelf(2310,309,78,210);
shelf(2500,300,137,219);crate(2795,485,1);crate(2728,524,.72);shelf(3010,349,126,171);
for(let i=0;i<120;i++){let x=400+r(i*3+9)*2640,y=GROUND-r(i*7+11)*18,w=3+r(i*2+44)*30;fill(x,y,w,2+r(i*3+6)*3,i%3?'#131a1952':'#75786d40')}
for(let x of [535,1040,1170,1740,1800,2310,2412,2860]){polygon([[x-30,GROUND],[x+45,GROUND],[x+25,GROUND-15],[x-6,GROUND-8]],'#292c2a');for(let k=0;k<6;k++)line(x+r(k+x)*40-20,GROUND-r(k*x)*12,x+r(k+x)*35,GROUND-r(k+x)*8,'#7a7c7059',1)}
// graffiti, wires and shadows
ctx.font='bold 30px monospace';ctx.fillStyle='#3d333281';ctx.fillText('NO EXIT',810,355);ctx.fillStyle='#5b302a66';ctx.fillText('KEEP OUT',2565,290);for(let i=0;i<10;i++){let x=520+i*250,y=143+r(i)*52;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+80,y+20,x+190,y-4);ctx.strokeStyle='#1c2325a0';ctx.lineWidth=3;ctx.stroke();}
for(let x of [980,1650,2300,2810])lamp(x,195+(x%3)*18);
// Foreground floor border
fill(0,GROUND,WORLD,7,'#64665c');let lower=ctx.createLinearGradient(0,GROUND,0,HEIGHT);lower.addColorStop(0,'#242e2c');lower.addColorStop(.38,'#121a1c');lower.addColorStop(1,'#070c0e');fill(0,GROUND+8,WORLD,HEIGHT-GROUND,lower)
}
let environment=document.createElement('canvas'),ec=environment.getContext('2d');environment.width=WORLD;environment.height=HEIGHT;function cacheEnv(){let save=ctx;try{ctx=ec;if(!window.EmberScene?.paint(ctx,WORLD,HEIGHT,GROUND))building()}finally{ctx=save}}
function glowLoot(l){
 if(l.taken)return;
 const near=Math.abs(l.x-player.x)<125;
 ctx.save();ctx.translate(l.x,GROUND);
 // Compact real-world containers, shaded so they sit on the floor.
 ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(0,1,26,4,0,0,Math.PI*2);ctx.fill();
 let body=ctx.createLinearGradient(0,-29,0,0);body.addColorStop(0,l.t==='case'?'#9b9d86':'#6b6a54');body.addColorStop(.5,l.t==='case'?'#666e5c':'#3b4137');body.addColorStop(1,'#222b25');
 ctx.fillStyle=body;ctx.beginPath();ctx.roundRect(-20,-29,40,27,3);ctx.fill();
 line(-20,-25,20,-25,'#b6b49a88',1);line(-16,-24,-16,-3,'#252f2aaa',2);line(16,-24,16,-3,'#252f2aaa',2);
 if(l.t==='case'||l.t==='med'){ctx.strokeStyle='#424b3d';ctx.lineWidth=3;ctx.strokeRect(-6,-35,12,6);fill(-2,-23,4,15,'#b8bca3');fill(-7,-18,14,4,'#b8bca3')}
 else {fill(-12,-19,24,9,'#b5b19a33');line(-8,-14,7,-14,'#c6c0a466',1)}
 // Minimal diegetic interaction marker, strongest only when in reach.
 ctx.globalAlpha=near?1:.3;ctx.strokeStyle='#ded3b1';ctx.lineWidth=1;
 ctx.translate(0,-51);ctx.rotate(Math.PI/4);ctx.strokeRect(-4,-4,8,8);
 ctx.restore();
}
function beginCharacters(camera,visibleWidth){
 const rendererMode=window.Ember3DCharacters?.ready?'webgl-3d':'sprite-fallback';
 if(document.documentElement.dataset.characterRenderer!==rendererMode)document.documentElement.dataset.characterRenderer=rendererMode;
 if(window.Ember3DCharacters?.ready)Ember3DCharacters.beginFrame({viewWidth:visibleWidth,height:HEIGHT,cam:camera,width:w,heightPixels:h,dpr,dt:renderDt});
}
function flushCharacters(){if(window.Ember3DCharacters?.ready)Ember3DCharacters.flush(ctx);}
function char(x,y,isEnemy=false,enemy=null){
 const actor=isEnemy?enemy:player;
 const state={id:isEnemy?'enemy-'+enemies.indexOf(enemy):'player',x,y,face:actor.face,time:ambientTime,walk:actor.walk,speed:isEnemy?(actor.alert?(actor.type?94:68):22):(scene==='Shelter'?220:player.crouch?88:player.run?300:178),deathTime:actor.deathTime||0,moving:isEnemy?!actor.dead&&(actor.alert||Math.abs(actor.x-actor.home)>1):shelterMap.hidden&&!!forward(),crouch:!isEnemy&&player.crouch,run:!isEnemy&&player.run,isEnemy,type:actor.type||0,dead:!!actor.dead,attackTimer:actor.attackTimer||0,shootTimer:actor.shootTimer||0,hurtTimer:actor.hurtTimer||0,hitFlash:actor.hitFlash||0,alert:!!actor.alert};
 if(window.Ember3DCharacters?.ready){
  ctx.save();ctx.fillStyle='#01040380';ctx.beginPath();ctx.ellipse(x,y+1,state.dead?55:20,state.dead?3:4,0,0,Math.PI*2);ctx.fill();ctx.restore();
  Ember3DCharacters.submit(state);
 }else window.EmberCharacters?.draw(ctx,state);
}
function drawAtmosphere(){
 // Light scattering, drifting dust and near-plane rain are intentionally subtle:
 // the photographed material values carry most of the scene's lighting.
 ctx.save();ctx.globalCompositeOperation='screen';
 let sx=player.x-cam;
 let beam=ctx.createRadialGradient(sx+player.face*20,GROUND-94,0,sx+player.face*165,GROUND-93,250);
 beam.addColorStop(0,'#e9e2c00c');beam.addColorStop(.45,'#d6d9c607');beam.addColorStop(1,'#acbcaa00');
 ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(sx,GROUND-100);ctx.lineTo(sx+player.face*340,GROUND-170);ctx.lineTo(sx+player.face*340,GROUND+5);ctx.closePath();ctx.fill();
 for(const p of dust){let xx=p.x-cam;if(xx<0||xx>viewW)continue;fill(xx,p.y,p.s*.65,p.s*.65,'#c5ccbb26')}
 // Brief muzzle bounce illuminates the immediate surroundings, not a permanent glow.
 if(player.shootTimer>.26){const muzzle=window.Ember3DCharacters?.muzzlePosition?.();grad(muzzle?muzzle.x-cam:sx+player.face*50,muzzle?muzzle.y:GROUND-95,180,'#f3b96934','#f3b96900');}
 ctx.restore();
 ctx.save();
 for(let i=0;i<rain.length;i+=2){let p=rain[i],xx=((p.x-cam*.82+2000)%2000+2000)%2000,yy=(p.y+ambientTime*p.s)%800;
  if(xx<viewW&&(xx+cam<390||xx+cam>3310))line(xx,yy,xx-4,yy+p.length,'#bfccca30',.7)
 }
 let vignette=ctx.createRadialGradient(viewW*.5,HEIGHT*.48,HEIGHT*.22,viewW*.5,HEIGHT*.5,Math.max(viewW*.68,HEIGHT*.82));
 vignette.addColorStop(0,'#02060500');vignette.addColorStop(.6,'#02060508');vignette.addColorStop(1,'#020605a6');
 fill(0,0,viewW,HEIGHT,vignette);
 window.EmberScene?.foreground(ctx,cam,viewW,ambientTime);
 ctx.restore();
}
function draw(){if(scene==='Shelter'){drawShelter();return;}beginCharacters(cam,viewW);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.save();let scale=h/HEIGHT;ctx.scale(scale,scale);let shake=cameraShake?(r(frame*3)-.5)*cameraShake:0;ctx.translate(shake,0);{if(!window.EmberScene?.ready)sky();let sourceLeft=Math.max(0,Math.min(WORLD-1,cam));let sourceW=Math.min(WORLD-sourceLeft,viewW);if(sourceW>0)ctx.drawImage(environment,sourceLeft,0,sourceW,HEIGHT,0,0,sourceW,HEIGHT);}
ctx.save();ctx.translate(-cam,0);for(const loot of loots)glowLoot(loot);for(let i=0;i<enemies.length;i++){if(enemies[i].x>cam-180&&enemies[i].x<cam+viewW+180)char(enemies[i].x,GROUND,true,enemies[i]);}char(player.x,GROUND,false);flushCharacters();for(const b of bullets){if(b.originPending){const muzzle=window.Ember3DCharacters?.muzzlePosition?.();if(muzzle){b.x=muzzle.x;b.y=muzzle.y;}b.originPending=false;}let alpha=b.life/.17;ctx.strokeStyle=`rgba(251,204,130,${alpha*.7})`;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x+b.face*370,b.y);ctx.stroke()}for(const f of fx){ctx.globalAlpha=Math.max(0,f.life);fill(f.x,f.y,f.size,f.size,f.col)}ctx.globalAlpha=1;ctx.restore();drawAtmosphere();if(player.hurtTimer>0){fill(0,0,viewW,HEIGHT,`rgba(125,19,18,${player.hurtTimer*.17})`)}ctx.restore()}
let shelterFallback=null;
function paintShelterFallback(){
 if(!shelterFallback){
  shelterFallback=document.createElement('canvas');shelterFallback.width=1280;shelterFallback.height=720;
  const current=ctx;
  try{ctx=shelterFallback.getContext('2d');paintShelterGeometry();}finally{ctx=current;}
 }
 ctx.drawImage(shelterFallback,0,0);
}
function paintShelterGeometry(){
let wall=ctx.createLinearGradient(0,0,0,720);wall.addColorStop(0,'#0a151b');wall.addColorStop(.55,'#26302d');wall.addColorStop(1,'#101719');fill(0,0,1280,720,wall);
// Exterior ruins visible through broken upper windows.
for(let i=0;i<14;i++){let x=i*105-45,hh=130+r(i+22)*150;fill(x,185-hh,75,hh,'#172329');for(let k=0;k<5;k++)fill(x+12+(k%2)*28,195-hh+Math.floor(k/2)*39,12,19,'#5d675044')}
// Cross-section: two stacked rooms, heavy concrete beams and exposed brick.
fill(90,102,1090,520,'#444840');fill(108,119,1054,477,'#353c39');fill(110,124,1050,219,'#2b3636');fill(110,367,1050,229,'#353831');
for(let y of [106,351,598]){fill(70,y,1130,22,'#1b2528');fill(72,y+3,1126,4,'#71716666');fill(72,y+21,1126,7,'#0c1114')}
for(let x of [92,638,1162]){fill(x,112,22,485,'#1c292a');fill(x+5,112,4,485,'#76736344')}
for(let row=0;row<2;row++)for(let j=0;j<100;j++){let x=115+r(j*31+row)*1040,y=132+row*242+r(j*17+row)*205;fill(x,y,18+r(j+5)*37,2,'#b4a89116')}
// Upper sleeping room: broken glass, bed, bookshelves, lamp and weathered cabinet.
windowObj(170,151,155,143);windowObj(805,150,164,145);
fill(368,281,210,17,'#242a29');fill(373,254,192,31,'#5b6058');fill(390,239,132,25,'#8c8b79');fill(373,286,15,45,'#252a2a');fill(553,286,15,45,'#252a2a');
fill(995,160,105,181,'#383c36');for(let j=0;j<4;j++){fill(1002,180+j*37,91,7,'#77735b');for(let k=0;k<4;k++)fill(1012+k*20,160+j*37,12,19,k%2?'#7c7765':'#4c625b')}
fill(670,286,84,54,'#4c5146');fill(684,271,52,16,'#80735b');fill(701,243,7,30,'#3b3930');grad(706,239,100,'#f0d59b33','#f0d59b00');
// Ground-floor kitchen and storage, dense foreground silhouettes.
windowObj(165,405,150,129);fill(370,487,230,95,'#414840');fill(370,479,230,15,'#777866');for(let j=0;j<4;j++)fill(385+j*52,501,40,59,'#252f30');fill(389,459,55,20,'#535e58');fill(463,453,39,25,'#6a6a5c');
fill(195,552,98,37,'#48483d');fill(202,529,85,24,'#6d6551');fill(210,515,13,17,'#b6a98c');fill(240,512,17,19,'#8e9b86');
fill(682,414,140,166,'#4c4d42');fill(693,424,117,145,'#252f2f');for(let j=0;j<3;j++){fill(697,448+j*42,109,7,'#76715f');for(let k=0;k<5;k++)fill(702+k*20,425+j*42,13,21,k%2?'#73715d':'#5d6659')}
// Shelter exit, practical signage and warm lantern.
fill(940,391,147,206,'#172326');fill(953,400,123,196,'#303e3c');fill(968,419,89,174,'#172124');fill(1052,493,7,20,'#ba9d6b');fill(952,375,125,23,'#c2a678');ctx.fillStyle='#202d2d';ctx.font='bold 13px sans-serif';ctx.fillText('EXIT / 外出',972,391);
grad(1030,419,135,'#dfba7e36','#dfba7e00');
// Pooled lights, shadows and foreground rubble.
for(let x of [300,710,1020])grad(x,540,200,'#c3a77a15','#c3a77a00');for(let j=0;j<35;j++){let x=90+r(j*14)*1090;fill(x,592-r(j*9)*9,7+r(j+2)*25,2+r(j*2)*5,'#1c2424aa')}

}
function drawShelter(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.save();
 const sc=h/HEIGHT,visibleWidth=HEIGHT*w/h;
 const cameraPan=Math.max(0,Math.min(1280-visibleWidth,shelterX-visibleWidth*.4));
 const centerOffset=Math.max(0,(w-1280*sc)/2);
 ctx.translate(centerOffset-cameraPan*sc,0);ctx.scale(sc,sc);
 if(!window.EmberScene?.paintShelter?.(ctx,1280,720))paintShelterFallback();
 // Time-of-day tint leaves the local warm practical lights readable.
 fill(0,0,1280,720,`rgba(8,18,25,${Math.max(0,(dayMinutes-720)/360)*.14})`);
 beginCharacters(cameraPan,visibleWidth);char(shelterX,GROUND,false);flushCharacters();
 ctx.font='11px -apple-system,BlinkMacSystemFont,sans-serif';ctx.textAlign='center';
 for(const [x,label] of [[270,'储物柜'],[500,workbenchBuilt?'工作台 · 已修复':'工作台'],[1010,'外出地图']]){
  const near=Math.abs(shelterX-x)<115;ctx.fillStyle=near?'#ead9b6':'#babaa47a';ctx.fillText(near?'◇ '+label+' / F':label,x,634);
 }
 ctx.restore();
}
const loadStatus=document.querySelector('#loadStatus'),loadBar=document.querySelector('#loadingProgress'),loadFill=document.querySelector('#loadingProgressFill'),loadPercent=document.querySelector('#loadingPercent');
function setLoadProgress(percent,message){
 const value=Math.max(0,Math.min(100,Math.round(percent)));
 loadStatus.textContent=message;loadBar?.setAttribute('aria-valuenow',String(value));if(loadFill)loadFill.style.width=value+'%';if(loadPercent)loadPercent.textContent=value+'%';
}
function showError(err){window.__gameReady=false;paused=true;overlay.hidden=false;startBtn.disabled=true;startBtn.textContent='初始化失败，请刷新';setLoadProgress(0,'游戏错误：'+(err?.message||err));console.error(err);}
function markReady(message='场景、角色与物资已就绪'){
 window.__gameReady=true;lifecycle.setState('Ready');setLoadProgress(100,message);startBtn.disabled=false;startBtn.textContent='进入避难所';
}
async function load3DCharacters(progress){
 let expired=false,timer;
 try{
  const load=async()=>{
   await import(new URL('assets/characters-3d.js?v=3d-02',document.baseURI).href);
   if(expired)return false;
   return await window.Ember3DCharacters.load(progress);
  };
  return await Promise.race([load(),new Promise(resolve=>{timer=setTimeout(()=>{expired=true;window.Ember3DCharacters?.fallback?.();resolve(false)},20000)})]);
 }catch(error){console.info('3D 人物不可用，使用序列帧回退：',error.message);return false;}
 finally{clearTimeout(timer);}
}
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
async function initializeGame(){
 lifecycle.setState('Loading');window.__gameReady=false;startBtn.disabled=true;
 try{
  setLoadProgress(5,'正在检查浏览器渲染支持…');await nextPaint();
  if(!ctx||!ec)throw new Error('浏览器不支持 Canvas 2D');
  setLoadProgress(20,'正在配置画面尺寸…');await nextPaint();resize();
  setLoadProgress(30,'正在生成角色、敌人和物资…');await nextPaint();reset();
  let sceneProgress=0,characterProgress=0,modelProgress=0;
  const report=()=>setLoadProgress(35+45*(sceneProgress*.4+characterProgress*.2+modelProgress*.4),'正在加载场景与人物材质…');
  setLoadProgress(35,'正在加载场景与人物材质…');await nextPaint();
  const [artReady,charactersReady,modelReady]=await Promise.all([
   window.EmberScene?.load((done,total)=>{sceneProgress=total?done/total:1;report();}),
   window.EmberCharacters?.load?.(fraction=>{characterProgress=fraction;report();}),
   load3DCharacters(fraction=>{modelProgress=fraction;report();})
  ]);
  setLoadProgress(85,'正在缓存建筑和环境资源…');await nextPaint();cacheEnv();
  setLoadProgress(95,'正在渲染避难所首帧…');await nextPaint();showShelter();draw();
  document.documentElement.dataset.characterRenderer=modelReady?'webgl-3d':'sprite-fallback';
  markReady(artReady&&charactersReady?(modelReady?'场景、3D 人物与物资已就绪':'场景已就绪 · 当前设备使用序列帧人物'):'部分材质不可用，已启用基础画面回退');
 }catch(err){lifecycle.setState('Error');showError(err);}
}
initializeGame();
})();
