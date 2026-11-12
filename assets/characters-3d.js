import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';

// A single, offscreen WebGL surface is composited into the existing Canvas scene.
// The game remains the only clock and owns all movement/collision state.
const MAX_ACTORS = 8;
const MODEL_URL = new URL('./models/Survivor.glb', import.meta.url).href;
const EPSILON = 1e-6;
let renderer = null, scene = null, camera = null, template = null;
let ready = false, loading = null, disposed = false, revision = 0, frame = null;
let sourceHeight = 1, sourceFloor = 0, currentPool = 0, abort = null;
const pool = [], actors = new Map(), resources = {geometry:new Set(),material:new Set(),texture:new Set()};
const stats = {enabled:false,visibleActors:0,drawCalls:0,triangles:0,frames:0,actorCount:0,reason:'not-loaded'};
const box = new THREE.Box3(), size = new THREE.Vector3(), additive = new THREE.Quaternion();
const euler = new THREE.Euler();
const boneAliases = {
  hips:['pelvis','mixamorig:Hips'], spine:['spine_01','mixamorig:Spine'],
  chest:['spine_03','mixamorig:Spine2'], neck:['neck_01','mixamorig:Neck'],head:['head','mixamorig:Head'],
  upperL:['upperarm_l','mixamorig:LeftArm'],lowerL:['lowerarm_l','mixamorig:LeftForeArm'],
  upperR:['upperarm_r','mixamorig:RightArm'],lowerR:['lowerarm_r','mixamorig:RightForeArm'],
  handR:['hand_r','mixamorig:RightHand'],handL:['hand_l','mixamorig:LeftHand'],
  thighL:['thigh_l','mixamorig:LeftUpLeg'],calfL:['calf_l','mixamorig:LeftLeg'],footL:['foot_l','mixamorig:LeftFoot'],
  thighR:['thigh_r','mixamorig:RightUpLeg'],calfR:['calf_r','mixamorig:RightLeg'],footR:['foot_r','mixamorig:RightFoot']
};
const ikStart=new THREE.Vector3(),ikMid=new THREE.Vector3(),ikEnd=new THREE.Vector3();
const ikDirection=new THREE.Vector3(),ikBend=new THREE.Vector3(),ikKnee=new THREE.Vector3(),ikTarget=new THREE.Vector3();
const aimOrigin=new THREE.Vector3(),aimCurrent=new THREE.Vector3(),aimWanted=new THREE.Vector3();
const aimDelta=new THREE.Quaternion(),aimParent=new THREE.Quaternion(),aimLocal=new THREE.Quaternion();
const poseTarget=new THREE.Vector3(),posePole=new THREE.Vector3(),savedFootL=new THREE.Quaternion(),savedFootR=new THREE.Quaternion();
const worldOrientation=new THREE.Quaternion(),worldDirection=new THREE.Vector3(),forwardAxis=new THREE.Vector3(0,0,1);
function aimBoneWorld(bone,child,target){
  if(!bone||!child)return;
  bone.getWorldPosition(aimOrigin);child.getWorldPosition(aimCurrent);
  aimCurrent.sub(aimOrigin).normalize();aimWanted.copy(target).sub(aimOrigin).normalize();
  aimDelta.setFromUnitVectors(aimCurrent,aimWanted);
  bone.parent.getWorldQuaternion(aimParent);
  aimLocal.copy(aimParent).invert().multiply(aimDelta).multiply(aimParent);
  bone.quaternion.premultiply(aimLocal);bone.updateWorldMatrix(true,true);
}
function solveTwoBone(upper,lower,end,target,pole){
  if(!upper||!lower||!end)return;
  upper.getWorldPosition(ikStart);lower.getWorldPosition(ikMid);end.getWorldPosition(ikEnd);
  const first=ikStart.distanceTo(ikMid),second=ikMid.distanceTo(ikEnd);
  ikDirection.copy(target).sub(ikStart);
  const distance=Math.max(.01,Math.min(first+second-.01,ikDirection.length()));
  ikDirection.normalize();
  const along=(first*first-second*second+distance*distance)/(2*distance);
  const bend=Math.sqrt(Math.max(0,first*first-along*along));
  ikBend.copy(pole).addScaledVector(ikDirection,-pole.dot(ikDirection));
  if(ikBend.lengthSq()<.001)ikBend.set(0,0,1);ikBend.normalize();
  ikKnee.copy(ikStart).addScaledVector(ikDirection,along).addScaledVector(ikBend,bend);
  ikTarget.copy(ikStart).addScaledVector(ikDirection,distance);
  aimBoneWorld(upper,lower,ikKnee);aimBoneWorld(lower,end,ikTarget);
}
function setWorldOrientation(node,quaternion){
  node.parent.getWorldQuaternion(aimParent);node.quaternion.copy(aimParent.invert().multiply(quaternion));node.updateWorldMatrix(true,true);
}
function ownMaterial(material) {
  if (!material) return;
  resources.material.add(material);
  for (const value of Object.values(material)) if (value?.isTexture) resources.texture.add(value);
}
function poseBone(actor,name,x=0,y=0,z=0) {
  const bone=actor.bones[name]; if(!bone) return;
  euler.set(x,y,z);additive.setFromEuler(euler);bone.quaternion.multiply(additive);
}
function makeWeapon() {
  const weapon=new THREE.Group();
  const steel=new THREE.MeshStandardMaterial({color:0x262b29,roughness:.65,metalness:.55});
  const grip=new THREE.MeshStandardMaterial({color:0x24231f,roughness:.95});
  ownMaterial(steel);ownMaterial(grip);
  // Small sidearm, native model space (about 22cm); not scaled to screen pixels.
  const barrelGeometry=new THREE.BoxGeometry(.035,.035,.18),gripGeometry=new THREE.BoxGeometry(.032,.08,.045);
  resources.geometry.add(barrelGeometry);resources.geometry.add(gripGeometry);
  const barrel=new THREE.Mesh(barrelGeometry,steel);barrel.position.z=.065;
  const handle=new THREE.Mesh(gripGeometry,grip);handle.position.set(0,-.047,.015);
  weapon.add(barrel,handle);weapon.visible=false;return weapon;
}
function makeBackpack(){
  const bag=new THREE.Group();
  const canvas=new THREE.MeshStandardMaterial({color:0x595747,roughness:.98});
  const leather=new THREE.MeshStandardMaterial({color:0x252c23,roughness:.94});
  ownMaterial(canvas);ownMaterial(leather);
  const bodyGeometry=new THREE.BoxGeometry(20,26,12),flapGeometry=new THREE.BoxGeometry(21,8,13),strapGeometry=new THREE.BoxGeometry(3,26,13);
  for(const geometry of [bodyGeometry,flapGeometry,strapGeometry])resources.geometry.add(geometry);
  bag.add(new THREE.Mesh(bodyGeometry,canvas));
  const flap=new THREE.Mesh(flapGeometry,canvas);flap.position.y=9;bag.add(flap);
  for(const x of [-6,6]){const strap=new THREE.Mesh(strapGeometry,leather);strap.position.set(x,-1,0);bag.add(strap);}
  bag.visible=false;return bag;
}
function createActor() {
  const model=cloneSkeleton(template.scene);
  const root=new THREE.Group(),facing=new THREE.Group(),normalizer=new THREE.Group();
  normalizer.scale.setScalar(150/sourceHeight);normalizer.position.y=-sourceFloor*150/sourceHeight;
  normalizer.add(model);facing.add(normalizer);root.add(facing);scene.add(root);root.visible=false;
  const bones={};
  for(const [key,names] of Object.entries(boneAliases)) {
    for(const name of names){const found=model.getObjectByName(name);if(found){bones[key]=found;break;}}
  }
  const modelMaterials=new Map();
  model.traverse(node=>{
    if(node.isMesh){
      node.frustumCulled=false;
      if(/held[ _-]*accessory/i.test(node.name))node.visible=false;
      const cloneMaterial=material=>{
        if(!modelMaterials.has(material)){const copy=material.clone();modelMaterials.set(material,copy);ownMaterial(copy);}
        return modelMaterials.get(material);
      };
      node.material=Array.isArray(node.material)?node.material.map(cloneMaterial):cloneMaterial(node.material);
    }
  });
  const weapon=makeWeapon(),backpack=makeBackpack();root.add(backpack);
  if(bones.upperR){
    // Keep this prop in model coordinates, not in screen space. It follows the hand bone.
    (bones.handR||model.getObjectByName('hand_r')||model).add(weapon);
    weapon.rotation.set(0,0,0);
  }
  const hipOrigin=bones.hips?.position.clone();
  const mixer=new THREE.AnimationMixer(model);
  const walkClip=template.animations.find(c=>/walk/i.test(c.name))||template.animations[0];
  const walkAction=walkClip?mixer.clipAction(walkClip).play():null;
  if(walkAction){walkAction.time=walkClip.duration*.25;mixer.update(0);}
  const poseCache=Object.values(bones).map(node=>({node,quaternion:node.quaternion.clone(),position:node.position.clone()}));
  const actor={id:null,root,facing,model,normalizer,bones,mixer,walkAction,walkClip,poseCache,weapon,backpack,
    hipOrigin,lastTime:null,enemy:false,visible:false,clip:'IdlePose',originalMaterials:modelMaterials,phase:0};
  pool.push(actor);return actor;
}
function configureActor(actor,state) {
  actor.enemy=!!state.isEnemy;
  for(const [original,material] of actor.originalMaterials){
    material.color?.copy(original.color);
    if(state.isEnemy)material.color?.multiply(new THREE.Color(state.type?0x7d8671:0x929681));
    material.roughness=Math.max(original.roughness??.8,state.isEnemy?.92:.85);
    if(!state.isEnemy){
      if(/original top/i.test(material.name))material.color?.multiply(new THREE.Color().setRGB(.84,.81,.74));
      if(/shoes01/i.test(material.name))material.color?.multiply(new THREE.Color().setRGB(.68,.63,.56));
    }
  }
}
function updateActor(actor,state) {
  const delta=frame.dt===null?Math.min(.06,Math.max(0,(state.time??0)-(actor.lastTime??state.time??0))):frame.dt;
  actor.lastTime=state.time??0;
  const moving=!!state.moving&&!state.dead;
  // Restore the animation result from the last frame before applying additive poses.
  for(const pose of actor.poseCache){pose.node.quaternion.copy(pose.quaternion);pose.node.position.copy(pose.position);}
  if(actor.walkAction){
    actor.walkAction.paused=!moving;
    const speed=state.isEnemy?(state.alert?.8:.53):state.run?1.65:state.crouch?.55:1;
    actor.walkAction.timeScale=speed;
    if(!moving&&!state.dead)actor.walkAction.time=actor.walkClip.duration*.25;
    actor.mixer.update(delta);
    actor.clip=moving?(state.run?'Walk_Brisk / run speed':state.isEnemy?'Walk_Brisk / shamble':'Walk_Brisk'):'IdlePose (held walk + breathing)';
    if(state.dead)actor.clip='CorpsePose';
  }
  for(const pose of actor.poseCache){pose.quaternion.copy(pose.node.quaternion);pose.position.copy(pose.node.position);}
  // The gameplay position is authoritative: imported clips may bob vertically but
  // may never accumulate root travel in X/Z.
  const hips=actor.bones.hips;
  if(hips&&actor.hipOrigin){hips.position.x=actor.hipOrigin.x;hips.position.z=actor.hipOrigin.z;}
  actor.root.position.set(state.x,frame.height-state.y,0);
  actor.root.rotation.set(0,0,0);actor.root.scale.set(1,1,1);
  const target=(state.face||1)>0?Math.PI*.5:-Math.PI*.5;
  if(actor.phase===0)actor.facing.rotation.y=target;
  else{let angle=target-actor.facing.rotation.y;while(angle>Math.PI)angle-=Math.PI*2;while(angle<-Math.PI)angle+=Math.PI*2;actor.facing.rotation.y+=angle*Math.min(1,delta*18);}
  actor.phase++;
  if(!moving&&!state.dead){
    poseBone(actor,'chest',Math.sin((state.time||0)*1.8)*.007,0,0);
    poseBone(actor,'head',0,Math.sin((state.time||0)*.65)*.016,0);
  }
  if(state.isEnemy&&!state.dead){
    poseBone(actor,'spine',.2,0,.035);poseBone(actor,'chest',.16,0,0);poseBone(actor,'neck',.16,0,0);
    poseBone(actor,'upperL',-.25,0,-.12);poseBone(actor,'upperR',-.4,0,.14);
    poseBone(actor,'lowerL',-.24);poseBone(actor,'lowerR',-.3);
  }
  if(state.crouch&&!state.dead){
    
    poseBone(actor,'spine',.18);poseBone(actor,'head',-.13);
  }
  const firing=!state.isEnemy&&(state.shootTimer||0)>.13;
  const melee=!state.isEnemy&&(state.attackTimer||0)>.2&&!firing;
  actor.weapon.visible=!state.isEnemy&&!state.dead;
  if(firing)poseBone(actor,'chest',0,.08,0);
  if(melee)poseBone(actor,'chest',0,Math.sin((state.attackTimer||0)*14)*.2,0);
  if(state.hitFlash>0||state.hurtTimer>0)poseBone(actor,'chest',-.08,0,.06);
  if(state.dead){
    actor.root.updateMatrixWorld(true);actor.bones.footL?.getWorldQuaternion(savedFootL);actor.bones.footR?.getWorldQuaternion(savedFootR);
    actor.root.position.x=state.x-58;actor.root.position.y=frame.height-state.y+12;
    actor.root.rotation.z=-Math.PI*.5;actor.root.scale.y=.72;
    poseBone(actor,'thighL',-.28);poseBone(actor,'calfL',.58);poseBone(actor,'upperL',-.35);
  }
  actor.visible=true;actor.root.visible=true;
  actor.root.updateMatrixWorld(true);
  actor.backpack.visible=!state.isEnemy&&!state.dead;
  if(actor.backpack.visible&&actor.bones.chest){
    actor.bones.chest.getWorldPosition(poseTarget);poseTarget.x-=(state.face||1)*13;poseTarget.y-=5;
    actor.backpack.position.copy(actor.root.worldToLocal(poseTarget));actor.backpack.rotation.y=actor.facing.rotation.y;
  }
  const floorY=frame.height-state.y;
  if(state.crouch&&!state.dead){
    // Translate the pelvis in world Y: the source rig's local axes are rotated.
    if(hips){hips.getWorldPosition(poseTarget);poseTarget.y-=30;hips.position.copy(hips.parent.worldToLocal(poseTarget));actor.root.updateMatrixWorld(true);}
    actor.bones.footL?.getWorldQuaternion(savedFootL);actor.bones.footR?.getWorldQuaternion(savedFootR);
    posePole.set(state.face||1,0,.05);
    poseTarget.set(state.x-(state.face||1)*16,floorY+4,0);
    solveTwoBone(actor.bones.thighL,actor.bones.calfL,actor.bones.footL,poseTarget,posePole);
    poseTarget.set(state.x+(state.face||1)*14,floorY+4,0);
    solveTwoBone(actor.bones.thighR,actor.bones.calfR,actor.bones.footR,poseTarget,posePole);
    if(actor.bones.footL)setWorldOrientation(actor.bones.footL,savedFootL);
    if(actor.bones.footR)setWorldOrientation(actor.bones.footR,savedFootR);
  }
  if(firing||melee){
    const reach=melee?42:43;
    const handHeight=melee?102+Math.sin((state.attackTimer||0)*15)*22:105;
    poseTarget.set(state.x+(state.face||1)*reach,floorY+handHeight,6);
    posePole.set(0,-1,.15);
    solveTwoBone(actor.bones.upperR,actor.bones.lowerR,actor.bones.handR,poseTarget,posePole);
  }
  if(actor.weapon.visible){
    worldDirection.set((state.face||1)*(firing?1:.32),firing?0:-.94,0).normalize();
    worldOrientation.setFromUnitVectors(forwardAxis,worldDirection);setWorldOrientation(actor.weapon,worldOrientation);
  }
  if(state.dead){
    // Rest the torso on the floor, then solve extremities above that same plane.
    // Using the lowest animated walking foot as the body's anchor made the body float.
    let minY=Infinity;
    for(const name of ['head','chest','hips']){
      const bone=actor.bones[name];if(bone){bone.getWorldPosition(poseTarget);minY=Math.min(minY,poseTarget.y);}
    }
    if(Number.isFinite(minY))actor.root.position.y+=floorY-minY+11;
    actor.root.updateMatrixWorld(true);
    posePole.set(0,1,.1);
    poseTarget.set(state.x-49,floorY+12,0);solveTwoBone(actor.bones.thighL,actor.bones.calfL,actor.bones.footL,poseTarget,posePole);
    poseTarget.set(state.x-28,floorY+12,3);solveTwoBone(actor.bones.thighR,actor.bones.calfR,actor.bones.footR,poseTarget,posePole);
    if(actor.bones.footL)setWorldOrientation(actor.bones.footL,savedFootL);
    if(actor.bones.footR)setWorldOrientation(actor.bones.footR,savedFootR);
    poseTarget.set(state.x+12,floorY+18,4);solveTwoBone(actor.bones.upperL,actor.bones.lowerL,actor.bones.handL,poseTarget,posePole);
    poseTarget.set(state.x+38,floorY+18,5);solveTwoBone(actor.bones.upperR,actor.bones.lowerR,actor.bones.handR,poseTarget,posePole);
  }
}
function snapshotStats(){return {...stats};}
function inspect(){
  const matrixBone=bone=>bone?bone.quaternion.toArray().map(n=>Math.round(n*1e6)/1e6):[];
  return {ready,mode:ready?'webgl3d':'sprite-fallback',pooledActorCount:pool.length,stats:snapshotStats(),actors:[...actors.values()].map(a=>({
    id:a.id,visible:a.visible,clip:a.clip,clipTime:a.walkAction?.time??0,
    bones:{Hips:matrixBone(a.bones.hips),RightUpLeg:matrixBone(a.bones.thighR),LeftArm:matrixBone(a.bones.upperL)}
  }))};
}
function dispose(reason='disposed') {
  ready=false;disposed=true;revision++;stats.enabled=false;stats.reason=reason;
  abort?.abort();abort=null;
  for(const actor of pool){actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.model);}
  pool.length=0;actors.clear();currentPool=0;
  for(const geometry of resources.geometry)geometry.dispose();
  for(const material of resources.material)material.dispose();
  for(const texture of resources.texture)texture.dispose();
  resources.geometry.clear();resources.material.clear();resources.texture.clear();
  renderer?.dispose();renderer=null;scene=null;camera=null;template=null;
  stats.actorCount=0;stats.visibleActors=0;stats.drawCalls=0;stats.triangles=0;
}
function fallback(reason='fallback'){dispose(reason);return false;}
async function load(onProgress) {
  if(loading)return loading;
  loading=(async()=>{
    const token=revision;let timeout;
    try{
      onProgress?.(0);
      disposed=false;
      const mobile=matchMedia('(pointer: coarse)').matches;
      renderer=new THREE.WebGLRenderer({alpha:true,premultipliedAlpha:true,antialias:!mobile,powerPreference:'low-power'});
      renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
      renderer.setPixelRatio(1);renderer.setSize(1280,720,false);
      renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback('context-lost');});
      scene=new THREE.Scene();camera=new THREE.OrthographicCamera(0,1280,720,0,.1,3000);
      camera.position.set(0,0,1000);camera.lookAt(0,0,0);
      scene.add(new THREE.HemisphereLight(0xc1d0ce,0x302c20,1.15));
      const key=new THREE.DirectionalLight(0xffd6a6,1.9);key.position.set(-150,400,450);scene.add(key);
      const fill=new THREE.DirectionalLight(0x9ebfc7,.75);fill.position.set(250,230,-200);scene.add(fill);
      abort=new AbortController();
      const loadingWork=(async()=>{
        const response=await fetch(MODEL_URL,{signal:abort.signal});if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
        const bytes=await response.arrayBuffer();onProgress?.(.45);
        const result=await new GLTFLoader().parseAsync(bytes,new URL('./models/',import.meta.url).href);
        if(token!==revision||disposed)return false;
        template=result;
        template.scene.updateMatrixWorld(true);box.setFromObject(template.scene);box.getSize(size);
        sourceHeight=size.y;sourceFloor=box.min.y;if(!Number.isFinite(sourceHeight)||sourceHeight<EPSILON)throw new Error('Invalid model bounds');
        template.scene.traverse(node=>{if(node.isMesh){resources.geometry.add(node.geometry);(Array.isArray(node.material)?node.material:[node.material]).forEach(ownMaterial);}});
        for(let i=0;i<MAX_ACTORS;i++)createActor();
        onProgress?.(.85);
        // Compile and upload the first rig during Loading, not on first gameplay input.
        pool[0].root.visible=true;await renderer.compileAsync(scene,camera);
        if(token!==revision||disposed)return false;
        renderer.render(scene,camera);pool[0].root.visible=false;
        ready=true;stats.enabled=true;stats.reason='';onProgress?.(1);return true;
      })();
      const deadline=new Promise(resolve=>{timeout=setTimeout(()=>{fallback('initialization-timeout');resolve(false);},15000);});
      return await Promise.race([loadingWork,deadline]);
    }catch(error){fallback(error?.message||'initialization-failed');return false;}
    finally{clearTimeout(timeout);}
  })();
  return loading;
}
function beginFrame(config={}) {
  if(!ready)return false;
  const width=Math.max(1,config.width||1280),heightPixels=Math.max(1,config.heightPixels||720);
  const ratio=Math.min(config.dpr||1,1.5);
  const pixelWidth=Math.max(1,Math.round(width*ratio)),pixelHeight=Math.max(1,Math.round(heightPixels*ratio));
  if(renderer.domElement.width!==pixelWidth||renderer.domElement.height!==pixelHeight)renderer.setSize(pixelWidth,pixelHeight,false);
  frame={viewWidth:config.viewWidth||1280,height:config.height||720,cam:config.cam||0,
    dt:Number.isFinite(config.dt)?Math.min(.06,Math.max(0,config.dt)):null,pixelWidth,pixelHeight};
  camera.left=frame.cam;camera.right=frame.cam+frame.viewWidth;camera.top=frame.height;camera.bottom=0;camera.updateProjectionMatrix();
  for(const actor of pool){actor.visible=false;actor.root.visible=false;}
  stats.visibleActors=0;return true;
}
function submit(state) {
  if(!ready||!frame||!state||state.id===undefined)return false;
  let actor=actors.get(state.id);
  if(!actor){
    if(currentPool>=MAX_ACTORS)return false;
    actor=pool[currentPool++];actor.id=state.id;configureActor(actor,state);actors.set(state.id,actor);stats.actorCount=actors.size;
  }
  updateActor(actor,state);return true;
}
function flush(ctx) {
  if(!ready||!frame||!ctx)return false;
  try{
    renderer.render(scene,camera);
    // Canvas caller is already in world coordinates, including its camera shift.
    // Painting one transparent framebuffer preserves the 2.5D scene composition.
    ctx.drawImage(renderer.domElement,0,0,frame.pixelWidth,frame.pixelHeight,frame.cam,0,frame.viewWidth,frame.height);
    stats.visibleActors=pool.reduce((n,a)=>n+(a.visible?1:0),0);
    stats.drawCalls=renderer.info.render.calls;stats.triangles=renderer.info.render.triangles;stats.frames++;
    return true;
  }catch(error){return fallback(error?.message||'render-failed');}
}
addEventListener('pagehide',event=>{if(!event.persisted)dispose('page-hidden');},{once:true});
window.Ember3DCharacters=Object.freeze({load,beginFrame,submit,flush,fallback,dispose,inspect,
  get ready(){return ready;},get stats(){return snapshotStats();}});
