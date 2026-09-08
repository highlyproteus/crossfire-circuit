import {before, test} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Simulation} from '../src/simulation';
import {barrelSpots,barrelTower,frame} from '../src/course';
const ZERO={throttle:0,steer:0,brake:false};
before(()=>RAPIER.init());
function shared(){
  const arena=new Simulation();arena.start(true);arena.externalStep=true;arena.body.setEnabled(false);
  const driver=new Simulation(false,arena.world);driver.start(true);driver.mount();driver.invulnerable=0;driver.barrels=arena.barrels;driver.networkTargets=[driver];
  return {arena,driver,step:()=>{driver.step(ZERO);arena.updateSharedBarrels(1/60);arena.world.step();}};
}
function isolate(arena:Simulation,keep:number[]=[]){for(const b of arena.barrels)if(!keep.includes(b.id)){b.active=false;b.body.setEnabled(false);}}
function place(s:Simulation,x:number,y:number,z:number,yaw=0,speed=0){s.body.setTranslation({x,y,z},true);s.yaw=yaw;s.body.setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)},true);s.body.setLinvel({x:Math.sin(yaw)*speed,y:0,z:Math.cos(yaw)*speed},true);}
test('body and helmet sniper shots each take exactly four hits, then reload',()=>{
 const {arena,driver}=shared();
 try{
  isolate(arena);const mark=new Simulation(false,arena.world);mark.start(true,'marksman');mark.networkTargets=[driver];const f=frame(.015);
  mark.markBody!.setTranslation({x:f.p.x,y:26,z:f.p.z-15},true);
  for(const rise of [.3,1.3]){
   driver.phase='racing';driver.health=100;driver.invulnerable=0;place(driver,f.p.x,24.97,f.p.z);mark.markBody!.setTranslation({x:f.p.x,y:26,z:f.p.z-15},true);mark.markBody!.setNextKinematicTranslation({x:f.p.x,y:26,z:f.p.z-15});mark.ammo.sniper=4;mark.reloadTime=0;arena.world.step();
   for(let shot=1;shot<=4;shot++){
    const p=driver.position(),source=mark.markEye();mark.cooldown=0;
    assert.ok(mark.fireMarksman({x:p.x-source.x,y:p.y+rise-source.y,z:p.z-source.z}));
    assert.equal(driver.health,100-shot*25,`aim height ${rise}, shot ${shot}`);
    assert.equal(driver.phase,shot===4?'dead':'racing');
   }
   assert.equal(mark.ammo.sniper,0);mark.cooldown=0;assert.equal(mark.fireMarksman({x:0,y:1,z:0}),false);assert.ok(mark.reloadTime>0);
   for(let i=0;i<120;i++)mark.step(ZERO);
   assert.equal(mark.ammo.sniper,4);
  }
  assert.equal(mark.kills,2);
 }finally{arena.world.free();}
});
test('solo automated sniper uses the same 25 damage',()=>{
 const s=new Simulation();try{s.start(false);s.mount();s.invulnerable=0;isolate(s);const f=frame(.006);place(s,f.p.x,24.97,f.p.z);
  for(let i=1;i<=4;i++){s.attackType='sniper';s.attackClock=4.55;s.aim={...s.position(),y:s.position().y+.4};s.step(ZERO);assert.equal(s.health,100-25*i);}
 }finally{s.world.free();}
});
test('real shared-world fuel impacts detonate at low speed, high speed, sideways and tipped over',()=>{
 for(const scenario of [{speed:2,yaw:0,tipped:false},{speed:27,yaw:0,tipped:false},{speed:14,yaw:Math.PI/2,tipped:false},{speed:14,yaw:0,tipped:true}]){
  const {arena,driver}=shared();try{
   const barrel=arena.barrels.find(b=>b.explosive)!;isolate(arena,[barrel.id]);const f=frame(.015);
   barrel.body.setTranslation({x:f.p.x,y:scenario.tipped?24.7:24.81,z:f.p.z},true);
   if(scenario.tipped)barrel.body.setRotation({x:Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2},true);
   place(driver,f.p.x,24.97,f.p.z-5,scenario.yaw);driver.body.setLinvel({x:0,y:0,z:scenario.speed},true);arena.world.step();
   for(let tick=0;tick<240&&barrel.active;tick++){
    // Maintain approach velocity to isolate contact detection from steering/traction.
    if(scenario.yaw)driver.body.setLinvel({x:0,y:driver.body.linvel().y,z:scenario.speed},true);
    driver.step({throttle:scenario.yaw?0:1,steer:0,brake:false});arena.updateSharedBarrels(1/60);arena.world.step();
   }
   assert.equal(barrel.active,false,JSON.stringify(scenario));assert.equal(driver.barrelExplosions,1);assert.equal(driver.health,75);assert.equal(driver.phase,'racing');assert.ok(driver.blastTime>0);assert.ok(driver.body.linvel().y>15,'blast must launch the ATV, not just play an effect');
  }finally{arena.world.free();}
 }
});
test('shooting fuel triggers a chain, launches nearby drivers, and fixed cover blocks the blast',()=>{
 const {arena,driver}=shared();try{
  const mark=new Simulation(false,arena.world);mark.start(true,'marksman');mark.barrels=arena.barrels;mark.networkTargets=[driver];
  const barrels=arena.barrels.filter(b=>b.explosive).slice(0,4);isolate(arena,barrels.map(b=>b.id));const f=frame(.015);
  barrels.forEach((b,i)=>b.body.setTranslation({x:f.p.x+i*4,y:24.81,z:f.p.z},true));
  place(driver,f.p.x,24.97,f.p.z+9);mark.markBody!.setTranslation({x:f.p.x,y:27,z:f.p.z-10},true);arena.world.step();
  const p=barrels[0].body.translation(),e=mark.markEye();assert.ok(mark.fireMarksman({x:p.x-e.x,y:p.y-e.y,z:p.z-e.z}));
  assert.ok(barrels.every(b=>!b.active));assert.equal(mark.barrelExplosions,4);assert.equal(driver.health,75,'One chain reaction must not stack four health hits');assert.equal(driver.phase,'racing');assert.equal(mark.kills,0);assert.ok(driver.body.linvel().y>15);assert.ok(Math.hypot(driver.body.linvel().x,driver.body.linvel().z)>20);
  driver.phase='racing';driver.health=100;driver.invulnerable=0;place(driver,f.p.x,24.97,f.p.z+9);
  arena.world.createCollider(RAPIER.ColliderDesc.cuboid(6,5,.5).setTranslation(f.p.x,27,f.p.z+4));arena.world.step();
  mark.explode({x:f.p.x,y:24.81,z:f.p.z},true,'barrel');assert.equal(driver.health,100);assert.ok(driver.body.linvel().y<1);
 }finally{arena.world.free();}
});
test('blue tower stays stacked until impact, scatters and lets the ATV smash through',()=>{
 const {arena,driver}=shared();try{
  const tower=arena.barrels.filter(b=>barrelSpots[b.id].stack),f=frame(barrelTower.t);
  assert.equal(tower.length,38);assert.equal(arena.barrels.filter(b=>b.explosive).length,24);
  for(let i=0;i<600;i++)arena.world.step();
  const before=tower.map(b=>({...b.body.translation()}));const top=tower.filter(b=>barrelSpots[b.id].height!>4);
  assert.ok(top.every(b=>b.body.translation().y>29),'top layer should remain standing after ten seconds');
  place(driver,f.p.x-f.forward.x*12,24.97,f.p.z-f.forward.z*12,f.yaw,27);driver.invulnerable=0;
  for(let i=0;i<150;i++){driver.step({throttle:1,steer:0,brake:false});arena.updateSharedBarrels(1/60);arena.world.step();}
  const displaced=tower.filter((b,i)=>Math.hypot(b.body.translation().x-before[i].x,b.body.translation().y-before[i].y,b.body.translation().z-before[i].z)>1).length;
  const p=driver.position(),progress=(p.x-f.p.x)*f.forward.x+(p.z-f.p.z)*f.forward.z;
  assert.ok(displaced>=8,`${displaced} barrels scattered`);assert.ok(progress>4,`ATV passed tower by ${progress}m`);assert.equal(driver.phase,'racing');assert.equal(driver.health,100);assert.equal(driver.barrelExplosions,0);
  console.log(JSON.stringify({tower:38,redBarrels:24,stableForSeconds:10,displaced,passedBy:progress}));
 }finally{arena.world.free();}
});

test('solo marksman AI can hit barrels across its separate physics worlds',()=>{
 const s=new Simulation();try{s.start(true,'marksman');const bot=s.bots[0],barrel=s.barrels.find(b=>b.explosive)!,f=frame(.015);isolate(s,[barrel.id]);
  barrel.body.setTranslation({x:f.p.x,y:24.81,z:f.p.z},true);place(bot,f.p.x,24.97,f.p.z-5,f.yaw,14);bot.invulnerable=0;s.world.step();
  for(let i=0;i<90&&barrel.active;i++)s.step(ZERO);
  assert.equal(barrel.active,false);assert.equal(bot.health,75);assert.equal(bot.phase,'racing');assert.ok(bot.blastTime>0);assert.ok(bot.body.linvel().y>15);assert.equal(s.kills,0,'an unassisted barrel collision is not a marksman kill');
 }finally{for(const bot of s.bots)bot.world.free();s.world.free();}
});

test('barrel blasts take 25 health throughout their radius, respect protection, and four separate hits destroy a driver',()=>{
 const {arena,driver}=shared();try{
  isolate(arena);const origin={x:1000,y:100,z:1000};
  for(const distance of [0,2,9,19,21]){
   driver.health=100;driver.phase='racing';place(driver,origin.x,origin.y,origin.z+distance);
   driver.explode(origin,false,'barrel');
   assert.equal(driver.health,distance<20?75:100,`distance ${distance}`);assert.equal(driver.phase,'racing');
  }
  driver.health=100;driver.invulnerable=1;place(driver,origin.x,origin.y,origin.z);
  driver.explode(origin,false,'barrel');assert.equal(driver.health,100);assert.equal(driver.body.linvel().y,0);
  driver.invulnerable=0;
  for(let hit=1;hit<=4;hit++){
   place(driver,origin.x,origin.y,origin.z);driver.explode(origin,false,'barrel');
   assert.equal(driver.health,100-hit*25);assert.equal(driver.phase,hit===4?'dead':'racing');
  }
  driver.health=100;driver.phase='racing';driver.explode(origin,false,'rocket');
  assert.equal(driver.health,0,'A direct rocket retains its existing damage');
 }finally{arena.world.free();}
});
