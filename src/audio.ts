import type {Simulation} from './simulation';
const names=['music','engine','rifle','rocket','explosion','boost','reload','barrel','checkpoint'] as const;
export class GameAudio {
 enabled=false;started=false;ready=false;error='';musicVolume=.22;sfxVolume=.7;
 private context?:AudioContext;private master?:GainNode;private musicGain?:GainNode;private engineGain?:GainNode;private engine?:AudioBufferSourceNode;
 private buffers=new Map<string,AudioBuffer>();private loading?:Promise<void>;private lastEvent=0;private active=0;
 async enable(value:boolean){this.enabled=value;this.started=true;
  if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();const limiter=this.context.createDynamicsCompressor();this.master.connect(limiter).connect(this.context.destination);this.loading=this.load();}
  await this.context.resume();this.master!.gain.setTargetAtTime(value?1:0,this.context.currentTime,.08);await this.loading;
 }
 private async load(){try{const ctx=this.context!;await Promise.all(names.map(async name=>{const r=await fetch('/audio/'+name+'.mp3');if(!r.ok)throw new Error(name+' unavailable');this.buffers.set(name,await ctx.decodeAudioData(await r.arrayBuffer()));}));
  this.musicGain=ctx.createGain();this.musicGain.gain.value=0;this.musicGain.connect(this.master!);const music=ctx.createBufferSource();music.buffer=this.buffers.get('music')!;music.loop=true;music.connect(this.musicGain);music.start();
  this.engineGain=ctx.createGain();this.engineGain.gain.value=0;this.engineGain.connect(this.master!);this.engine=ctx.createBufferSource();this.engine.buffer=this.buffers.get('engine')!;this.engine.loop=true;this.engine.connect(this.engineGain);this.engine.start();this.ready=true;
 }catch(error){this.error=String(error);console.warn('Game audio:',this.error);}}
 play(name:string,volume=1,rate=1){if(!this.enabled||!this.ready||this.active>=12)return;const buffer=this.buffers.get(name);if(!buffer)return;const ctx=this.context!,source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume*this.sfxVolume;source.connect(gain).connect(this.master!);this.active++;source.onended=()=>{source.disconnect();gain.disconnect();this.active--;};source.start();}
 update(sim:Simulation){if(this.context&&this.ready){const running=sim.phase==='racing'&&!sim.paused,now=this.context.currentTime;this.musicGain!.gain.setTargetAtTime(running?this.musicVolume:0,now,.3);this.engineGain!.gain.setTargetAtTime(running&&sim.role==='driver'?.17*this.sfxVolume:0,now,.12);this.engine!.playbackRate.setTargetAtTime(.6+Math.abs(sim.speed)/30,now,.12);}
  for(const e of sim.effects)if(e.id>this.lastEvent){this.lastEvent=e.id;const sound={shot:'rifle',rocket:'rocket',blast:'explosion',boost:'boost',barrel:'barrel',reload:'reload',checkpoint:'checkpoint',death:''}[e.type];if(sound)this.play(sound,sim.role==='marksman'&&e.type==='blast'?.6:1,e.type==='reload'?2.4/sim.reloadDuration:1);}
 }
 diagnostics(){return{enabled:this.enabled,ready:this.ready,error:this.error,loaded:[...this.buffers.keys()]};}
}
