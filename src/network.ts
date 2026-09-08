import { Client, type Room } from '@colyseus/sdk';
import type { Simulation, Input } from './simulation';
import type { View } from './view';
import type { WorldState } from './network-types';
import { LOBBY_EXPIRED_MESSAGE } from './lobby-policy';
import type { VoiceAction,VoiceReply,VoiceRequest } from './voice-types';
export class Multiplayer {
  room?:Room;
  state?:WorldState;
  connected=false;
  reconnecting=false;
  localPaused=false;
  error='';
  latency=0;
  private generation=0;
  private pendingShot=false;
  private receivedAt=0;
  private savedAt=0;
  private sendClock=0;private pingClock=0;
  private role='';private lastRound=-1;private lastStage='';
  private voiceSequence=0;
  private voiceRequests=new Map<number,{room:Room;resolve:(reply:VoiceReply)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  onChange=()=>{};
  constructor(private sim:Simulation,private view:View){
    addEventListener('online',()=>this.checkConnection());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.checkConnection();});
  }
  requestShot(){if(this.connected&&!this.localPaused)this.pendingShot=true;}
  requestVoice(action:VoiceAction,options:Pick<VoiceRequest,'target'|'enabled'|'muted'>={}):Promise<VoiceReply>{
    const room=this.room;if(!room||!this.connected)return Promise.reject(new Error('Reconnect to the game before using voice chat.'));
    if(this.voiceRequests.size>=4)return Promise.reject(new Error('Voice controls are busy. Please try again in a moment.'));
    const requestId=this.voiceSequence=(this.voiceSequence+1)%1_000_000_000;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.voiceRequests.delete(requestId);reject(new Error('Voice chat did not respond. Please try again.'));},12000);
      this.voiceRequests.set(requestId,{room,resolve,reject,timer});
      room.send('voice',{requestId,action,...options});
    });
  }
  private cancelVoiceRequests(){for(const pending of this.voiceRequests.values()){clearTimeout(pending.timer);pending.reject(new Error('The game connection changed. Please try voice chat again.'));}this.voiceRequests.clear();}
  private storage(roomId:string,value?:{token:string;at:number}|null){
    try{const key=`crossfire-reconnect-${roomId}`;if(value===null){sessionStorage.removeItem(key);return;}if(value){sessionStorage.setItem(key,JSON.stringify(value));return;}const raw=sessionStorage.getItem(key);if(!raw)return;const saved=JSON.parse(raw);if(typeof saved.token==='string'&&Date.now()-saved.at<90000)return saved as {token:string;at:number};sessionStorage.removeItem(key);}catch{}
  }
  private remember(room:Room){if(room.reconnectionToken){this.storage(room.roomId,{token:room.reconnectionToken,at:Date.now()});this.savedAt=performance.now();}}
  private async endpoint(){
    if(import.meta.env.VITE_SERVER_DISCOVERY==='true'){
      const response=await fetch(`${import.meta.env.VITE_CONVEX_URL}/api/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'servers:current',args:{},format:'json'}),signal:AbortSignal.timeout(6500)});
      if(!response.ok)throw new Error('Server discovery is temporarily unavailable.');
      const result=await response.json();if(result.status!=='success'||!result.value)throw new Error('The game server is reconnecting. Try again shortly.');return result.value as string;
    }
    return import.meta.env.VITE_GAME_SERVER||(location.port==='5190'?`${location.protocol}//${location.hostname}:2567`:location.origin);
  }
  private async join(endpoint:string,operation:(client:Client)=>Promise<Room>):Promise<Room>{
    const client=new Client(endpoint);
    // Bound HTTP + WebSocket handshakes, including networks that silently drop packets.
    let expired=false,timer:ReturnType<typeof setTimeout>;
    const request=operation(client).then(room=>{if(expired){room.reconnection.enabled=false;void room.leave().catch(()=>{});throw new Error('Connection timed out.');}return room;});
    try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Connection timed out. Please try again.'));},10000);})]);}finally{clearTimeout(timer!);}
  }
  private friendly(error:unknown){
    const message=error instanceof Error?error.message:String(error);
    if(/not found|not defined|no rooms|invalid room|expired|locked|already started|race has started/i.test(message))return 'That lobby has ended or the race has started. Ask your friend for a new lobby invite.';
    if(/full|maxClients/i.test(message))return 'This lobby is full. Ask your friend to open another lobby.';
    if(/name|2–18|busy|circuits|server is reconnecting|too many (new lobbies|join attempts)/i.test(message))return message;
    return navigator.onLine?'Could not reach the game server. Please try again.':'You are offline. Reconnect to Wi-Fi or mobile data, then try again.';
  }
  async connect(name:string,roomId=''){
    this.error='';const generation=++this.generation;
    try{
      const endpoint=await this.endpoint();let room:Room|undefined;const saved=roomId?this.storage(roomId):undefined;
      if(saved){for(let attempt=0;attempt<3&&!room&&generation===this.generation;attempt++){try{room=await this.join(endpoint,c=>c.reconnect(saved.token));}catch{if(attempt<2)await new Promise(r=>setTimeout(r,750));}}if(!room)this.storage(roomId,null);}
      if(generation!==this.generation)return;
      room??=await this.join(endpoint,c=>roomId?c.joinById(roomId,{name}):c.create('circuit',{name}));
      if(generation!==this.generation){await room.leave();return;}
      this.sim.start(true);this.sim.externalStep=true;this.localPaused=false;this.role='';this.lastRound=-1;this.state=undefined;this.attach(room);
      const url=new URL(location.href);url.searchParams.set('room',room.roomId);history.replaceState(null,'',url);this.onChange();
    }catch(e){if(generation===this.generation){this.error=this.friendly(e);this.onChange();}throw e;}
  }
  private attach(room:Room){
    this.cancelVoiceRequests();
    let lobbyExpired=false;
    this.room=room;this.connected=true;this.reconnecting=false;this.error='';this.receivedAt=performance.now();this.pendingShot=false;
    // We retry through discovery so a replacement tunnel can retain the same room.
    room.reconnection.enabled=false;this.remember(room);
    room.onMessage('world',(state:WorldState)=>{if(this.room!==room)return;this.state=state;this.receivedAt=performance.now();if(this.receivedAt-this.savedAt>1000)this.remember(room);this.onChange();});
    room.onMessage('notice',(message:string)=>{if(this.room===room){this.error=message;this.onChange();}});
    room.onMessage('lobby-expired',()=>{lobbyExpired=true;});
    room.onMessage('voice-reply',(reply:VoiceReply)=>{const pending=this.voiceRequests.get(reply.requestId);if(!pending||pending.room!==room||this.room!==room)return;clearTimeout(pending.timer);this.voiceRequests.delete(reply.requestId);if(reply.ok)pending.resolve(reply);else pending.reject(new Error(reply.error??'Voice chat is unavailable.'));});
    room.onMessage('pong',(sent:number)=>{if(this.room===room)this.latency=Math.round(performance.now()-sent);});
    room.onDrop(()=>{if(this.room===room)void this.recover(room);});
    room.onError(()=>{if(this.room===room&&!this.reconnecting)void this.recover(room);});
    room.onLeave(()=>{if(this.room!==room||this.reconnecting)return;this.cancelVoiceRequests();this.connected=false;this.storage(room.roomId,null);this.error=lobbyExpired?LOBBY_EXPIRED_MESSAGE:'Your session has ended. Return to the lobby to join again.';this.onChange();});
  }
  private async recover(previous:Room){
    if(this.reconnecting||this.room!==previous)return;
    this.cancelVoiceRequests();
    this.connected=false;this.reconnecting=true;this.pendingShot=false;
    const generation=this.generation,token=previous.reconnectionToken,deadline=Date.now()+75000;
    previous.reconnection.enabled=false;previous.connection.close(4010,'Reconnecting');
    this.error='Connection interrupted. Reconnecting to your game…';this.onChange();
    let attempt=0;
    while(generation===this.generation&&Date.now()<deadline){
      if(navigator.onLine){
        try{const endpoint=await this.endpoint();if(generation!==this.generation)return;const room=await this.join(endpoint,c=>c.reconnect(token));if(generation!==this.generation){await room.leave();return;}this.attach(room);this.onChange();return;}catch{/* A drop can precede the server detecting it. Keep the session reserved. */}
      }
      this.error=navigator.onLine?'Reconnecting… Your place is being held.':'You are offline. Your place is being held while you reconnect.';this.onChange();
      await new Promise(r=>setTimeout(r,Math.min(3000,500+attempt++*500)));
    }
    if(generation!==this.generation)return;this.reconnecting=false;this.storage(previous.roomId,null);this.error='Could not reconnect in time. Return to the lobby to join again.';this.onChange();
  }
  private checkConnection(){if(this.room&&this.connected&&performance.now()-this.receivedAt>6000)void this.recover(this.room);}
  async leave(){
    this.cancelVoiceRequests();
    ++this.generation;const room=this.room;this.room=undefined;this.state=undefined;this.connected=false;this.reconnecting=false;this.localPaused=false;this.pendingShot=false;this.view.networkState=undefined;this.view.localSession='';this.sim.externalStep=false;this.sim.paused=false;this.role='';this.error='';
    if(room){this.storage(room.roomId,null);room.reconnection.enabled=false;void room.leave().catch(()=>{});}
    const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);this.onChange();
  }
  send(type:string,data?:unknown){if(this.connected)this.room?.send(type,data);}
  update(dt:number,input:Input,fire:boolean){
    if(!this.room)return;
    this.checkConnection();
    this.sendClock+=dt;this.pingClock+=dt;
    const inactive=this.localPaused||document.hidden||!this.connected;
    if(this.sendClock>=1/30){this.sendClock=0;this.send('input',{...(inactive?{throttle:0,steer:0,brake:false}:input),yaw:this.view.markYaw,ads:this.view.zoomed,fire:!inactive&&(fire||this.pendingShot),direction:this.view.aimDirection()});this.pendingShot=false;}
    if(this.pingClock>2){this.pingClock=0;this.send('ping',performance.now());}
    const state=this.state,p=state?.players.find(p=>p.id===this.room!.sessionId);if(!state||!p)return;
    const reset=this.role!==p.role||this.lastRound!==state.round||this.lastStage!==state.stage;
    if(this.role!==p.role){this.sim.start(true,p.role);this.role=p.role;this.view.zoomed=false;this.view.markYaw=p.markYaw;this.view.recoil=0;}
    this.lastRound=state.round;this.lastStage=state.stage;
    if(p.ammo[p.attackType]<this.sim.ammo[p.attackType])this.view.recoil=.1;
    const s=this.sim,age=Math.min(.08,(performance.now()-this.receivedAt)/1000),factor=reset?1:1-Math.exp(-dt*25),old=p.role==='marksman'?s.markEye():s.position();
    const extrapolate=p.phase==='racing'&&(state.stage==='warmup'||state.stage==='racing')?age:0;
    const target={x:p.p.x+p.v.x*extrapolate,y:p.p.y+p.v.y*extrapolate,z:p.p.z+p.v.z*extrapolate};
    const a=Math.hypot(target.x-old.x,target.y-old.y,target.z-old.z)>12?1:factor;
    const pos={x:old.x+(target.x-old.x)*a,y:old.y+(target.y-old.y)*a,z:old.z+(target.z-old.z)*a};
    if(p.role==='marksman')s.markBody?.setTranslation({...pos,y:pos.y-1.05},true);else s.body.setTranslation(pos,true);
    s.body.setLinvel(p.v,true);const dy=Math.atan2(Math.sin(p.yaw-s.yaw),Math.cos(p.yaw-s.yaw));s.yaw+=dy*a;
    Object.assign(s,{phase:p.phase,steering:p.steering,speed:p.speed,health:p.health,checkpoint:p.checkpoint,deaths:p.deaths,kills:p.kills,invulnerable:p.invulnerable,deathTimer:p.deathTimer,blastTime:p.blastTime,grounded:p.grounded,boostTime:p.boostTime,routeName:p.routeName,markMoving:p.markMoving,ammo:{...p.ammo},attackType:p.attackType,cooldown:p.cooldown,reloadTime:p.reloadTime,reloadDuration:p.reloadDuration,reloadWeapon:p.reloadWeapon,lastHit:p.lastHit,message:p.message,messageTime:p.messageTime,elapsed:state.elapsed,paused:this.localPaused,practice:true});
    s.escaped=state.players.filter(p=>p.finished>0).length;s.rockets=state.rockets.map(r=>({...r,p:{x:r.p.x+r.v.x*age,y:r.p.y+r.v.y*age,z:r.p.z+r.v.z*age}}));s.effects=state.effects.map(e=>({...e,life:Math.max(0,e.life-age)}));
    for(const b of state.barrels){const local=s.barrels[b.id];if(local){local.active=b.active;local.body.setTranslation(b.p,true);local.body.setRotation(b.q,true);}}
    this.view.networkState=state;this.view.localSession=this.room.sessionId;
  }
}
