import RAPIER from '@dimforge/rapier3d-compat';
import { center, checkpoints, clamp, closest, coverPositions, frame, trackGeometry, width, jumps, obstacles, COURSE_LENGTH, type Vec, routes, routeGeometry, boosts, barrelSpots, towerCover } from './course';

import {driveAI} from './driver-ai';

export const MAGAZINE_SIZE=4;
export const SNIPER_DAMAGE=25;
export const BARREL_DAMAGE=25;
export type Phase = 'menu' | 'staging' | 'racing' | 'dead' | 'finished';
export type Input = { throttle: number; steer: number; brake: boolean };
export type Effect = { id: number; type: 'shot' | 'blast' | 'checkpoint' | 'death' | 'boost' | 'barrel' | 'reload' | 'rocket'; at: Vec; to?: Vec; ttl: number; life: number };
export type Rocket = { id: number; p: Vec; v: Vec; life: number };
export class Simulation {
  world: RAPIER.World;
  // Network rooms share one Rapier world, stepped exactly once by the server.
  externalStep=false;
  networkTargets?:Simulation[];
  spawnSlot=0;
  get combatTargets(){return this.networkTargets??(this.role==='marksman'?this.bots:[this]);}
  disposePlayer(){if(this.markController)this.world.removeCharacterController(this.markController);if(this.markBody)this.world.removeRigidBody(this.markBody);this.world.removeRigidBody(this.body);}
  updateSharedBarrels(dt:number){for(const b of this.barrels){b.cooldown=Math.max(0,b.cooldown-dt);if(b.active&&b.body.translation().y<0){b.active=false;b.body.setEnabled(false);}}}
  collectFallCredits(){for(const [bot,until] of this.creditedUntil){if(bot.phase==='dead'){if(this.elapsed<=until){this.kills++;this.lastHit=.25;}this.creditedUntil.delete(bot);}else if(this.elapsed>until)this.creditedUntil.delete(bot);}}

  barrels:{id:number;body:RAPIER.RigidBody;explosive:boolean;active:boolean;cooldown:number}[]=[];
  boostTime=0;boostCooldown=0;boostCount=0;barrelHits=0;barrelExplosions=0;routeName='main';
  markBody?:RAPIER.RigidBody;markController?:RAPIER.KinematicCharacterController;
  markYaw=0;markMoving=0;ads=false;
  ammo={sniper:MAGAZINE_SIZE,rocket:MAGAZINE_SIZE};reloadTime=0;reloadDuration=0;reloadWeapon:'sniper'|'rocket'='sniper';
  private roundSeed=1;

  body: RAPIER.RigidBody;
  phase: Phase = 'menu';
  paused = false;
  practice = false;
  role:'driver'|'marksman'='driver';
  bots:Simulation[]=[];
  kills=0;escaped=0;cooldown=0;
  lastHit=0;
  yawVelocity=0;
  airTime=0;blastTime=0;
  launches=0;
  health = 100;
  checkpoint = 0;
  elapsed = 0;
  deaths = 0;
  speed = 0;
  grounded = false;
  yaw = 0;
  steering = 0;
  invulnerable = 0;
  deathTimer = 0;
  message = '';
  messageTime = 0;
  attackType: 'sniper' | 'rocket' = 'sniper';
  attackClock = 0;
  warning = 0;
  aim: Vec = { x: 0, y: 0, z: 0 };
  source: Vec = { x: 0, y: 35.1, z: 0 };
  effects: Effect[] = [];
  rockets: Rocket[] = [];
  eventCount = 0;
  shots = 0;
  rocketsFired = 0;
  sniperHits = 0;
  rocketHits = 0;
  blockedShots = 0;
  completedCheckpoints: number[] = [];
  tuning = { attackRate: 1, grip: 2.3, steering: 1, blast: 1 };
  private creditedUntil=new Map<Simulation,number>();
  private cycle = 0;
  private tick = 0;
  private id = 0;
  private flippedTime = 0;
  private lastProgress = .01;

  constructor(private withBarrels=true, sharedWorld?:RAPIER.World) {
    this.world = sharedWorld??new RAPIER.World({ x: 0, y: -25, z: 0 });
    this.externalStep=!!sharedWorld;
    if(!sharedWorld){
    this.world.timestep = 1 / 60;
    const g = trackGeometry();
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(g.vertices, g.indices).setFriction(.5));
    for(const route of routes){const g=routeGeometry(route);this.world.createCollider(RAPIER.ColliderDesc.trimesh(g.vertices,g.indices).setFriction(.5));}
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(.6,34).setTranslation(0,32.65,0));
    for(const c of towerCover)this.world.createCollider(RAPIER.ColliderDesc.cuboid(c.w/2,.75,c.d/2).setTranslation(c.x,34,c.z));
    for (const t of coverPositions) {
      const f = frame(t), offset = -width(t) / 2 + .45;
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(.5, 2.8, 6)
        .setTranslation(f.p.x + f.right.x * offset, f.p.y + 2.8, f.p.z + f.right.z * offset)
        .setRotation({ x: 0, y: Math.sin(f.yaw / 2), z: 0, w: Math.cos(f.yaw / 2) }));
    }
    for(const o of obstacles){const f=frame(o.t),offset=o.side*(width(o.t)/2-o.w/2);
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(o.w/2,o.height/2,o.depth/2).setTranslation(f.p.x+f.right.x*offset,f.p.y+o.height/2,f.p.z+f.right.z*offset).setRotation({x:0,y:Math.sin(f.yaw/2),z:0,w:Math.cos(f.yaw/2)}));
    }
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(25, 13).setTranslation(0, 8, 0));
    }
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 30, 0).setCanSleep(false).setCcdEnabled(true)
      .enabledRotations(false, true, false).setLinearDamping(.06).setAngularDamping(3));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(.73, .28, 1.23).setMass(170).setFriction(.15), this.body);
    this.spawn();
    // Populate the query pipeline before the first suspension raycast.
    if(!this.externalStep)this.world.step();
  }
  position(): Vec { const p = this.body.translation(); return { x: p.x, y: p.y, z: p.z }; }
  announce(text: string, seconds = 2.4) { this.message = text; this.messageTime = seconds; }
  start(practice = false,role:'driver'|'marksman'='driver') {
    this.body.setEnabled(true);
    if(this.markBody){this.world.removeRigidBody(this.markBody);this.markBody=undefined;}if(this.markController){this.world.removeCharacterController(this.markController);this.markController=undefined;}
    this.reloadTime=0;this.ammo={sniper:MAGAZINE_SIZE,rocket:MAGAZINE_SIZE};this.ads=false;this.boostTime=0;this.boostCount=0;this.barrelHits=0;this.barrelExplosions=0;this.routeName='main';if(!this.externalStep)this.resetBarrels();
    if(!this.externalStep)for(const bot of this.bots)bot.world.free();this.bots=[];this.creditedUntil.clear();this.role=role;this.kills=0;this.escaped=0;this.cooldown=0;this.lastHit=0;this.launches=0;this.attackType='sniper';
    this.practice = practice; this.phase = 'staging'; this.paused = false;
    this.checkpoint = 0; this.elapsed = 0; this.deaths = 0; this.cycle = 0;
    this.shots = 0; this.rocketsFired = 0; this.sniperHits = 0; this.rocketHits = 0;
    this.blockedShots = 0; this.completedCheckpoints = [];
    this.spawn();
    if(role==='marksman'){
      this.phase='racing';this.practice=false;this.body.setTranslation({x:0,y:-300,z:0},true);if(!this.externalStep)this.world.step();
      this.markBody=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,34.3,0));
      this.world.createCollider(RAPIER.ColliderDesc.capsule(.65,.35),this.markBody);
      this.markController=this.world.createCharacterController(.03);if(!this.externalStep)this.world.step();
      if(!this.externalStep)for(let i=0;i<3;i++){const bot=new Simulation(false);bot.start(true);bot.checkpoint=i*2;bot.spawn();bot.mount();this.bots.push(bot);}
      this.announce('Stop the riders. WASD move · SHIFT aim · R reload · V camera',6);
    }else this.announce('Your ATV is ready. Press E to mount.',30);
  }
  mount() { if (this.phase === 'staging') { this.phase = 'racing'; this.announce('Follow the cyan gates. Keep moving.', 4); } }
  spawn() {
    const t = (this.checkpoint===0?0:checkpoints[this.checkpoint-1]) + .006 + (this.externalStep?Math.floor(this.spawnSlot/5)*4/COURSE_LENGTH:0), f = frame(t);
    const lane=this.externalStep?(this.spawnSlot%5-2)*2.7:0;
    this.boostTime=0;this.boostCooldown=0;this.yaw = f.yaw; this.steering = 0;this.yawVelocity=0;this.airTime=0;this.blastTime=0;
    this.body.setTranslation({ x: f.p.x+f.right.x*lane, y: f.p.y + 1.05, z: f.p.z+f.right.z*lane }, true);
    this.body.setRotation({ x: 0, y: Math.sin(this.yaw / 2), z: 0, w: Math.cos(this.yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true); this.body.resetTorques(true);
    this.health = 100; this.speed = 0; this.invulnerable = 3;
    this.rockets = []; this.warning = 0; this.attackClock = 0; this.flippedTime = 0;
    this.lastProgress = t;
  }
  recover() { if (this.role==='driver' && this.phase === 'racing') this.die('Recovery requested'); }
  die(reason: string) {
    if (this.phase !== 'racing') return;
    this.phase = 'dead'; this.deathTimer = 1.25; this.deaths++;
    this.announce(reason + ' · returning to checkpoint', 1.6);
    this.effect('death', this.position(), 1.2);
    this.warning = 0;
  }
  effect(type: Effect['type'], at: Vec, ttl: number, to?: Vec) {
    this.effects.push({ id: ++this.id, type, at: { ...at }, to, ttl, life: ttl }); this.eventCount++;
  }
  setPractice(value: boolean) { this.practice = value; this.warning = 0; this.attackClock = 0; this.rockets = []; }
  lineClear(from: Vec, to: Vec, ignore=this.markBody??this.body, blast=false) {
    const d = { x: to.x-from.x, y: to.y-from.y, z: to.z-from.z }, length = Math.hypot(d.x,d.y,d.z);
    if (length < .001) return true;
    const hit = this.world.castRay(new RAPIER.Ray(from, { x:d.x/length,y:d.y/length,z:d.z/length }), length, true, blast ? RAPIER.QueryFilterFlags.ONLY_FIXED : undefined, undefined, undefined, ignore);
    return !hit || hit.timeOfImpact >= length - .5;
  }
  hit(amount: number, reason: string) {
    if (this.invulnerable > 0 || this.phase !== 'racing') return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.die(reason);
  }
  explode(at:Vec,credit=true,kind:'rocket'|'barrel'='rocket',barrelVictims=new Set<Simulation>()){
    // Blast occlusion uses fixed cover so the exploding drum cannot absorb its own blast.
    const radius=kind==='barrel'?20:18,strength=(kind==='barrel'?1.15:1)*this.tuning.blast;
    for(const barrel of this.barrels){if(!barrel.active)continue;const p=barrel.body.translation(),dx=p.x-at.x,dz=p.z-at.z,d=Math.hypot(dx,p.y-at.y,dz);if(d>=radius)continue;
      if(barrel.explosive&&d<7){this.detonateBarrel(barrel,credit,barrelVictims);continue;}const power=1-d/radius,n=Math.max(.1,Math.hypot(dx,dz)),mass=barrel.body.mass();barrel.body.applyImpulse({x:dx/n*mass*26*power,y:mass*18*power,z:dz/n*mass*26*power},true);
    }
    this.effect('blast',at,.9);
    for(const target of this.combatTargets){const p=target.position(),dx=p.x-at.x,dz=p.z-at.z,d=Math.hypot(dx,p.y-at.y,dz);if(d>=radius||target.invulnerable>0||target.phase!=='racing'||!this.lineClear(at,p,target.body,true))continue;
      const power=(1-d/radius)**.65,n=Math.hypot(dx,dz),mass=target.body.mass(),nx=n>.1?dx/n:Math.cos(target.yaw),nz=n>.1?dz/n:-Math.sin(target.yaw);
      // Give the rigid body launch velocity and suspend tire/suspension forces.
      target.body.applyImpulse({x:nx*mass*38*power*strength,y:mass*(10+15*power)*power*strength,z:nz*mass*38*power*strength},true);
      target.airTime=Math.max(target.airTime,.18+power*.65);target.blastTime=1.6;target.grounded=false;
      // A chain keeps its physical blasts, but takes only one quarter of a
      // driver's maximum health. Separate barrel impacts can still add up.
      if(kind!=='barrel'||!barrelVictims.has(target)){
        if(kind==='barrel')barrelVictims.add(target);
        const damage=kind==='barrel'?BARREL_DAMAGE:d<2.3?140:90*power;
        if(this.role==='marksman'&&credit)this.damageBot(target,damage);else target.hit(damage,kind==='barrel'?'Explosive barrel':'Rocket impact');
      }
      if(target.health<=0)target.deathTimer=2.4;
      this.rocketHits++;
    }
  }
  step(input: Input, dt = 1/60) {
    if (this.paused || this.phase === 'menu' || this.phase === 'finished') return;
    if(this.role==='marksman'){this.stepMarksman(input,dt);return;}
    this.tick++;this.blastTime=Math.max(0,this.blastTime-dt);this.boostTime=Math.max(0,this.boostTime-dt);this.boostCooldown=Math.max(0,this.boostCooldown-dt);
    this.messageTime = Math.max(0,this.messageTime-dt);
    this.effects.forEach(e => e.life -= dt); this.effects = this.effects.filter(e => e.life > 0);
    if (this.phase === 'dead') {
      if(!this.externalStep)this.world.step(); this.deathTimer -= dt;
      if (this.deathTimer <= 0) { this.spawn(); this.phase = 'racing'; this.announce('Back in the race · 3 seconds protected'); }
      return;
    }
    this.invulnerable = Math.max(0,this.invulnerable-dt);
    const p = this.position(), velocity = this.body.linvel();
    const forward = { x:Math.sin(this.yaw), z:Math.cos(this.yaw) }, right = { x:forward.z,z:-forward.x };
    this.speed = velocity.x * forward.x + velocity.z * forward.z;
    // Four suspension probes; collision and gravity remain owned by Rapier.
    let heights = 0, contacts = 0;
    for (const x of [-.8,.8]) for (const z of [-1,1]) {
      const origin = { x:p.x+right.x*x+forward.x*z, y:p.y+.2, z:p.z+right.z*x+forward.z*z };
      const hit = this.world.castRay(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),1.7,true,undefined,undefined,undefined,this.markBody??this.body);
      if (hit) { heights += origin.y-hit.timeOfImpact; contacts++; }
    }
    this.airTime=Math.max(0,this.airTime-dt);
    this.grounded = contacts >= 2 && this.airTime<=0;
    const surface=closest(p),progress=surface.t;this.routeName=surface.route;
    const launch=surface.route==='main'?jumps.find(j=>{const d=(j.lip-progress)*COURSE_LENGTH;return d>=-.8&&d<=1.5&&p.y>24+j.rise-1.0;}):undefined;
    if(launch&&this.grounded&&this.speed>4){this.body.setLinvel({x:velocity.x,y:Math.abs(this.speed)*launch.rise/launch.run+.6,z:velocity.z},true);this.airTime=.3;this.grounded=false;this.launches++;}

    if (this.grounded) {
      const error = heights/contacts + .97 - p.y;
      const ramp=surface.route==='main'?jumps.find(j=>{const d=(j.lip-progress)*COURSE_LENGTH;return d>0&&d<j.run+1;}):undefined;
      const climb=ramp?Math.abs(this.speed)*ramp.rise/ramp.run:velocity.x*surface.slopeX+velocity.z*surface.slopeZ;
      const vertical = clamp(25 + error*120 - (velocity.y-climb)*17, -15, 200);
      this.body.applyImpulse({ x:0,y:vertical*this.body.mass()*dt,z:0 },true);
      let throttle = this.phase === 'racing' ? input.throttle : 0;
      const braking = input.brake || this.phase === 'staging';
      const lateral = velocity.x*right.x + velocity.z*right.z;
      const drag = .32 + (braking ? 3.4 : 0);
      const acceleration = throttle*17 - this.speed*drag;
      const boosted=this.boostTime>0;
      const nextSpeed = clamp(this.speed+(acceleration+(boosted?14:0))*dt,-8,boosted?36:Math.max(27,this.speed-5*dt));
      const side = lateral*Math.exp(-this.tuning.grip*(1-Math.min(Math.abs(this.speed)/27,1)*.45)*(braking?.22:1)*dt);
      this.body.setLinvel({x:forward.x*nextSpeed+right.x*side,y:this.body.linvel().y,z:forward.z*nextSpeed+right.z*side},true);
      // The ATV faces local +Z, so a right turn is negative rotation about +Y.
      // Input stays conventional: left = -1, right = +1, including touch controls.
      const steerTarget = -(this.phase === 'racing' ? input.steer : 0)*.61;
      this.steering += (steerTarget-this.steering)*Math.min(1,dt*3.5);
      const yawRate = clamp(Math.tan(this.steering)*this.speed/3.4,-1.45,1.45)*this.tuning.steering;
      this.yawVelocity+=(yawRate-this.yawVelocity)*Math.min(1,dt*4);
      this.yaw += this.yawVelocity*dt;
    }
    this.body.setRotation({x:0,y:Math.sin(this.yaw/2),z:0,w:Math.cos(this.yaw/2)},true);
    this.body.setAngvel({x:0,y:0,z:0},true);
    if(!this.externalStep)this.world.step();
    if (this.phase !== 'racing') return;
    this.elapsed += dt;this.updateFeatures(dt);
    const now = this.position();
    if (now.y < 6) { this.die('Lost to the void'); return; }
    if (now.y < closest(now).height-3 && Math.abs(this.speed) < .5) this.flippedTime += dt; else this.flippedTime = 0;
    if (this.flippedTime > 3) { this.die('Vehicle stranded'); return; }
    const near = closest(now), expected = checkpoints[this.checkpoint];
    const gap = Math.abs(near.t - (expected === 1 ? 0 : expected));
    if ((gap < 3/COURSE_LENGTH || (expected === 1 && near.t > 1-3/COURSE_LENGTH)) && near.distance < near.roadWidth/2 && now.y > near.height-.8) {
      if (this.checkpoint < checkpoints.length-1) {
        this.checkpoint++; this.completedCheckpoints.push(this.checkpoint);
        this.announce(`Checkpoint ${this.checkpoint} secured`); this.effect('checkpoint',now,1.1);
      } else if (this.lastProgress > .9 || near.t < .02) {
        this.checkpoint = checkpoints.length; this.completedCheckpoints.push(checkpoints.length); this.phase = 'finished';
        this.announce('Circuit complete'); this.rockets=[];this.warning=0;
      }
    }
    this.lastProgress = near.t;
    const upcoming=near.route==='main'?jumps.find(j=>{const d=(j.lip-near.t)*COURSE_LENGTH;return d>0&&d<45;}):undefined;
    if(upcoming&&this.messageTime<.2)this.announce('FULL THROTTLE · clear the gap at 95+ km/h',2);
    if (!this.practice && this.invulnerable <= 0) this.attacker(dt);
    this.updateRockets(dt);
  }
  private attacker(dt: number) {
    const rider=this.position(),heading=Math.atan2(rider.x,rider.z);
    this.source={x:Math.sin(heading)*1.4-Math.cos(heading)*.28,y:35.1,z:Math.cos(heading)*1.4+Math.sin(heading)*.28};
    this.attackClock += dt * this.tuning.attackRate;
    const waiting = this.attackType === 'sniper' ? 3.2 : 4.3;
    const warningLength = this.attackType === 'sniper' ? 1.35 : 1.9;
    if (this.attackClock < waiting) { this.warning = 0; return; }
    this.warning = clamp((this.attackClock-waiting)/warningLength,0,1);
    const p = this.position(), v = this.body.linvel();
    // Aim locks before firing, making last-second steering a real escape.
    if (this.warning < .73) {
      const lead = this.attackType === 'rocket' ? 1.35 : .45;
      const error = Math.sin(this.cycle*2.39)*2.4;
      this.aim = {x:p.x+v.x*lead+error,y:this.attackType==='rocket'?closest(p).height+.08:p.y+.35,z:p.z+v.z*lead-error};
    }
    if (this.warning < 1) return;
    if (this.attackType === 'sniper') {
      this.shots++;
      if (this.lineClear(this.source,this.aim)) {
        this.effect('shot',this.source,.22,{...this.aim});
        const a=this.source,b=this.aim, ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
        const t=clamp(((p.x-a.x)*ab.x+(p.y+.4-a.y)*ab.y+(p.z-a.z)*ab.z)/(ab.x**2+ab.y**2+ab.z**2),0,1);
        if(Math.hypot(p.x-a.x-ab.x*t,p.y+.4-a.y-ab.y*t,p.z-a.z-ab.z*t)<1.6){this.sniperHits++;this.hit(SNIPER_DAMAGE,'Sniper took you out');}
      } else { this.blockedShots++; this.announce('Cover blocked the shot',1); }
      this.attackType='rocket';
    } else {
      const d={x:this.aim.x-this.source.x,y:this.aim.y-this.source.y,z:this.aim.z-this.source.z}, length=Math.hypot(d.x,d.y,d.z);
      this.rockets.push({id:++this.id,p:{...this.source},v:{x:d.x/length*57,y:d.y/length*57,z:d.z/length*57},life:8});
      this.rocketsFired++; this.attackType='sniper';
    }
    this.attackClock=0;this.warning=0;this.cycle++;
  }
  private damageBot(bot:Simulation,amount:number){
    const before=bot.health;bot.hit(amount,'Taken out by the marksman');if(bot.health<before){this.creditedUntil.set(bot,this.elapsed+6);this.lastHit=.25;this.announce(bot.phase==='dead'?'RIDER DESTROYED':'HIT · '+Math.round(before-bot.health)+' damage',1.2);if(bot.phase==='dead'){this.kills++;this.creditedUntil.delete(bot);}}
  }
  fireMarksman(direction:Vec){
    if(this.role!=='marksman'||this.phase!=='racing'||this.paused||this.cooldown>0||this.reloadTime>0)return false;
    if(this.ammo[this.attackType]<=0){this.requestReload();return false;}
    const source=this.markEye(),length=Math.hypot(direction.x,direction.y,direction.z);if(length<.001)return false;
    const dir={x:direction.x/length,y:direction.y/length,z:direction.z/length};
    this.ammo[this.attackType]--;
    if(this.attackType==='rocket'){
      this.effect('rocket',source,.25);this.rockets.push({id:++this.id,p:{x:source.x+dir.x*1.2,y:source.y+dir.y*1.2,z:source.z+dir.z*1.2},v:{x:dir.x*57,y:dir.y*57,z:dir.z*57},life:8});this.rocketsFired++;this.cooldown=2;
    }else{
      this.shots++;this.cooldown=.85;
      const wall=this.world.castRay(new RAPIER.Ray(source,dir),500,true,undefined,undefined,undefined,this.markBody??this.body);
      let distance=wall?.timeOfImpact??500,hitBot:Simulation|undefined;
      for(const bot of this.networkTargets??this.bots){if(bot.phase!=='racing'||bot.invulnerable>0)continue;const p=bot.position();
        for(const [rise,radius]of [[.3,1.5],[1.3,.43]] as const){const x=p.x-source.x,y=p.y+rise-source.y,z=p.z-source.z,t=x*dir.x+y*dir.y+z*dir.z,d2=x*x+y*y+z*z-t*t;
          if(t>0&&d2<radius*radius){const entry=t-Math.sqrt(radius*radius-d2);if(entry<distance){distance=entry;hitBot=bot;}}
        }
      }
      this.effect('shot',source,.16,{x:source.x+dir.x*distance,y:source.y+dir.y*distance,z:source.z+dir.z*distance});
      if(!hitBot&&wall){const barrel=this.barrels.find(b=>b.active&&wall.collider.parent()?.handle===b.body.handle);if(barrel){if(barrel.explosive)this.detonateBarrel(barrel);else barrel.body.applyImpulse({x:dir.x*100,y:30,z:dir.z*100},true);}}
      if(hitBot){this.sniperHits++;this.damageBot(hitBot,SNIPER_DAMAGE);}
    }return true;
  }
  private resetBarrels(){
    for(const b of this.barrels)this.world.removeRigidBody(b.body);this.barrels=[];if(!this.withBarrels)return;
    let seed=++this.roundSeed*9187;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    barrelSpots.forEach((spot,id)=>{const jitter=spot.stack?0:1,f=frame(spot.t+(rng()-.5)*4*jitter/COURSE_LENGTH),offset=spot.offset+(rng()-.5)*1.5*jitter;
      const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(f.p.x+f.right.x*offset,f.p.y+.81+(spot.height??0),f.p.z+f.right.z*offset).setLinearDamping(.25).setAngularDamping(.3).setCcdEnabled(true));
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(.8,.68).setMass(spot.explosive?45:spot.stack?18:28).setFriction(spot.stack?.65:.5).setRestitution(spot.stack?.05:.3),body);this.barrels.push({id,body,explosive:spot.explosive,active:true,cooldown:0});
    });
  }
  private detonateBarrel(barrel:typeof this.barrels[number],credit=true,barrelVictims=new Set<Simulation>()){if(!barrel.active)return;barrel.active=false;const p={...barrel.body.translation()};barrel.body.setEnabled(false);this.barrelExplosions++;this.explode(p,credit,'barrel',barrelVictims);}
  private barrelContact(target:Simulation){
    if(target.phase!=='racing')return;
    const p=target.position(),vehicle=target.body.collider(0);
    for(const barrel of this.barrels){
      if(!barrel.active||barrel.cooldown>0)continue;
      const q=barrel.body.translation();
      if(Math.hypot(p.x-q.x,p.z-q.z)>3||Math.abs(p.y-q.y)>2.5)continue;
      // Query the actual shapes: front, side and tipped-over impacts all count,
      // even after the physics solver has already slowed the ATV down.
      const collider=barrel.body.collider(0);
      if(!vehicle.contactShape(collider.shape,collider.translation(),collider.rotation(),.12))continue;
      if(barrel.explosive){this.barrelHits++;this.detonateBarrel(barrel,false);continue;}
      const velocity=target.body.linvel();
      if(Math.hypot(velocity.x,velocity.z)<2)continue;
      barrel.cooldown=1;this.barrelHits++;
      barrel.body.applyImpulse({x:velocity.x*15,y:90,z:velocity.z*15},true);
      target.body.applyImpulse({x:-velocity.x*12,y:25,z:-velocity.z*12},true);
      this.effect('barrel',q,.3);
    }
  }
  private updateFeatures(dt:number){if(!this.externalStep)this.updateSharedBarrels(dt);if(this.role==='marksman')return;this.barrelContact(this);
    const p=this.position(),near=closest(p);if(this.boostCooldown<=0&&this.grounded&&near.route==='main'&&near.distance<near.roadWidth/2&&boosts.some(b=>Math.abs(b.t-near.t)*COURSE_LENGTH<b.length/2)){this.boostTime=2.2;this.boostCooldown=4;this.boostCount++;this.effect('boost',p,.5);this.announce('OVERDRIVE · brake before the bend',2);}
  }
  markEye():Vec{const p=this.markBody?.translation()??{x:0,y:34.3,z:0};return{x:p.x,y:p.y+1.05,z:p.z};}
  requestReload(){if(this.role!=='marksman'||this.phase!=='racing'||this.paused||this.reloadTime>0||this.ammo[this.attackType]>=MAGAZINE_SIZE)return false;this.reloadWeapon=this.attackType;this.reloadDuration=this.attackType==='sniper'?1.8:2.4;this.reloadTime=this.reloadDuration;this.effect('reload',this.markEye(),this.reloadDuration);return true;}
  private stepMarksman(input:Input,dt:number){
    if(this.markBody&&this.markController){const p=this.markBody.translation(),n=Math.max(1,Math.hypot(input.throttle,input.steer)),speed=this.ads?2.4:7.5;
      const dx=(-Math.sin(this.markYaw)*input.throttle+Math.cos(this.markYaw)*input.steer)/n*speed*dt,dz=(-Math.cos(this.markYaw)*input.throttle-Math.sin(this.markYaw)*input.steer)/n*speed*dt;
      const radius=Math.hypot(p.x+dx,p.z+dz),scale=Math.min(1,32/Math.max(1,radius));
      this.markController.computeColliderMovement(this.markBody.collider(0),{x:(p.x+dx)*scale-p.x,y:-.15,z:(p.z+dz)*scale-p.z});
      const m=this.markController.computedMovement();this.markMoving=Math.hypot(m.x,m.z)/dt;this.markBody.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});
    }
    if(!this.externalStep)this.world.step();this.updateFeatures(dt);
    if(this.reloadTime>0){this.reloadTime=Math.max(0,this.reloadTime-dt);if(!this.reloadTime)this.ammo[this.reloadWeapon]=MAGAZINE_SIZE;}
    else if(this.ammo[this.attackType]===0&&this.cooldown<=0)this.requestReload();
    this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.lastHit=Math.max(0,this.lastHit-dt);this.messageTime=Math.max(0,this.messageTime-dt);
    this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);
    if(!this.externalStep)for(const bot of this.bots){const alive=bot.phase==='racing';bot.step(driveAI(bot),dt);this.barrelContact(bot);if(alive&&bot.phase==='dead'&&(this.creditedUntil.get(bot)??-1)>=this.elapsed){this.kills++;this.creditedUntil.delete(bot);this.announce('RIDER KNOCKED INTO THE VOID',2);}if(bot.phase==='finished'){this.escaped++;bot.start(true);bot.mount();}}
    this.updateRockets(dt);
  }
  private updateRockets(dt: number) {
    const alive:Rocket[]=[];
    for(const r of this.rockets){
      r.life-=dt; const speed=Math.hypot(r.v.x,r.v.y,r.v.z), distance=speed*dt;
      const ray=new RAPIER.Ray(r.p,{x:r.v.x/speed,y:r.v.y/speed,z:r.v.z/speed});
      const hit=this.world.castRay(ray,distance+.4,true);
      const p=this.position();
      const targetHit=this.role==='marksman'?(this.networkTargets??this.bots).some(b=>{const q=b.position();return b.phase==='racing'&&Math.hypot(q.x-r.p.x,q.y-r.p.y,q.z-r.p.z)<1.8;}):Math.hypot(p.x-r.p.x,p.y-r.p.y,p.z-r.p.z)<1.8;
      if(hit || targetHit){
        const travel=hit?Math.max(0,hit.timeOfImpact-.18):0;
        this.explode({x:r.p.x+r.v.x/speed*travel,y:r.p.y+r.v.y/speed*travel,z:r.p.z+r.v.z/speed*travel});
      } else {
        r.p={x:r.p.x+r.v.x*dt,y:r.p.y+r.v.y*dt,z:r.p.z+r.v.z*dt};
        if(r.life>0)alive.push(r);
      }
    }
    this.rockets=alive;
  }
  snapshot() {
    return {role:this.role,blastTime:this.blastTime,markEye:this.markEye(),ammo:{...this.ammo},reloadTime:this.reloadTime,boostTime:this.boostTime,boostCount:this.boostCount,barrelHits:this.barrelHits,barrelExplosions:this.barrelExplosions,route:this.routeName,kills:this.kills,escaped:this.escaped,cooldown:this.cooldown,launches:this.launches,phase:this.phase,paused:this.paused,practice:this.practice,position:this.position(),yaw:this.yaw,speed:this.speed,grounded:this.grounded,checkpoint:this.checkpoint,health:this.health,elapsed:this.elapsed,deaths:this.deaths,invulnerable:this.invulnerable,warning:this.warning,shots:this.shots,rocketsFired:this.rocketsFired,sniperHits:this.sniperHits,rocketHits:this.rocketHits,blockedShots:this.blockedShots,completedCheckpoints:[...this.completedCheckpoints]};
  }
}
export async function createSimulation(){await RAPIER.init();return new Simulation();}
