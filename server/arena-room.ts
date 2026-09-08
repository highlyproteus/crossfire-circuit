import { Room, type Client, ServerError } from '@colyseus/core';
import { randomInt, randomUUID } from 'node:crypto';
import { Simulation, type Input } from '../src/simulation';
import { closest, checkpoints } from '../src/course';
import type { PlayerInput, PlayerState, RoundPhase, WorldState } from '../src/network-types';
import { queueResult } from './results';
import { LOBBY_WAIT_MS, RESULTS_WAIT_MS, LOBBY_EXPIRED_MESSAGE } from '../src/lobby-policy';
const ZERO:PlayerInput={throttle:0,steer:0,brake:false,yaw:0,ads:false,fire:false,direction:{x:0,y:0,z:-1}};
type Entry={name:string;sim:Simulation;connected:boolean;input:PlayerInput;lastInput:number;finished:number;serial:number};
export class ArenaRoom extends Room {
  maxClients=26;
  maxMessagesPerSecond=90;
  players=new Map<string,Entry>();
  arena!:Simulation;
  leader='';stage:RoundPhase='lobby';remaining=0;elapsed=0;round=0;reason='';marksman='';
  private departed=new Map<string,PlayerState>();private instanceId=randomUUID();private accumulator=0;private tick=0;private serial=0;private age=0;
  static active=new Set<ArenaRoom>();
  private waitingSince=0;private expiryWarned=false;private expiring=false;
  protected now(){return Date.now();}
  private resetWait(){this.waitingSince=this.now();this.expiryWarned=false;}
  onCreate(){
    if(ArenaRoom.active.size>=4)throw new ServerError(503,'All circuits are busy. Try again shortly.');
    ArenaRoom.active.add(this);this.setPrivate(true);this.resetWait();
    this.arena=new Simulation();this.arena.start(true);this.arena.body.setEnabled(false);this.arena.externalStep=true;
    this.onMessage('input',(client,data:unknown)=>{const p=this.players.get(client.sessionId);if(!p||!p.connected||!data||typeof data!=='object')return;const d=data as Record<string,unknown>,vec=d.direction as Record<string,unknown>|undefined;
      const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
      if(!finite(d.throttle)||!finite(d.steer)||!finite(d.yaw)||!vec||!finite(vec.x)||!finite(vec.y)||!finite(vec.z))return;
      const n=Math.hypot(vec.x as number,vec.y as number,vec.z as number);if(n<.5||n>2)return;
      p.input={throttle:Math.max(-1,Math.min(1,d.throttle as number)),steer:Math.max(-1,Math.min(1,d.steer as number)),brake:d.brake===true,yaw:(d.yaw as number)%(Math.PI*2),ads:d.ads===true,fire:d.fire===true,direction:{x:(vec.x as number)/n,y:(vec.y as number)/n,z:(vec.z as number)/n}};p.lastInput=this.age;
    });
    this.onMessage('start',c=>{if(c.sessionId!==this.leader||this.stage!=='lobby')return;if(this.connected().length<2){c.send('notice','Invite at least one other player to start.');return;}this.round++;this.resetPlayers();this.stage='warmup';this.remaining=30;this.reason='Free play — explore the circuit';this.publish();});
    this.onMessage('next',c=>{if(c.sessionId!==this.leader||this.stage!=='results')return;this.stage='lobby';this.remaining=0;this.marksman='';this.resetWait();this.resetPlayers();void this.unlock();this.publish();});
    this.onMessage('weapon',(c,w)=>{const s=this.players.get(c.sessionId)?.sim;if(s?.role==='marksman'&&s.reloadTime<=0&&(w==='sniper'||w==='rocket'))s.attackType=w;});
    this.onMessage('reload',c=>this.players.get(c.sessionId)?.sim.requestReload());
    this.onMessage('recover',c=>{if(this.stage==='racing'||this.stage==='warmup')this.players.get(c.sessionId)?.sim.recover();});
    this.onMessage('ping',(c,n)=>{if(typeof n==='number')c.send('pong',n);});
    this.setTimestep(ms=>{this.accumulator+=Math.min(ms/1000,.25);let steps=0;while(this.accumulator>=1/60&&steps<15){this.step();this.accumulator-=1/60;steps++;}},1000/60);
    // Disable schema patches after installing our loop, avoiding a second clock tick.
    this.patchRate=null;
  }
  static async onAuth(_token:string,options:{name?:unknown}){const name=typeof options?.name==='string'?options.name.normalize('NFKC').replace(/[<>\p{C}]/gu,'').trim().replace(/\s+/g,' ').slice(0,18):'';if(name.length<2)throw new ServerError(400,'Enter a name with 2–18 characters.');return name;}
  onJoin(client:Client,_options:unknown,name:string){
    if(this.stage!=='lobby'&&this.stage!=='warmup')throw new ServerError(409,'This race has started. Join the next lobby.');
    let unique=name;let count=2;while([...this.players.values()].some(p=>p.name===unique))unique=`${name.slice(0,14)} ${count++}`;
    const sim=new Simulation(false,this.arena.world);sim.spawnSlot=this.freeSlot();sim.start(true);sim.barrels=this.arena.barrels;sim.phase=this.stage==='warmup'?'racing':'staging';
    this.players.set(client.sessionId,{name:unique,sim,connected:true,input:{...ZERO},lastInput:0,finished:0,serial:++this.serial});if(!this.leader)this.leader=client.sessionId;this.refreshTargets();this.publish();
  }
  onDrop(client:Client,code?:number){console.info(JSON.stringify({event:'player_disconnected',room:this.roomId,code,stage:this.stage,players:this.players.size}));const p=this.players.get(client.sessionId);if(p){p.connected=false;p.input={...ZERO};this.transferLeader();this.publish();}this.allowReconnection(client,90);}
  onReconnect(client:Client){console.info(JSON.stringify({event:'player_reconnected',room:this.roomId,stage:this.stage}));const p=this.players.get(client.sessionId);if(p){p.connected=true;p.lastInput=this.age;if(!this.leader)this.leader=client.sessionId;this.publish();}}
  onLeave(client:Client){const p=this.players.get(client.sessionId);if(!p)return;if(this.stage==='racing'){const state=this.snapshot().players.find(p=>p.id===client.sessionId);if(state)this.departed.set(client.sessionId,state);}p.sim.disposePlayer();this.players.delete(client.sessionId);this.transferLeader();this.refreshTargets();if(client.sessionId===this.marksman&&this.stage==='racing')this.end('The marksman left. Start another round.');else if(this.connected().length<2&&['warmup','countdown','racing'].includes(this.stage))this.end('Not enough players remain.');this.publish();}
  onDispose(){ArenaRoom.active.delete(this);this.arena?.world.free();}
  private connected(){return [...this.players.entries()].filter(([,p])=>p.connected);}
  private transferLeader(){if(!this.players.get(this.leader)?.connected)this.leader=this.connected()[0]?.[0]??'';}
  private freeSlot(){const used=new Set([...this.players.values()].map(p=>p.sim.spawnSlot));let slot=0;while(used.has(slot))slot++;return slot;}
  private refreshTargets(){const drivers=[...this.players.values()].map(p=>p.sim).filter(s=>s.role==='driver');this.arena.networkTargets=drivers;for(const p of this.players.values())p.sim.networkTargets=drivers;}
  private resetPlayers(){
    this.departed.clear();
    this.arena.externalStep=false;this.arena.start(true);this.arena.externalStep=true;this.arena.body.setEnabled(false);
    let slot=0;for(const p of this.players.values()){p.sim.spawnSlot=slot++;p.sim.start(true);p.sim.barrels=this.arena.barrels;p.sim.mount();p.finished=0;p.input={...ZERO};}this.refreshTargets();this.elapsed=0;this.marksman='';
  }
  private beginRace(){
    const candidates=this.connected();if(candidates.length<2){this.end('Not enough players remain.');return;}
    this.resetPlayers();this.marksman=candidates[randomInt(candidates.length)][0];const s=this.players.get(this.marksman)!.sim;s.start(true,'marksman');s.barrels=this.arena.barrels;this.refreshTargets();
    this.stage='racing';this.remaining=600;this.reason='Race through all eight checkpoints';this.elapsed=0;this.publish();
  }
  private end(reason:string){if(this.stage==='results')return;const wasRacing=this.stage==='racing';this.stage='results';this.resetWait();this.remaining=0;this.reason=reason;for(const p of this.players.values())p.input={...ZERO};this.publish();if(wasRacing){const state=this.snapshot();state.players.push(...this.departed.values());void queueResult(this.instanceId+'-'+this.round,state);}}
  step(){
    if(this.expiring)return;
    const dt=1/60;this.age+=dt;this.tick++;
    if(this.tick%60===0&&(this.stage==='lobby'||this.stage==='results')){
      const remaining=(this.stage==='lobby'?LOBBY_WAIT_MS:RESULTS_WAIT_MS)-(this.now()-this.waitingSince);
      if(remaining<=0){this.expiring=true;this.broadcast('lobby-expired',LOBBY_EXPIRED_MESSAGE);void this.disconnect();return;}
      if(remaining<=60_000&&!this.expiryWarned){this.expiryWarned=true;this.broadcast('notice',this.stage==='lobby'?'Start a round within one minute to keep this lobby open.':'Return to the lobby within one minute to keep playing.');}
    }
    if(this.stage==='warmup'||this.stage==='countdown'||this.stage==='racing'){
      this.remaining=Math.max(0,this.remaining-dt);
      if(this.remaining<=0){if(this.stage==='warmup'){this.stage='countdown';this.remaining=5;this.reason='Back to the starting grid';this.resetPlayers();void this.lock();}else if(this.stage==='countdown')this.beginRace();else this.end('Time is up.');}
    }
    if(this.stage==='warmup'||this.stage==='racing'){
      if(this.stage==='racing')this.elapsed+=dt;
      for(const p of this.players.values()){
        const s=p.sim,input=p.connected&&this.age-p.lastInput<.35?p.input:ZERO;
        s.markYaw=input.yaw;s.ads=input.ads;s.step(input);
        if(this.stage==='warmup'&&s.phase==='finished'){s.start(true);s.barrels=this.arena.barrels;s.mount();this.refreshTargets();}
        if(s.role==='marksman'&&this.stage==='racing'&&input.fire)s.fireMarksman(input.direction);
        if(this.stage==='racing'&&s.role==='driver'&&s.phase==='finished'&&!p.finished){p.finished=this.elapsed;this.remaining=Math.min(this.remaining,60);s.body.setEnabled(false);}
      }
      this.arena.updateSharedBarrels(dt);this.arena.world.step();
      for(const p of this.players.values())if(p.sim.role==='marksman')p.sim.collectFallCredits();
      if(this.stage==='racing'&&[...this.players.values()].filter(p=>p.sim.role==='driver').every(p=>p.finished>0))this.end('Every driver has finished.');
    }
    if(this.tick%3===0)this.publish();
  }
  snapshot():WorldState{
    const players:PlayerState[]=[];
    const effects:WorldState['effects']=[],rockets:WorldState['rockets']=[];
    for(const [id,p] of this.players){const s=p.sim,position=s.role==='marksman'?s.markEye():s.position(),near=closest(position).t,start=s.checkpoint?checkpoints[s.checkpoint-1]:0,end=checkpoints[s.checkpoint]??1,progress=s.role==='driver'?s.checkpoint+Math.max(0,Math.min(.999,(near-start)/Math.max(.001,end-start))):0;
      players.push({id,name:p.name,connected:p.connected,role:s.role,phase:s.phase,p:position,v:s.role==='driver'?{...s.body.linvel()}:{x:0,y:0,z:0},yaw:s.yaw,steering:s.steering,speed:s.speed,health:s.health,checkpoint:s.checkpoint,progress,deaths:s.deaths,kills:s.kills,finished:p.finished,invulnerable:s.invulnerable,deathTimer:s.deathTimer,blastTime:s.blastTime,grounded:s.grounded,boostTime:s.boostTime,routeName:s.routeName,markYaw:s.markYaw,markMoving:s.markMoving,ammo:{...s.ammo},attackType:s.attackType,cooldown:s.cooldown,reloadTime:s.reloadTime,reloadDuration:s.reloadDuration,reloadWeapon:s.reloadWeapon,lastHit:s.lastHit,message:s.message,messageTime:s.messageTime});
      for(const e of s.effects)effects.push({...e,id:p.serial*1000000+e.id});for(const r of s.rockets)rockets.push({...r,id:p.serial*1000000+r.id});
    }
    return{roomId:this.roomId,leader:this.leader,stage:this.stage,remaining:this.remaining,elapsed:this.elapsed,round:this.round,reason:this.reason,marksman:this.marksman,players,barrels:this.arena.barrels.map(b=>({id:b.id,p:{...b.body.translation()},q:{...b.body.rotation()},active:b.active,explosive:b.explosive})),effects,rockets,tick:this.tick};
  }
  private publish(){if(this.clients.length)this.broadcast('world',this.snapshot());}
}
