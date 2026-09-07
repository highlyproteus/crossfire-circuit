import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { center, coverPositions, frame, isGap, SEGMENTS, TAU, trackGeometry, width, checkpoints, jumps, obstacles, COURSE_LENGTH, routes, routeGeometry, boosts, towerCover, barrelTower, barrelSpots } from './course';
import type { Simulation } from './simulation';
import type { WorldState } from './network-types';
import { createCharacter, createVehicle, createMarksman, createFirstPersonArms, poseFirstPersonArms, findBone, normalize, type GameAssets } from './assets';

const mat = (color: number, roughness=.65, metalness=.15) => new THREE.MeshStandardMaterial({color,roughness,metalness});
const paint=mat(0xe4e2d6), dark=mat(0x273640,.65,.6), orange=mat(0xf18b32);
const fuelPaint=mat(0xc13b24),steelPaint=mat(0x287eb5);
const barrelGeometry=new THREE.CylinderGeometry(.68,.68,1.6,12),barrelBandGeometry=new THREE.CylinderGeometry(.72,.72,.13,12);
const cyan=new THREE.MeshStandardMaterial({color:0x70f5ff,emissive:0x23cdda,emissiveIntensity:2.4});
const red=new THREE.MeshStandardMaterial({color:0xff664b,emissive:0xfa3418,emissiveIntensity:2.5});
const gray=mat(0x8c9ca4), whiteLine=new THREE.MeshBasicMaterial({color:0xfcf3db});
const v = (p: {x:number;y:number;z:number}) => new THREE.Vector3(p.x,p.y,p.z);
function mesh(geometry:THREE.BufferGeometry, material:THREE.Material, parent:THREE.Object3D, x=0,y=0,z=0){
  const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function box(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material){return mesh(new THREE.BoxGeometry(w,h,d),material,parent,x,y,z);}
function cylinder(parent:THREE.Object3D,r:number,h:number,x:number,y:number,z:number,material:THREE.Material,segments=12){return mesh(new THREE.CylinderGeometry(r,r,h,segments),material,parent,x,y,z);}
function label(text:string,color='#dfffff',width=512){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=128;
  const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,width,128);ctx.font='700 64px Arial';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,width/2,82);
  const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(width/45,128/45,1);return sprite;
}
function mergeStatic(group:THREE.Group){
  group.updateMatrixWorld(true);const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  group.traverse(o=>{if(o instanceof THREE.Mesh && !Array.isArray(o.material)){const list=batches.get(o.material)||[];list.push(o.geometry.clone().applyMatrix4(o.matrixWorld));batches.set(o.material,list);}});
  const result=new THREE.Group();
  for(const [material,geometries] of batches){const merged=mergeGeometries(geometries);if(merged){const m=mesh(merged,material,result);m.castShadow=true;}geometries.forEach(g=>g.dispose());}
  group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return result;
}
export class View {
  networkState?:WorldState;
  localSession='';
  private networkVehicles=new Map<string,{vehicle:ReturnType<typeof createVehicle>;badge:THREE.Sprite}>();
  renderer:THREE.WebGLRenderer;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(62,1,.1,1200);
  botVehicles:ReturnType<typeof createVehicle>[]=[];
  botLabels:THREE.Sprite[]=[];
  fpsRig=new THREE.Group();
  fpsArms:THREE.Group;
  fpsSniper:THREE.Group;fpsRocket:THREE.Group;
  thirdPerson=false;private barrelMeshes:THREE.Group[]=[];private legPoses:{bone:THREE.Bone;base:THREE.Quaternion;sign:number}[]=[];private magazine=new THREE.Group();
  markYaw=-1.05;markPitch=-.08;zoomed=false;recoil=0;
  vehicle:ReturnType<typeof createVehicle>;
  standing:THREE.Group;
  gates:THREE.Group[]=[];
  enemy:THREE.Group;
  weapons:ReturnType<typeof createMarksman>;
  aimLine:THREE.Line;
  aimMarker:THREE.Mesh;
  private rockets=new Map<number,THREE.Group>();
  private fx=new Map<number,THREE.Object3D>();
  private cameraReady=false;
  private lastPhase='menu';
  private wheelSpin=0;
  private clock=0;
  orbit=0;
  pitch=0;
  fps=60;
  private particleGeo=new THREE.SphereGeometry(1,10,8);
  constructor(canvas:HTMLCanvasElement,private assets:GameAssets){
    const template=assets.atv.clone(true);this.assets={...assets,atv:template};
    this.fpsSniper=assets.sniper.clone(true);this.fpsRocket=assets.rocket.clone(true);
    for(const [weapon,length] of [[this.fpsSniper,1.3],[this.fpsRocket,.9]] as const){weapon.rotation.y=-Math.PI/2;normalize(weapon,'length',length);weapon.position.add(new THREE.Vector3(.32,-.37,-.7));this.fpsRig.add(weapon);}
    this.fpsArms=createFirstPersonArms(assets.rider);this.camera.add(this.fpsArms);
    box(this.magazine,.11,.27,.16,.29,-.47,-.66,dark);this.fpsRig.add(this.magazine);
    this.camera.add(this.fpsRig);this.scene.add(this.camera);
    for(let i=0;i<3;i++){const vehicle=createVehicle({...assets,atv:template.clone(true)});this.botVehicles.push(vehicle);this.scene.add(vehicle.group);const badge=label('RIDER 0'+(i+1),'#ffd89a',512);badge.scale.multiplyScalar(.28);this.botLabels.push(badge);this.scene.add(badge);}
    this.vehicle=createVehicle(assets);this.standing=createCharacter(assets.rider,'standing');
    this.weapons=createMarksman(assets);this.enemy=this.weapons.group;
    for(const [name,sign]of [['LeftUpLeg',1],['RightUpLeg',-1]] as const){const bone=findBone(this.enemy,name);if(bone)this.legPoses.push({bone,base:bone.quaternion.clone(),sign});}
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.15:1.7));
    this.renderer.shadowMap.enabled=!matchMedia('(pointer:coarse)').matches;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.scene.background=new THREE.Color(0x091726);this.scene.fog=new THREE.FogExp2(0x0b2032,.0017);
    this.scene.add(new THREE.HemisphereLight(0xb6e1ff,0x17394f,2.5));
    const sun=new THREE.DirectionalLight(0xffedcd,3.3);sun.position.set(150,350,-180);sun.castShadow=true;
    Object.assign(sun.shadow.camera,{left:-450,right:450,top:450,bottom:-450,near:1,far:950});sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0003;sun.shadow.normalBias=.09;this.scene.add(sun);
    this.buildCourse();this.buildBackdrop();
    this.scene.add(this.vehicle.group,this.standing);
    this.enemy.position.set(0,33.1,0);this.enemy.scale.setScalar(1.2);this.scene.add(this.enemy);
    const lineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
    this.aimLine=new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:0xff5e44,transparent:true,opacity:.55}));this.scene.add(this.aimLine);
    this.aimMarker=new THREE.Mesh(new THREE.RingGeometry(1.5,1.65,40),new THREE.MeshBasicMaterial({color:0xff7050,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));this.aimMarker.rotation.x=-Math.PI/2;this.scene.add(this.aimMarker);
    this.resize();
  }
  resize(){const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  private buildCourse(){
    const staticParts=new THREE.Group();
    const geo=trackGeometry(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(geo.vertices,3));g.setIndex(new THREE.BufferAttribute(geo.indices,1));g.computeVertexNormals();
    const road=mesh(g,paint,this.scene);road.receiveShadow=true;
    for(let i=0;i<SEGMENTS;i++){
      const t=i/SEGMENTS,tn=(i+1)/SEGMENTS,mid=(t+tn)/2;if(isGap(mid))continue;
      const a=frame(t),b=frame(tn),f=frame(mid),len=v(b.p).distanceTo(v(a.p));
      const slab=new THREE.Group();slab.position.copy(v(f.p));slab.rotation.order="YXZ";slab.rotation.y=f.yaw;
      const dy=b.p.y-a.p.y;slab.rotation.x=-Math.atan2(dy,len);
      box(slab,width(t),1.2,len+.10,0,-.92,0,dark);
      for(const s of [-1,1]){
        box(slab,.2,.035,len+.05,s*(width(t)/2-.2),.045,0,i%3===0?orange:gray);
        box(slab,.28,.4,len+.05,s*(width(t)/2-.12),-.28,0,orange);
      }
      if(i%2===0)box(slab,width(t)-.8,.025,.045,0,.052,-len/2,gray);
      if(i%5===0){
        box(slab,width(t)-.5,.45,.45,0,-1.8,0,dark);
        for(const s of [-1,1]){const brace=box(slab,.3,2.6,.32,s*(width(t)/2-1.2),-1.5,0,gray);brace.rotation.z=s*.5;}
      }
      if(i%12===0 && t<.99){
        for(const s of [-1,1]){
          box(slab,.15,.5,.4,s*(width(t)/2-.3),.28,0,dark);
          box(slab,.17,.07,.35,s*(width(t)/2-.3),.55,0,cyan);
        }
        // Track arrows point along local +Z.
        for(const s of [-1,1]){const arrow=box(slab,.16,.025,1.25,s*.44,.06,s===1?0:0,whiteLine);arrow.rotation.y=s*.7;}
      }
      if(jumps.some(j=>{const d=(j.lip-t)*COURSE_LENGTH;return d>0&&d<j.run+12;})&&i%2===0)box(slab,width(t)-1,.03,.24,0,.07,0,orange);
      staticParts.add(slab);
    }
    for(const t of coverPositions){
      const f=frame(t),wall=new THREE.Group();wall.position.set(f.p.x,f.p.y,f.p.z);wall.rotation.y=f.yaw;
      const x=-width(t)/2+.45;
      box(wall,1,5.6,12,x,2.8,0,dark);box(wall,1.05,3.8,10.8,x,3.1,0,paint);
      box(wall,1.09,.28,11,x,1.42,0,orange);box(wall,1.08,.18,12,x,5.65,0,gray);
      for(const z of [-5.5,5.5])box(wall,1.35,5.8,.4,x,2.9,z,orange);
      staticParts.add(wall);
    }
    const gatePositions=[0,...checkpoints.slice(0,-1)];
    for(let i=0;i<gatePositions.length;i++){
      const t=gatePositions[i],f=frame(t),gate=new THREE.Group();gate.position.copy(v(f.p));gate.rotation.y=f.yaw;
      for(const s of [-1,1]){
        box(gate,.8,6.5,1.1,s*6.2,3.25,0,dark);box(gate,.21,5.8,.12,s*5.75,3.45,-.64,cyan);
        box(gate,1.55,.5,2.6,s*6.2,.25,0,orange);
        const angled=box(gate,.6,2.7,1.15,s*5.65,6.1,0,paint);angled.rotation.z=s*.4;
      }
      box(gate,10.6,.65,1.12,0,7.1,0,paint);box(gate,10,.13,.14,0,6.68,-.64,cyan);
      for(let j=-5;j<=5;j++)box(gate,.8,.027,1.4,j,.07,0,j%2===0?paint:dark);
      const text=label(i===0?'CROSSFIRE':`CHECKPOINT 0${i}`);text.scale.multiplyScalar(.62);text.position.set(0,8.3,0);gate.add(text);
      gate.scale.x=width(t)/13.5;
      this.gates.push(gate);this.scene.add(gate);
    }
    for(const o of obstacles){const f=frame(o.t),g=new THREE.Group();g.position.copy(v(f.p));g.rotation.y=f.yaw;const x=o.side*(width(o.t)/2-o.w/2);
      box(g,o.w,o.height,o.depth,x,o.height/2,0,dark);box(g,o.w+.05,.32,o.depth+.05,x,o.height-.35,0,orange);
      for(const sign of [-1,1])box(g,o.w-.3,.8,.07,x,.7,sign*(o.depth/2+.02),paint);staticParts.add(g);
    }
    const bashFrame=frame(barrelTower.t-10/COURSE_LENGTH),bashSign=label('BARREL BASH','#98dfff',1024);bashSign.scale.multiplyScalar(.34);bashSign.position.copy(v(bashFrame.p));bashSign.position.y+=8;this.scene.add(bashSign);
    for(const j of jumps){const f=frame(j.lip-j.run/COURSE_LENGTH-12/COURSE_LENGTH),sign=label('FULL THROTTLE · 95+ KM/H','#ffd184',1024);sign.scale.multiplyScalar(.32);sign.position.copy(v(f.p));sign.position.y+=4;this.scene.add(sign);
      const landing=frame(j.lip+(j.gap+4)/COURSE_LENGTH);const pad=new THREE.Group();pad.position.copy(v(landing.p));pad.rotation.y=landing.yaw;for(let i=-3;i<=3;i++)box(pad,width(j.lip)-.6,.035,.14,0,.07,i*.8,cyan);staticParts.add(pad);
    }
    for(const t of checkpoints.slice(0,-1)){const f=frame(t+.013),sign=label('BRAKE / CONTROL YOUR SLIDE','#ffcb99',1024);sign.scale.multiplyScalar(.24);sign.position.copy(v(f.p));sign.position.y+=3.6;this.scene.add(sign);}
    for(const route of routes){
      const data=routeGeometry(route),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data.vertices,3));g.setIndex(new THREE.BufferAttribute(data.indices,1));g.computeVertexNormals();const road=mesh(g,mat(route.color,.72),staticParts);road.receiveShadow=true;
      const entry=route.points[8],sign=label(route.name,'#e5ffea',1024);sign.position.set(entry.x,entry.y+4,entry.z);sign.scale.multiplyScalar(.32);this.scene.add(sign);
      const edge=mat(route.color);for(let i=0;i<route.points.length-1;i++){const a=route.points[i],b=route.points[i+1],horizontal=Math.hypot(b.x-a.x,b.z-a.z),n=Math.hypot(horizontal,b.y-a.y),group=new THREE.Group();group.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);group.rotation.order='YXZ';group.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);group.rotation.x=-Math.atan2(b.y-a.y,horizontal);box(group,route.width,.6,n+.12,0,-.35,0,dark);for(const side of [-1,1])box(group,.14,.05,n+.1,side*(route.width/2-.1),.05,0,edge);staticParts.add(group);}
    }
    for(const boost of boosts){const f=frame(boost.t),group=new THREE.Group();group.position.copy(v(f.p));group.rotation.y=f.yaw;box(group,width(boost.t)-1,.05,boost.length,0,.05,0,mat(0x164c65));for(let z=-4;z<=4;z+=2)for(const side of [-1,1]){const m=box(group,.35,.04,2.7,side*.8,.11,z,cyan);m.rotation.y=side*.7;}staticParts.add(group);const sign=label('OVERDRIVE','#83f3ef');sign.position.copy(v(f.p)).add(new THREE.Vector3(0,3.5,0));sign.scale.multiplyScalar(.35);this.scene.add(sign);}
    cylinder(staticParts,34,1.2,0,32.65,0,dark,64);cylinder(staticParts,33.9,.12,0,33.3,0,paint,64);
    for(let i=0;i<48;i++){const a=i/48*TAU,group=new THREE.Group();group.position.set(Math.sin(a)*33.7,33.3,Math.cos(a)*33.7);group.rotation.y=a;box(group,4.3,.12,.18,0,.12,0,cyan);staticParts.add(group);}
    for(const c of towerCover){box(staticParts,c.w,1.5,c.d,c.x,34,c.z,dark);box(staticParts,c.w,.16,c.d+.05,c.x,34.77,c.z,orange);}
    cylinder(staticParts,12.8,40,0,12,0,dark,12);
    cylinder(staticParts,14.3,1.2,0,32.4,0,orange,12);cylinder(staticParts,13.8,.25,0,33.1,0,paint,12);
    cylinder(staticParts,10,.7,0,27,0,gray,12);
    for(let i=0;i<8;i++){const a=i/8*TAU;const p=new THREE.Group();p.position.set(Math.sin(a)*13,33.6,Math.cos(a)*13);p.rotation.y=a;box(p,5,1,1,0,0,0,dark);box(p,4.5,.18,1.1,0,.55,0,orange);staticParts.add(p);}
    cylinder(staticParts,.35,12,-6,42,-6,red,8);
    const beacon=label('MARKSMAN','#ff8267',512);beacon.position.set(0,50,0);beacon.scale.multiplyScalar(1.2);this.scene.add(beacon);
    this.scene.add(mergeStatic(staticParts));
  }
  private buildBackdrop(){
    const rng=()=>{this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;};
    const verts=[];for(let i=0;i<900;i++){const a=rng()*TAU,r=300+rng()*350,y=65+rng()*340;verts.push(Math.cos(a)*r,y,Math.sin(a)*r);}
    const stars=new THREE.BufferGeometry();stars.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));this.scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0xabc9da,size:.75,transparent:true,opacity:.75,fog:false})));
    const planet=mesh(new THREE.SphereGeometry(52,32,24),mat(0x415a71,.98),this.scene,-240,85,-260);planet.castShadow=false;
    const ring=mesh(new THREE.RingGeometry(72,73,90),new THREE.MeshBasicMaterial({color:0x617c8c,transparent:true,opacity:.35,side:THREE.DoubleSide}),this.scene,-240,85,-260);ring.rotation.x=1;ring.rotation.y=.35;
    const fragments=new THREE.Group();for(let i=0;i<28;i++){const a=rng()*TAU,r=130+rng()*100;const m=box(fragments,2+rng()*8,3+rng()*14,3+rng()*7,Math.cos(a)*r,-15-rng()*45,Math.sin(a)*r,dark);m.rotation.set(rng(),rng(),rng());}this.scene.add(mergeStatic(fragments));
  }
  private seed=773;
  aimDirection(){return this.camera.getWorldDirection(new THREE.Vector3());}
  private updateBot(sim:Simulation,index:number,dt:number){const vehicle=this.botVehicles[index],p=v(sim.position());vehicle.group.position.copy(p);vehicle.group.rotation.order='YXZ';vehicle.group.rotation.y=sim.yaw;vehicle.group.rotation.x=THREE.MathUtils.clamp(-Math.atan2(sim.body.linvel().y,Math.max(Math.abs(sim.speed),5)),-.4,.5);vehicle.group.visible=sim.phase!=='dead'||sim.deathTimer>.75;vehicle.rider.visible=true;vehicle.body.rotation.z=-sim.steering*Math.min(Math.abs(sim.speed)/23,1)*.23;
    for(let i=0;i<vehicle.wheels.length;i++){const w=vehicle.wheels[i];w.rotation.y=i<2?sim.steering:0;w.children[0].rotation.x+=sim.speed*dt/.5;}
    const badge=this.botLabels[index];badge.position.copy(p).add(new THREE.Vector3(0,2.5,0));badge.visible=vehicle.group.visible;
  }
  update(sim:Simulation,dt:number){
    this.clock+=dt;this.fps+=(1/Math.max(dt,.001)-this.fps)*.035;
    const p=v(sim.position());this.vehicle.group.position.copy(p);this.vehicle.group.rotation.order='YXZ';this.vehicle.group.rotation.y=sim.yaw;this.vehicle.group.rotation.x=THREE.MathUtils.lerp(this.vehicle.group.rotation.x,THREE.MathUtils.clamp(-Math.atan2(sim.body.linvel().y,Math.max(Math.abs(sim.speed),5)),-.4,.5),Math.min(1,dt*8));
    const marksman=sim.role==='marksman';
    this.botVehicles.forEach((b,i)=>{b.group.visible=marksman&&!this.networkState;this.botLabels[i].visible=marksman&&!this.networkState;if(marksman&&!this.networkState&&sim.bots[i])this.updateBot(sim.bots[i],i,dt);});
    const reloading=sim.reloadTime>0,ads=this.zoomed&&!reloading;
    this.fpsRig.visible=marksman&&!ads&&(!this.thirdPerson||reloading);this.fpsArms.visible=this.fpsRig.visible;this.fpsSniper.visible=sim.attackType==='sniper';this.fpsRocket.visible=sim.attackType==='rocket';
    this.recoil*=Math.exp(-dt*14);this.fpsRig.position.z=this.recoil;this.fpsRig.position.x=-Math.max(0,.8-this.camera.aspect)*.45;
    const reload=reloading?1-sim.reloadTime/sim.reloadDuration:0,tilt=Math.sin(reload*Math.PI);
    this.fpsRig.rotation.set(tilt*.28,-tilt*.18,-tilt*.55);this.fpsRig.position.y=tilt*.12+(marksman?Math.sin(this.clock*12)*Math.min(sim.markMoving/7,1)*.018:0);
    this.magazine.visible=reloading&&sim.reloadWeapon==='sniper';this.magazine.position.set(0,-Math.sin(Math.min(1,reload*1.7)*Math.PI)*.22,0);
    if(marksman)poseFirstPersonArms(this.fpsArms,sim.attackType==='rocket',reload,this.fpsRig);
    this.enemy.visible=!marksman||(this.thirdPerson&&!ads);
    if(marksman){const eye=sim.markEye();this.enemy.position.set(eye.x,eye.y-2.05,eye.z);this.enemy.scale.setScalar(1);this.enemy.rotation.y=this.markYaw+Math.PI;
      for(const pose of this.legPoses)pose.bone.quaternion.copy(pose.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.sin(this.clock*10)*.32*pose.sign*Math.min(sim.markMoving/5,1)));
    }else{this.enemy.position.set(0,33.3,0);this.enemy.scale.setScalar(1);for(const pose of this.legPoses)pose.bone.quaternion.copy(pose.base);}
    sim.barrels.forEach((barrel,i)=>{let g=this.barrelMeshes[i];if(!g){g=new THREE.Group();mesh(barrelGeometry,barrel.explosive?fuelPaint:steelPaint,g);for(const y of [-.58,.58])mesh(barrelBandGeometry,dark,g,0,y,0);if(!barrelSpots[i]?.stack){const badge=label(barrel.explosive?'⚠ FUEL':'STEEL',barrel.explosive?'#ffe49b':'#b9efff',256);badge.scale.set(1.1,.55,1);badge.position.y=1.2;g.add(badge);}this.barrelMeshes.push(g);this.scene.add(g);}g.visible=barrel.active;g.position.copy(v(barrel.body.translation()));g.quaternion.copy(barrel.body.rotation());});
    for(let i=sim.barrels.length;i<this.barrelMeshes.length;i++)this.barrelMeshes[i].visible=false;
    this.vehicle.rider.visible=sim.phase!=='staging';this.standing.visible=sim.phase==='staging'&&!marksman;
    this.standing.position.copy(p).add(new THREE.Vector3(-2.1,-.95,0).applyAxisAngle(new THREE.Vector3(0,1,0),sim.yaw));this.standing.rotation.y=sim.yaw;
    this.vehicle.body.rotation.z=THREE.MathUtils.lerp(this.vehicle.body.rotation.z,-sim.steering*Math.min(Math.abs(sim.speed)/23,1)*.18,.1);
    this.wheelSpin+=sim.speed*dt/.52;
    this.vehicle.wheels.forEach((w,i)=>{w.rotation.y=i<2?sim.steering:0;w.children[0].rotation.x=this.wheelSpin;});
    this.vehicle.group.visible=!marksman&&(sim.phase!=='dead'||sim.deathTimer>.75);
    if(marksman&&sim.phase!=='menu'){
      this.camera.near=ads?1:this.thirdPerson?.4:.1;
      this.camera.position.copy(v(sim.markEye()));if(this.thirdPerson&&!ads)this.camera.position.add(new THREE.Vector3(Math.sin(this.markYaw)*5.5,1,Math.cos(this.markYaw)*5.5));this.camera.rotation.set(this.markPitch,this.markYaw,0,'YXZ');this.camera.fov=ads?(sim.attackType==='sniper'?12:43):66;this.camera.updateProjectionMatrix();
    }else if(sim.phase==='menu'){
      this.camera.near=2;this.camera.fov=62;this.camera.updateProjectionMatrix();
      const a=.48+Math.sin(this.clock*.045)*.15;
      this.camera.position.set(Math.cos(a)*590,420,Math.sin(a)*590);this.camera.lookAt(0,20,0);this.cameraReady=false;
    } else {
      this.camera.near=.4;
      if(this.lastPhase==='menu'||sim.invulnerable>2.9)this.cameraReady=false;
      if(Math.abs(sim.speed)>2)this.orbit*=Math.exp(-dt*.85);
      const angle=sim.yaw+this.orbit,behind=new THREE.Vector3(-Math.sin(angle),0,-Math.cos(angle));
      const distance=10.5+Math.min(Math.abs(sim.speed)*.065,2);
      const target=p.clone().add(behind.multiplyScalar(distance));target.y+=6.4+this.pitch;
      if(!this.cameraReady){this.camera.position.copy(target);this.cameraReady=true;}else this.camera.position.lerp(target,1-Math.exp(-dt*6));
      const forward=new THREE.Vector3(Math.sin(sim.yaw),0,Math.cos(sim.yaw));
      this.camera.lookAt(p.clone().add(forward.multiplyScalar(8)).add(new THREE.Vector3(0,1.3,0)));
      this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,62+Math.min(Math.abs(sim.speed)*.22,6),dt*3);this.camera.updateProjectionMatrix();
    }
    for(const gate of this.gates){gate.visible=sim.phase==='menu'||gate.position.distanceTo(this.camera.position)>12;}
    this.lastPhase=sim.phase;
    if(!marksman)this.enemy.rotation.y=Math.atan2(p.x,p.z);
    this.weapons.sniper.visible=sim.attackType==='sniper';this.weapons.rocket.visible=sim.attackType==='rocket';
    this.aimLine.visible=sim.warning>0&&!sim.practice&&!marksman;
    this.aimMarker.visible=this.aimLine.visible;
    if(this.aimLine.visible){
      this.aimLine.geometry.setFromPoints([v(sim.source),v(sim.aim)]);
      (this.aimLine.material as THREE.LineBasicMaterial).opacity=.16+sim.warning*.6;
      this.aimMarker.position.copy(v(sim.aim));this.aimMarker.position.y=sim.aim.y+.09;
      this.aimMarker.scale.setScalar((sim.attackType==='rocket'?3:1)*(1+Math.sin(this.clock*15)*.05));
    }
    const liveRockets=new Set(sim.rockets.map(r=>r.id));
    for(const [id,obj]of this.rockets)if(!liveRockets.has(id)){this.scene.remove(obj);this.rockets.delete(id);}
    for(const rocket of sim.rockets){
      let obj=this.rockets.get(rocket.id);
      if(!obj){obj=new THREE.Group();const tube=mesh(new THREE.CylinderGeometry(.12,.22,1.1,8),orange,obj);tube.rotation.x=Math.PI/2;const flame=mesh(new THREE.ConeGeometry(.28,2.5,8),red,obj,0,0,-1.2);flame.rotation.x=-Math.PI/2;this.rockets.set(rocket.id,obj);this.scene.add(obj);}
      obj.position.copy(v(rocket.p));obj.lookAt(v(rocket.p).add(v(rocket.v)));
    }
    const liveFx=new Set(sim.effects.map(e=>e.id));
    for(const [id,obj]of this.fx)if(!liveFx.has(id)){this.scene.remove(obj);if(obj instanceof THREE.Mesh||obj instanceof THREE.Line){obj.geometry.dispose();if(!Array.isArray(obj.material))obj.material.dispose();}this.fx.delete(id);}
    for(const effect of sim.effects.filter(e=>e.type!=='reload'&&e.type!=='rocket')){
      let obj=this.fx.get(effect.id);
      if(!obj){
        if(effect.type==='shot')obj=new THREE.Line(new THREE.BufferGeometry().setFromPoints([v(effect.at),v(effect.to!)]),new THREE.LineBasicMaterial({color:0xffebbd,transparent:true}));
        else obj=new THREE.Mesh(this.particleGeo.clone(),new THREE.MeshBasicMaterial({color:effect.type==='checkpoint'||effect.type==='boost'?0x51ffff:0xff843d,wireframe:effect.type==='checkpoint',transparent:true,depthWrite:false}));
        if(effect.type!=='shot')obj.position.copy(v(effect.at));this.scene.add(obj);this.fx.set(effect.id,obj);
      }
      const progress=1-effect.life/effect.ttl;
      if(obj instanceof THREE.Mesh){obj.scale.setScalar(.5+progress*(effect.type==='blast'?11:5));(obj.material as THREE.MeshBasicMaterial).opacity=(1-progress)*.65;}
    }
    this.updateNetwork(dt);
    this.renderer.render(this.scene,this.camera);
  }
  private updateNetwork(dt:number){
    const state=this.networkState,live=new Set(state?.players.filter(p=>p.role==='driver'&&p.id!==this.localSession).map(p=>p.id)??[]);
    for(const [id,entry]of this.networkVehicles)if(!live.has(id)){this.scene.remove(entry.vehicle.group,entry.badge);entry.badge.material.map?.dispose();entry.badge.material.dispose();this.networkVehicles.delete(id);}
    if(!state)return;
    for(const p of state.players){if(!live.has(p.id))continue;let e=this.networkVehicles.get(p.id);if(!e){e={vehicle:createVehicle({...this.assets,atv:this.assets.atv.clone(true)}),badge:label(p.name,'#d8ffff',512)};e.badge.scale.multiplyScalar(.3);e.vehicle.group.position.copy(v(p.p));this.networkVehicles.set(p.id,e);this.scene.add(e.vehicle.group,e.badge);}
      const g=e.vehicle.group,a=g.position.distanceTo(v(p.p))>12?1:1-Math.exp(-dt*20);g.position.lerp(v(p.p),a);g.rotation.order='YXZ';g.rotation.y+=Math.atan2(Math.sin(p.yaw-g.rotation.y),Math.cos(p.yaw-g.rotation.y))*a;g.rotation.x=THREE.MathUtils.clamp(-Math.atan2(p.v.y,Math.max(Math.abs(p.speed),5)),-.4,.5);g.visible=!p.finished&&(p.phase!=='dead'||p.deathTimer>.75);e.vehicle.rider.visible=true;e.vehicle.body.rotation.z=-p.steering*Math.min(Math.abs(p.speed)/23,1)*.23;
      e.vehicle.wheels.forEach((w,i)=>{w.rotation.y=i<2?p.steering:0;w.children[0].rotation.x+=p.speed*dt/.5;});e.badge.position.copy(g.position).add(new THREE.Vector3(0,3,0));e.badge.visible=g.visible;
    }
    const mark=state.players.find(p=>p.id===state.marksman);
    if(!mark)this.enemy.visible=false;
    else if(mark.id!==this.localSession){this.enemy.visible=true;this.enemy.position.set(mark.p.x,mark.p.y-2.05,mark.p.z);this.enemy.rotation.y=mark.markYaw+Math.PI;this.weapons.sniper.visible=mark.attackType==='sniper';this.weapons.rocket.visible=mark.attackType==='rocket';}
  }

}
