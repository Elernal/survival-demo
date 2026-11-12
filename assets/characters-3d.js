import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';
import { createCharacterLook } from './character-look.js';

// A single, offscreen WebGL surface is composited into the existing Canvas scene.
// The game remains the only clock and owns all movement/collision state.
const MAX_ACTORS = 8;
const MODEL_URL = new URL('./models/Survivor.glb', import.meta.url).href;
const EPSILON = 1e-6;
let renderer = null, scene = null, camera = null, template = null;
let ready = false, loading = null, disposed = false, revision = 0, frame = null;
let sourceHeight = 1, sourceFloor = 0, currentPool = 0, abort = null;
const pool = [], actors = new Map(), resources = {geometry:new Set(),material:new Set(),texture:new Set()};
const look=createCharacterLook(THREE,resources);
const stats = {enabled:false,visibleActors:0,drawCalls:0,triangles:0,frames:0,actorCount:0,reason:'not-loaded'};
const skinBounds=new THREE.Box3();
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
const ikLowerVector=new THREE.Vector3(),ikDesiredVector=new THREE.Vector3(),ikUpperDelta=new THREE.Quaternion(),ikLowerDelta=new THREE.Quaternion();
const ikDirection=new THREE.Vector3(),ikBend=new THREE.Vector3(),ikKnee=new THREE.Vector3(),ikTarget=new THREE.Vector3();
const aimOrigin=new THREE.Vector3(),aimCurrent=new THREE.Vector3(),aimWanted=new THREE.Vector3();
const aimDelta=new THREE.Quaternion(),aimParent=new THREE.Quaternion(),aimLocal=new THREE.Quaternion();
const poseTarget=new THREE.Vector3(),posePole=new THREE.Vector3();
const worldOrientation=new THREE.Quaternion(),worldDirection=new THREE.Vector3(),forwardAxis=new THREE.Vector3(0,0,1);
function applyWorldDelta(bone,delta){
  bone.parent.getWorldQuaternion(aimParent);
  aimLocal.copy(aimParent).invert().multiply(delta).multiply(aimParent);
  bone.quaternion.premultiply(aimLocal);bone.updateWorldMatrix(true,true);
}
function solveTwoBone(upper,lower,end,target,pole,lengths=null){
  if(!upper||!lower||!end)return;
  upper.getWorldPosition(ikStart);lower.getWorldPosition(ikMid);end.getWorldPosition(ikEnd);
  const first=lengths?.upper||ikStart.distanceTo(ikMid),second=lengths?.lower||ikMid.distanceTo(ikEnd);
  ikDirection.copy(target).sub(ikStart);
  const distance=Math.max(.01,Math.min(first+second-.01,ikDirection.length()));
  ikDirection.normalize();
  const along=(first*first-second*second+distance*distance)/(2*distance);
  const bend=Math.sqrt(Math.max(0,first*first-along*along));
  ikBend.copy(pole).addScaledVector(ikDirection,-pole.dot(ikDirection));
  if(ikBend.lengthSq()<.001)ikBend.set(0,0,1);ikBend.normalize();
  ikKnee.copy(ikStart).addScaledVector(ikDirection,along).addScaledVector(ikBend,bend);
  ikTarget.copy(ikStart).addScaledVector(ikDirection,distance);
  if(lengths?.lowerDirection){lower.getWorldQuaternion(aimParent);ikLowerVector.copy(lengths.lowerDirection).applyQuaternion(aimParent);}
  else ikLowerVector.copy(ikEnd).sub(ikMid);
  ikDesiredVector.copy(ikMid).sub(ikStart).normalize();aimCurrent.copy(ikKnee).sub(ikStart).normalize();
  ikUpperDelta.setFromUnitVectors(ikDesiredVector,aimCurrent);applyWorldDelta(upper,ikUpperDelta);
  ikLowerVector.applyQuaternion(ikUpperDelta).normalize();lower.getWorldPosition(aimOrigin);
  ikDesiredVector.copy(ikTarget).sub(aimOrigin).normalize();
  ikLowerDelta.setFromUnitVectors(ikLowerVector,ikDesiredVector);applyWorldDelta(lower,ikLowerDelta);
  // This MPFB export keeps foot controls under the root, outside the calf chain.
  // Move those independent controls as well as the deforming thigh/calf bones.
  let parent=end.parent;while(parent&&parent!==lower)parent=parent.parent;
  if(parent!==lower){ikEnd.copy(ikTarget);end.position.copy(end.parent.worldToLocal(ikEnd));end.updateWorldMatrix(true,true);}
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
  const weapon=new THREE.Group(),pistol=new THREE.Group(),knife=new THREE.Group(),muzzle=new THREE.Object3D();
  const steel=new THREE.MeshStandardMaterial({color:0x313933,roughness:.68,metalness:.5});
  const grip=new THREE.MeshStandardMaterial({color:0x272820,roughness:.95});
  const bladeMaterial=new THREE.MeshStandardMaterial({color:0x9eaa9c,roughness:.48,metalness:.7});
  for(const material of [steel,grip,bladeMaterial])ownMaterial(material);
  const barrelGeometry=new THREE.BoxGeometry(.035,.035,.18),gripGeometry=new THREE.BoxGeometry(.032,.08,.045);
  const bladeGeometry=new THREE.BoxGeometry(.017,.011,.17),knifeGripGeometry=new THREE.BoxGeometry(.025,.025,.075);
  for(const geometry of [barrelGeometry,gripGeometry,bladeGeometry,knifeGripGeometry])resources.geometry.add(geometry);
  const barrel=new THREE.Mesh(barrelGeometry,steel);barrel.position.z=.065;
  const handle=new THREE.Mesh(gripGeometry,grip);handle.position.set(0,-.047,.015);pistol.add(barrel,handle);
  const blade=new THREE.Mesh(bladeGeometry,bladeMaterial);blade.position.z=.115;
  const hilt=new THREE.Mesh(knifeGripGeometry,grip);hilt.position.z=.005;knife.add(blade,hilt);
  muzzle.position.z=.155;weapon.add(pistol,knife,muzzle);knife.visible=false;weapon.visible=false;
  weapon.userData={pistol,knife,muzzle};return weapon;
}
function makeBackpack(){return look.createBackpack();}
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
      if(/held[ _-]*accessory/i.test(node.name)||/^Phone$/i.test(node.name))node.visible=false;
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
  root.updateMatrixWorld(true);
  const footReference={};
  for(const side of ['L','R']){
    const foot=bones['foot'+side];
    footReference[side]={position:new THREE.Vector3(),quaternion:new THREE.Quaternion()};
    if(foot){foot.getWorldPosition(footReference[side].position);foot.getWorldQuaternion(footReference[side].quaternion);}
    footReference[side].height=Math.max(3,Math.min(18,footReference[side].position.y));
    const thigh=bones['thigh'+side],calf=bones['calf'+side];
    if(thigh&&calf&&foot){
      thigh.getWorldPosition(ikStart);calf.getWorldPosition(ikMid);foot.getWorldPosition(ikEnd);calf.getWorldQuaternion(aimParent);
      footReference[side].lengths={upper:ikStart.distanceTo(ikMid),lower:ikMid.distanceTo(ikEnd),lowerDirection:ikEnd.clone().sub(ikMid).applyQuaternion(aimParent.invert()).normalize()};
    }
  }
  const mixer=new THREE.AnimationMixer(model);
  const walkClip=template.animations.find(c=>/walk/i.test(c.name))||template.animations[0];
  const walkAction=walkClip?mixer.clipAction(walkClip).play():null;
  if(walkAction){walkAction.time=walkClip.duration*.25;mixer.update(0);}
  const poseCache=Object.values(bones).map(node=>({node,quaternion:node.quaternion.clone(),position:node.position.clone(),idleQuaternion:node.quaternion.clone(),idlePosition:node.position.clone()}));
  const actor={id:null,root,facing,model,normalizer,bones,mixer,walkAction,walkClip,poseCache,weapon,backpack,
    footReference,lastTime:null,enemy:false,visible:false,clip:'Idle',originalMaterials:modelMaterials,phase:0,initialized:false,motion:{move:0,crouch:0,aim:0,melee:0,death:0},recoil:0,lastShot:0,groundCorrection:null,muzzle:new THREE.Vector3()};
  pool.push(actor);return actor;
}
function configureActor(actor,state) {
  actor.enemy=!!state.isEnemy;
  for(const [original,material] of actor.originalMaterials)look.styleMaterial(material,original,state);
}
const rawFootL=new THREE.Vector3(),rawFootR=new THREE.Vector3(),rawHandL=new THREE.Vector3(),rawHandR=new THREE.Vector3();
const rawFootQL=new THREE.Quaternion(),rawFootQR=new THREE.Quaternion(),flatQL=new THREE.Quaternion(),flatQR=new THREE.Quaternion();
const forward=new THREE.Vector3(),lateral=new THREE.Vector3(),turnQuaternion=new THREE.Quaternion(),uprightAxis=new THREE.Vector3(0,1,0);
const handTargetL=new THREE.Vector3(),handTargetR=new THREE.Vector3(),scratchPosition=new THREE.Vector3();
const damp=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
const ease=value=>{value=Math.max(0,Math.min(1,value));return value*value*(3-2*value)};
function rotateBoneWorld(bone,angle){
  if(!bone)return;
  bone.getWorldQuaternion(worldOrientation);aimDelta.setFromAxisAngle(forwardAxis,angle);
  worldOrientation.premultiply(aimDelta);setWorldOrientation(bone,worldOrientation);
}
function plantFoot(actor,side,rawPosition,rawQuaternion,state,floorY){
  const motion=actor.motion,reference=actor.footReference[side];
  const sign=side==='L'?-1:1;
  const stride=1-motion.crouch*.4;
  // The source gait supplies swing/stance, while idle and crouch settle onto the floor.
  const lift=Math.max(0,rawPosition.y-floorY-reference.height)*motion.move*(1-motion.crouch*.35);
  poseTarget.set(state.x, floorY+reference.height+lift,0);
  scratchPosition.set(state.x, floorY+reference.height,0).addScaledVector(lateral,reference.position.x).addScaledVector(forward,sign*4);
  poseTarget.x=THREE.MathUtils.lerp(scratchPosition.x,state.x+(rawPosition.x-state.x)*stride,motion.move);
  poseTarget.z=THREE.MathUtils.lerp(scratchPosition.z,rawPosition.z,motion.move);
  posePole.copy(forward).addScaledVector(lateral,sign*.05);
  solveTwoBone(actor.bones['thigh'+side],actor.bones['calf'+side],actor.bones['foot'+side],poseTarget,posePole,reference.lengths);
  const flat=side==='L'?flatQL:flatQR;
  flat.copy(turnQuaternion).multiply(reference.quaternion);
  const planted=lift<2?1:Math.max(1-motion.move,motion.crouch*.45);
  rawQuaternion.slerp(flat,planted);
  if(actor.bones['foot'+side])setWorldOrientation(actor.bones['foot'+side],rawQuaternion);
}
function updateActor(actor,state) {
  const delta=frame.dt===null?Math.min(.06,Math.max(0,(state.time??0)-(actor.lastTime??state.time??0))):frame.dt;
  const reset=actor.lastTime!==null&&(state.time??0)<actor.lastTime-.3;
  actor.lastTime=state.time??0;
  const moving=!!state.moving&&!state.dead;
  const firing=!state.isEnemy&&!state.dead&&(state.shootTimer||0)>.10;
  const melee=!state.isEnemy&&!state.dead&&(state.attackTimer||0)>0&&(state.shootTimer||0)<=0;
  const m=actor.motion;
  if(!actor.initialized||reset){
    Object.assign(m,{move:moving?1:0,crouch:state.crouch?1:0,aim:0,melee:0,death:state.dead?1:0});
    actor.groundCorrection=null;actor.initialized=true;actor.phase=0;
  }
  m.move=damp(m.move,moving?1:0,12,delta);m.crouch=damp(m.crouch,state.crouch&&!state.dead?1:0,14,delta);
  if(firing&&(state.shootTimer||0)>actor.lastShot+.04){actor.recoil=1;m.aim=Math.max(m.aim,.78);}
  actor.lastShot=state.shootTimer||0;
  m.aim=damp(m.aim,firing?1:0,firing?24:11,delta);m.melee=damp(m.melee,melee?1:0,22,delta);
  actor.recoil=damp(actor.recoil,0,22,delta);
  if(state.dead)m.death=Math.min(1,m.death+delta/.32);else{m.death=0;actor.groundCorrection=null;}
  for(const pose of actor.poseCache){pose.node.quaternion.copy(pose.quaternion);pose.node.position.copy(pose.position);}
  if(actor.walkAction){
    const speed=state.speed??(state.isEnemy?(state.alert?85:28):state.run?300:state.crouch?88:178);
    actor.walkAction.paused=m.move<.002||!!state.dead;
    actor.walkAction.timeScale=Math.max(.08,speed/178)/(1-m.crouch*.4)*m.move;
    actor.mixer.update(delta);
  }
  for(const pose of actor.poseCache){
    pose.quaternion.copy(pose.node.quaternion);pose.position.copy(pose.node.position);
    pose.node.quaternion.slerp(pose.idleQuaternion,1-m.move);pose.node.position.lerp(pose.idlePosition,1-m.move);
  }
  actor.clip=state.dead?'Falling / rest':melee?'Knife strike':firing?'Two-hand aim':m.move>.1?(state.isEnemy?'Shamble':state.run?'Run cadence':'Walk_Brisk'):'Idle / breathing';
  actor.root.position.set(state.x,frame.height-state.y,0);actor.root.rotation.set(0,0,0);actor.root.scale.set(1,1,1);
  const target=(state.face||1)>0?Math.PI*.5:-Math.PI*.5;
  if(actor.phase===0)actor.facing.rotation.y=target;
  else{let angle=target-actor.facing.rotation.y;while(angle>Math.PI)angle-=Math.PI*2;while(angle<-Math.PI)angle+=Math.PI*2;actor.facing.rotation.y+=angle*(1-Math.exp(-17*delta));}
  actor.phase++;turnQuaternion.setFromAxisAngle(uprightAxis,actor.facing.rotation.y);
  forward.set(Math.sin(actor.facing.rotation.y),0,Math.cos(actor.facing.rotation.y));
  lateral.set(Math.cos(actor.facing.rotation.y),0,-Math.sin(actor.facing.rotation.y));
  actor.visible=true;actor.root.visible=true;actor.root.updateMatrixWorld(true);
  actor.bones.footL?.getWorldPosition(rawFootL);actor.bones.footR?.getWorldPosition(rawFootR);
  actor.bones.footL?.getWorldQuaternion(rawFootQL);actor.bones.footR?.getWorldQuaternion(rawFootQR);
  const floorY=frame.height-state.y,hips=actor.bones.hips;
  if(!state.dead){
    if(hips){hips.getWorldPosition(poseTarget);poseTarget.y+=5*(1-m.move)*(1-m.crouch)-30*m.crouch;hips.position.copy(hips.parent.worldToLocal(poseTarget));actor.root.updateMatrixWorld(true);}
    rotateBoneWorld(actor.bones.chest,-(state.face||1)*(m.crouch*.12+(state.run?.09:0)*m.move+(state.isEnemy?.14:0)));
    if(state.isEnemy)rotateBoneWorld(actor.bones.head,-(state.face||1)*(.07+Math.sin((state.time||0)*1.9)*.025));
    poseBone(actor,'chest',Math.sin((state.time||0)*1.8)*.006*(1-m.move));
    actor.root.updateMatrixWorld(true);
    plantFoot(actor,'L',rawFootL,rawFootQL,state,floorY);plantFoot(actor,'R',rawFootR,rawFootQR,state,floorY);
    actor.bones.handL?.getWorldPosition(rawHandL);actor.bones.handR?.getWorldPosition(rawHandR);
    const restY=67-24*m.crouch;
    handTargetR.set(state.x+(state.face||1)*9,floorY+restY,rawHandR.z);
    handTargetL.set(state.x-(state.face||1)*5,floorY+restY+2,rawHandL.z);
    handTargetR.lerp(rawHandR,m.move*.8*(1-m.crouch));handTargetL.lerp(rawHandL,m.move*.8*(1-m.crouch));
    if(state.isEnemy){
      handTargetR.x+=forward.x*15;handTargetL.x+=forward.x*10;
      handTargetR.y+=5;handTargetL.y+=9;
    }else{
      poseTarget.set(state.x+(state.face||1)*(43-actor.recoil*3),floorY+105-29*m.crouch+actor.recoil*1.5,6);
      handTargetR.lerp(poseTarget,m.aim);
      poseTarget.set(state.x+(state.face||1)*(34-actor.recoil*2),floorY+101-29*m.crouch,9);
      handTargetL.lerp(poseTarget,m.aim);
      if(melee||m.melee>.01){
        const phase=1-Math.min(1,(state.attackTimer||0)/.52);
        const strike=ease((phase-.18)/.42),recover=ease((phase-.67)/.33);
        const reach=THREE.MathUtils.lerp(15,50,strike)*(1-recover)+9*recover;
        const height=THREE.MathUtils.lerp(133,92,strike)*(1-recover)+restY*recover;
        poseTarget.set(state.x+(state.face||1)*reach,floorY+height-29*m.crouch,5);handTargetR.lerp(poseTarget,m.melee);
        poseTarget.set(state.x+(state.face||1)*14,floorY+112-29*m.crouch,8);handTargetL.lerp(poseTarget,m.melee);
      }
    }
    posePole.set(0,-1,.2);
    solveTwoBone(actor.bones.upperR,actor.bones.lowerR,actor.bones.handR,handTargetR,posePole);
    solveTwoBone(actor.bones.upperL,actor.bones.lowerL,actor.bones.handL,handTargetL,posePole);
  }else{
    const fall=ease(m.death),direction=-(state.face||1);
    actor.root.position.x=state.x-direction*58*fall;actor.root.position.y=floorY+12*fall;
    actor.root.rotation.z=-direction*Math.PI*.5*fall;actor.root.scale.y=1;actor.root.updateMatrixWorld(true);
    if(fall>.94){
      let minY=Infinity;for(const name of ['head','chest','hips']){const bone=actor.bones[name];if(bone){bone.getWorldPosition(poseTarget);minY=Math.min(minY,poseTarget.y);}}
      if(Number.isFinite(minY))actor.root.position.y+=floorY-minY+10;
      actor.root.updateMatrixWorld(true);posePole.set(0,1,.1);
      poseTarget.set(state.x-direction*52,floorY+actor.footReference.L.height,0);solveTwoBone(actor.bones.thighL,actor.bones.calfL,actor.bones.footL,poseTarget,posePole,actor.footReference.L.lengths);
      poseTarget.set(state.x-direction*48,floorY+actor.footReference.R.height,4);solveTwoBone(actor.bones.thighR,actor.bones.calfR,actor.bones.footR,poseTarget,posePole,actor.footReference.R.lengths);
      flatQL.copy(turnQuaternion).multiply(actor.footReference.L.quaternion);flatQR.copy(turnQuaternion).multiply(actor.footReference.R.quaternion);
      if(actor.bones.footL)setWorldOrientation(actor.bones.footL,flatQL);if(actor.bones.footR)setWorldOrientation(actor.bones.footR,flatQR);
      poseTarget.set(state.x+direction*32,floorY+15,4);solveTwoBone(actor.bones.upperL,actor.bones.lowerL,actor.bones.handL,poseTarget,posePole);
      poseTarget.set(state.x+direction*14,floorY+15,5);solveTwoBone(actor.bones.upperR,actor.bones.lowerR,actor.bones.handR,poseTarget,posePole);
      actor.root.updateMatrixWorld(true);
      if(actor.groundCorrection===null){box.makeEmpty();actor.model.traverse(node=>{if(node.isSkinnedMesh&&node.visible){node.computeBoundingBox();skinBounds.copy(node.boundingBox).applyMatrix4(node.matrixWorld);box.union(skinBounds);}});actor.groundCorrection=Math.max(0,floorY-box.min.y+.35);}
      actor.root.position.y+=actor.groundCorrection;actor.root.updateMatrixWorld(true);
    }
  }
  actor.weapon.visible=!state.isEnemy&&!state.dead;
  if(actor.weapon.visible){
    actor.weapon.userData.pistol.visible=m.melee<.1;actor.weapon.userData.knife.visible=m.melee>=.1;
    if(m.melee>=.1){const phase=1-Math.min(1,(state.attackTimer||0)/.52);worldDirection.set((state.face||1)*(.2+ease(phase/.6)),.8-phase*1.6,0).normalize();}
    else worldDirection.set((state.face||1)*(.3+.7*m.aim),-.95*(1-m.aim)+actor.recoil*.12,0).normalize();
    worldOrientation.setFromUnitVectors(forwardAxis,worldDirection);
    actor.weapon.parent.getWorldPosition(poseTarget);poseTarget.addScaledVector(worldDirection,6);
    actor.weapon.position.copy(actor.weapon.parent.worldToLocal(poseTarget));setWorldOrientation(actor.weapon,worldOrientation);
    actor.weapon.userData.muzzle.getWorldPosition(actor.muzzle);
  }
  // Gear follows the FINAL pose, including crouch, aiming and turn interpolation.
  actor.backpack.visible=!state.isEnemy&&!state.dead;
  if(actor.backpack.visible&&actor.bones.chest){
    actor.bones.chest.getWorldPosition(poseTarget);poseTarget.addScaledVector(forward,-13);poseTarget.y-=5;
    actor.backpack.position.copy(actor.root.worldToLocal(poseTarget));actor.backpack.rotation.y=actor.facing.rotation.y;
    actor.backpack.rotation.z=-(state.face||1)*m.crouch*.12;
  }
  actor.root.updateMatrixWorld(true);
}
function snapshotStats(){return {...stats};}
function inspect(){
  const matrixBone=bone=>bone?bone.quaternion.toArray().map(n=>Math.round(n*1e6)/1e6):[];
  const position=node=>{if(!node)return [];node.getWorldPosition(scratchPosition);return scratchPosition.toArray().map(n=>Math.round(n*1000)/1000)};
  return {ready,mode:ready?'webgl3d':'sprite-fallback',pooledActorCount:pool.length,stats:snapshotStats(),actors:[...actors.values()].map(a=>({
    id:a.id,visible:a.visible,clip:a.clip,clipTime:a.walkAction?.time??0,facingYaw:a.facing.rotation.y,motion:{...a.motion},
    gearMode:a.weapon.visible?(a.weapon.userData.knife.visible?'knife':'pistol'):'none',
    world:{root:position(a.root),chest:position(a.bones.chest),hips:position(a.bones.hips),backpack:position(a.backpack),leftHand:position(a.bones.handL),rightHand:position(a.bones.handR),leftFoot:position(a.bones.footL),rightFoot:position(a.bones.footR)},
    weaponTip:a.muzzle.toArray(),bones:{Hips:matrixBone(a.bones.hips),RightUpLeg:matrixBone(a.bones.thighR),LeftArm:matrixBone(a.bones.upperL)}
  }))};
}
function muzzlePosition(id='player'){
  const actor=actors.get(id);if(!ready||!actor||!actor.weapon.visible)return null;
  return {x:actor.muzzle.x,y:(frame?.height||720)-actor.muzzle.y};
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
        for(let i=0;i<MAX_ACTORS;i++){const actor=createActor();configureActor(actor,{isEnemy:i>0,type:i%2});}
        onProgress?.(.85);
        // Compile and upload the first rig during Loading, not on first gameplay input.
        pool[0].root.visible=true;pool[1].root.visible=true;pool[0].backpack.visible=true;pool[0].weapon.visible=true;pool[0].weapon.userData.knife.visible=true;await renderer.compileAsync(scene,camera);
        if(token!==revision||disposed)return false;
        renderer.render(scene,camera);for(const actor of pool){actor.root.visible=false;actor.backpack.visible=false;actor.weapon.visible=false;}pool[0].weapon.userData.knife.visible=false;
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
window.Ember3DCharacters=Object.freeze({load,beginFrame,submit,flush,fallback,dispose,inspect,muzzlePosition,
  get ready(){return ready;},get stats(){return snapshotStats();}});
