import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export interface GameAssets {
  atv: THREE.Group;
  rider: THREE.Group;
  sniper: THREE.Group;
  rocket: THREE.Group;
}

export async function loadAssets(): Promise<GameAssets> {
  const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
  const names=['atv','rider','sniper','rocket-launcher'];
  const loaded=await Promise.all(names.map(name=>loader.loadAsync(`/models/${name}.glb`)));
  const roots=loaded.map(gltf=>gltf.scene);
  for(const root of roots)root.traverse(obj=>{
    if(obj instanceof THREE.Mesh){
      obj.castShadow=true;obj.receiveShadow=true;obj.frustumCulled=false;
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const m of materials)if(m instanceof THREE.MeshStandardMaterial){
        m.envMapIntensity=.6;
        if(m.map)m.map.anisotropy=4;
      }
    }
  });
  return {atv:roots[0],rider:roots[1],sniper:roots[2],rocket:roots[3]};
}

export function cloneCharacter(source:THREE.Group){return clone(source) as THREE.Group;}

export function bones(root:THREE.Object3D){
  const result=new Map<string,THREE.Bone>();
  root.traverse(o=>{if(o instanceof THREE.Bone)result.set(o.name.toLowerCase().replace(/[^a-z0-9]/g,''),o);});
  return result;
}

export function findBone(root:THREE.Object3D,name:string){
  const target=name.toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const [key,bone]of bones(root))if(key.endsWith(target))return bone;
  return undefined;
}

// Rotate a bone using a desired direction in world space. This avoids assuming
// the generated rig uses a particular local bone roll or rest quaternion.
export function pointBone(root:THREE.Object3D,name:string,childName:string,direction:THREE.Vector3){
  root.updateMatrixWorld(true);
  const bone=findBone(root,name),child=findBone(root,childName);
  if(!bone||!child)return;
  const origin=bone.getWorldPosition(new THREE.Vector3());
  const current=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const turn=new THREE.Quaternion().setFromUnitVectors(current,direction.normalize());
  const world=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn);
  const parent=bone.parent?.getWorldQuaternion(new THREE.Quaternion())??new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(world));
  root.updateMatrixWorld(true);
}

// Two-bone IK keeps generated hands on controls and feet on the footrests.
export function reach(root:THREE.Object3D,upper:string,lower:string,end:string,target:THREE.Vector3,pole:THREE.Vector3){
  root.updateMatrixWorld(true);
  const a=findBone(root,upper),b=findBone(root,lower),c=findBone(root,end);
  if(!a||!b||!c)return;
  const origin=a.getWorldPosition(new THREE.Vector3()),joint=b.getWorldPosition(new THREE.Vector3()),tip=c.getWorldPosition(new THREE.Vector3());
  const l1=origin.distanceTo(joint),l2=joint.distanceTo(tip),axis=target.clone().sub(origin);
  const distance=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);axis.normalize();
  const bend=pole.clone().sub(origin);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
  const elbow=origin.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
  pointBone(root,upper,lower,elbow.sub(origin));
  pointBone(root,lower,end,target.clone().sub(b.getWorldPosition(new THREE.Vector3())));
}

export function poseCharacter(root:THREE.Object3D,pose:'seated'|'standing'|'aiming'){
  root.updateMatrixWorld(true);
  if(pose==='seated'){
    pointBone(root,'Spine02','Spine01',new THREE.Vector3(0,1,.18));
    for(const side of ['Left','Right']){
      const sign=side==='Left'?1:-1;
      pointBone(root,side+'UpLeg',side+'Leg',new THREE.Vector3(sign*.35,-.3,1));
      pointBone(root,side+'Leg',side+'Foot',new THREE.Vector3(0,-1,-.22));
      pointBone(root,side+'Foot',side+'ToeBase',new THREE.Vector3(0,0,1));
      pointBone(root,side+'Arm',side+'ForeArm',new THREE.Vector3(sign*.12,-.55,.65));
      pointBone(root,side+'ForeArm',side+'Hand',new THREE.Vector3(-sign*.1,-.06,1));
    }
  }else{
    for(const side of ['Left','Right']){
      const sign=side==='Left'?1:-1;
      if(pose==='aiming'){
        pointBone(root,side+'Arm',side+'ForeArm',new THREE.Vector3(sign*.15,-.65,.6));
        pointBone(root,side+'ForeArm',side+'Hand',new THREE.Vector3(-sign*.12,.15,1));
      }else{
        pointBone(root,side+'Arm',side+'ForeArm',new THREE.Vector3(sign*.1,-1,.03));
        pointBone(root,side+'ForeArm',side+'Hand',new THREE.Vector3(0,-1,.05));
      }
    }
  }
  root.updateMatrixWorld(true);
}

export function normalize(root:THREE.Object3D,dimension:'height'|'length',target:number){
  root.updateMatrixWorld(true);
  let box=new THREE.Box3().setFromObject(root);
  const size=box.getSize(new THREE.Vector3());
  const scale=target/(dimension==='height'?size.y:Math.max(size.x,size.z));
  root.scale.multiplyScalar(scale);root.updateMatrixWorld(true);
  box=new THREE.Box3().setFromObject(root);
  const center=box.getCenter(new THREE.Vector3());
  root.position.x-=center.x;root.position.z-=center.z;root.position.y-=box.min.y;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

export function createCharacter(source:THREE.Group,pose:'standing'|'seated'|'aiming',height=2.35){
  const character=cloneCharacter(source);normalize(character,'height',height);poseCharacter(character,pose);
  return character;
}

export function createVehicle(assets:GameAssets){
  const group=new THREE.Group(),body=new THREE.Group();group.name='PlayerATV';group.add(body);body.add(assets.atv);
  const wheels:THREE.Group[]=[];
  for(const axle of ['Front','Rear'])for(const side of ['Left','Right']){
    const model=assets.atv.getObjectByName(`Wheel_${axle}_${side}`);
    if(!model)throw new Error(`ATV wheel missing: ${axle} ${side}`);
    assets.atv.updateMatrixWorld(true);
    const steering=new THREE.Group(),spin=new THREE.Group();steering.name=`Steering_${axle}_${side}`;
    model.getWorldPosition(steering.position);group.add(steering);steering.add(spin);spin.add(model);model.position.set(0,0,0);
    wheels.push(steering);
  }
  const rider=createCharacter(assets.rider,'seated');rider.name='SeatedRider';
  const hip=findBone(rider,'Hips')!;rider.updateMatrixWorld(true);
  rider.position.add(new THREE.Vector3(0,.47,-.16).sub(hip.getWorldPosition(new THREE.Vector3())));rider.updateMatrixWorld(true);
  for(const side of ['Left','Right']){
    const sign=side==='Left'?1:-1;
    reach(rider,side+'UpLeg',side+'Leg',side+'Foot',new THREE.Vector3(sign*.44,-.36,-.02),new THREE.Vector3(sign*.65,.2,.7));
    pointBone(rider,side+'Foot',side+'ToeBase',new THREE.Vector3(0,0,1));
    reach(rider,side+'Arm',side+'ForeArm',side+'Hand',new THREE.Vector3(sign*.36,.78,.30),new THREE.Vector3(sign*.72,.9,-.1));
  }
  body.add(rider);return {group,body,wheels,rider};
}

export function createMarksman(assets:GameAssets){
  const group=new THREE.Group();group.name='Marksman';
  const character=createCharacter(assets.rider,'aiming');group.add(character);
  reach(character,'RightArm','RightForeArm','RightHand',new THREE.Vector3(-.23,1.52,.12),new THREE.Vector3(-.65,1.20,-.1));
  reach(character,'LeftArm','LeftForeArm','LeftHand',new THREE.Vector3(-.23,1.58,.45),new THREE.Vector3(.42,1.25,.35));
  const sniper=assets.sniper,rocket=assets.rocket;sniper.name='CustomSniper';rocket.name='CustomRocketLauncher';
  for(const [weapon,length]of [[sniper,1.65],[rocket,1.12]] as const){
    weapon.rotation.y=Math.PI/2;normalize(weapon,'length',length);weapon.position.add(new THREE.Vector3(-.23,1.37,.38));group.add(weapon);
  }
  return {group,sniper,rocket};
}

// Keep the approved rider's textured arm geometry and its original skin/rig.
export function createFirstPersonArms(source:THREE.Group){
  const arms=createCharacter(source,'aiming',2.1);arms.name='FirstPersonRiderArms';
  arms.traverse(object=>{
    if(!(object instanceof THREE.SkinnedMesh))return;
    const geometry=object.geometry.clone(),joints=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
    const armBones=new Set(object.skeleton.bones.map((b,i)=>/leftarm|rightarm|leftforearm|rightforearm|lefthand|righthand/i.test(b.name.replace(/[^a-z0-9]/gi,''))?i:-1));
    const keep=(vertex:number)=>{let sum=0;for(let k=0;k<4;k++)if(armBones.has(joints.getComponent(vertex,k)))sum+=weights.getComponent(vertex,k);return sum>.65;};
    const index=geometry.getIndex(),count=index?.count??geometry.getAttribute('position').count,retained:number[]=[];
    for(let i=0;i<count;i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;if(keep(a)&&keep(b)&&keep(c))retained.push(a,b,c);}
    geometry.setIndex(retained);object.geometry=geometry;object.castShadow=false;object.frustumCulled=false;
  });
  arms.rotation.y=Math.PI;arms.position.add(new THREE.Vector3(0,-2.1,-.45));return arms;
}
export function poseFirstPersonArms(arms:THREE.Group,rocket:boolean,reload:number,weaponFrame:THREE.Object3D){
  if(!arms.parent)return;const toWorld=(x:number,y:number,z:number)=>weaponFrame.localToWorld(new THREE.Vector3(x,y,z));const elbow=(x:number,y:number,z:number)=>arms.parent!.localToWorld(new THREE.Vector3(x,y,z));
  reach(arms,'RightArm','RightForeArm','RightHand',toWorld(.43,-.35,-.51),elbow(.6,-.9,-.3));
  const hand=new THREE.Vector3(.36,-.28,rocket?-.66:-.85),magazine=new THREE.Vector3(.29,-.47-Math.sin(Math.min(1,reload*1.7)*Math.PI)*.22,-.66);
  if(reload>0)hand.lerp(magazine,Math.sin(reload*Math.PI));
  reach(arms,'LeftArm','LeftForeArm','LeftHand',toWorld(hand.x,hand.y,hand.z),elbow(-.5,-.9,-.4));
}
