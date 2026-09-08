import type { Effect, Input, Phase, Rocket } from './simulation';
import type { Vec } from './course';
import type { VoiceState } from './voice-types';
export type RoundPhase='lobby'|'warmup'|'countdown'|'racing'|'results';
export type PlayerState={id:string;name:string;connected:boolean;role:'driver'|'marksman';phase:Phase;p:Vec;v:Vec;yaw:number;steering:number;speed:number;health:number;checkpoint:number;progress:number;deaths:number;kills:number;finished:number;invulnerable:number;deathTimer:number;blastTime:number;grounded:boolean;boostTime:number;routeName:string;markYaw:number;markMoving:number;ammo:{sniper:number;rocket:number};attackType:'sniper'|'rocket';cooldown:number;reloadTime:number;reloadDuration:number;reloadWeapon:'sniper'|'rocket';lastHit:number;message:string;messageTime:number};
export type WorldState={roomId:string;leader:string;stage:RoundPhase;remaining:number;elapsed:number;round:number;reason:string;marksman:string;players:PlayerState[];voice?:VoiceState;barrels:{id:number;p:Vec;q:{x:number;y:number;z:number;w:number};active:boolean;explosive:boolean}[];effects:Effect[];rockets:Rocket[];tick:number};
export type PlayerInput=Input&{yaw:number;ads:boolean;fire:boolean;direction:Vec};
