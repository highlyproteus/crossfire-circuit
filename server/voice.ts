import {AccessToken,RoomServiceClient,TrackSource} from 'livekit-server-sdk';
import type {VoiceCredentials,VoiceReply,VoiceRequest,VoiceState} from '../src/voice-types';

export type VoiceMember={name:string;connected:boolean};
export interface VoiceService {
  credentials(room:string,identity:string,name:string):Promise<VoiceCredentials>;
  permissions(room:string,identity:string,speak:boolean):Promise<void>;
  remove(room:string,identity:string):Promise<void>;
  close(room:string):Promise<void>;
}
const notFound=(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&error.code==='not_found';
export async function issueVoiceToken(key:string,secret:string,room:string,identity:string,name:string){
  const token=new AccessToken(key,secret,{identity,name,ttl:120});
  token.addGrant({roomJoin:true,room,canSubscribe:false,canPublish:false,canPublishSources:[],canPublishData:false,canUpdateOwnMetadata:false,roomAdmin:false,roomRecord:false,roomCreate:false,roomList:false});
  return token.toJwt();
}

export class LiveKitVoiceService implements VoiceService {
  private client:RoomServiceClient;
  constructor(private url:string,private key:string,private secret:string){
    const parsed=new URL(url);
    if(parsed.protocol!=='wss:'||!parsed.hostname.endsWith('.livekit.cloud')||parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('Invalid LiveKit project URL');
    this.client=new RoomServiceClient(url.replace(/^wss:/,'https:'),key,secret,{requestTimeout:8});
  }
  async credentials(room:string,identity:string,name:string){
    await this.client.createRoom({name:room,maxParticipants:26,emptyTimeout:60,departureTimeout:30});
    // Joining alone grants no media access. The authenticated game socket must
    // activate listening, and a separate explicit action grants microphone access.
    return{url:this.url,token:await issueVoiceToken(this.key,this.secret,room,identity,name),identity,room};
  }
  async permissions(room:string,identity:string,speak:boolean){
    await this.client.updateParticipant(room,identity,{permission:{canSubscribe:true,canPublish:speak,canPublishSources:speak?[TrackSource.MICROPHONE]:[],canPublishData:false,canUpdateMetadata:false}});
  }
  async remove(room:string,identity:string){
    try{await this.client.removeParticipant(room,identity,{revokeTokenTs:BigInt(Math.ceil(Date.now()/1000))});}catch(error){if(!notFound(error))throw error;}
  }
  async close(room:string){try{await this.client.deleteRoom(room);}catch(error){if(!notFound(error))throw error;}}
}
let service:VoiceService|null|undefined;
export function configuredVoiceService():VoiceService|undefined {
  if(service!==undefined)return service??undefined;
  const {LIVEKIT_URL,LIVEKIT_API_KEY,LIVEKIT_API_SECRET}=process.env;
  service=null;
  if(LIVEKIT_URL&&LIVEKIT_API_KEY&&LIVEKIT_API_SECRET){
    try{service=new LiveKitVoiceService(LIVEKIT_URL,LIVEKIT_API_KEY,LIVEKIT_API_SECRET);}
    catch{console.error('Voice chat configuration is invalid.');}
  }
  return service??undefined;
}

class VoiceError extends Error {}
type Context={member:(identity:string)=>VoiceMember|undefined;leader:()=>string;changed:()=>void};
/** Lobby membership and moderation are checked here, never accepted from a token request. */
export class LobbyVoice {
  private muted=new Set<string>();
  private enrolled=new Set<string>();
  private queues=new Map<string,Promise<unknown>>();
  private recent=new Map<string,number>();
  private closed=false;
  readonly room:string;
  constructor(instance:string,private context:Context,private service?:VoiceService,private now=Date.now){this.room='crossfire-'+instance;}
  state():VoiceState{return{enabled:!!this.service,muted:[...this.muted]};}
  private member(identity:string){const member=this.context.member(identity);if(this.closed||!member?.connected)throw new VoiceError('Reconnect to the game before using voice chat.');return member;}
  private queue<T>(identity:string,action:()=>Promise<T>):Promise<T>{
    const previous=this.queues.get(identity)??Promise.resolve();
    const next=previous.catch(()=>{}).then(action);this.queues.set(identity,next);
    void next.finally(()=>{if(this.queues.get(identity)===next)this.queues.delete(identity);}).catch(()=>{});
    return next;
  }
  private limit(identity:string,action:VoiceRequest['action']){
    const key=identity+':'+action,now=this.now(),last=this.recent.get(key);
    const cooldown=action==='join'?5000:action==='moderate'?500:300;
    if(last!==undefined&&now-last<cooldown)throw new VoiceError('Please wait a moment before trying that voice control again.');
    this.recent.set(key,now);
  }
  async request(identity:string,data:unknown):Promise<VoiceReply|undefined>{
    if(!data||typeof data!=='object')return;
    const request=data as VoiceRequest;
    if(!Number.isSafeInteger(request.requestId)||request.requestId<0||request.requestId>1_000_000_000)return;
    const reply:VoiceReply={requestId:request.requestId,ok:false};
    try{
      this.member(identity);
      if(!this.service)throw new VoiceError('Voice chat is temporarily unavailable. You can keep playing.');
      if(!['join','activate','microphone','moderate','leave'].includes(request.action))throw new VoiceError('Invalid voice control.');
      this.limit(identity,request.action);
      if(this.queues.has(request.action==='moderate'?request.target??'':identity))throw new VoiceError('Voice controls are busy. Please try again in a moment.');
      if(request.action==='moderate'){
        if(typeof request.target!=='string'||typeof request.muted!=='boolean'||request.target===identity)throw new VoiceError('Choose another player to moderate.');
        if(this.context.leader()!==identity)throw new VoiceError('Only the lobby leader can mute someone for everyone.');
        const target=request.target;
        await this.queue(target,async()=>{
          this.member(identity);
          if(this.context.leader()!==identity||!this.context.member(target))throw new VoiceError('That player or lobby leader has changed.');
          // Clearing a leader mute never switches on somebody else's microphone.
          try{await this.service!.permissions(this.room,target,false);}catch(error){if(!notFound(error))throw error;}
          if(request.muted)this.muted.add(target);else this.muted.delete(target);
          this.context.changed();
        });
      }else if(request.action==='leave'){
        await this.remove(identity,false);
      }else{
        await this.queue(identity,async()=>{
          const member=this.member(identity);
          if(request.action==='join'){
            const credentials=await this.service!.credentials(this.room,identity,member.name);
            this.member(identity);this.enrolled.add(identity);reply.credentials=credentials;
          }else{
            if(!this.enrolled.has(identity))throw new VoiceError('Join voice chat first.');
            if(request.action==='microphone'&&typeof request.enabled!=='boolean')throw new VoiceError('Invalid microphone control.');
            const speak=request.action==='microphone'&&request.enabled===true;
            if(speak&&this.muted.has(identity))throw new VoiceError('The lobby leader has muted your microphone.');
            await this.service!.permissions(this.room,identity,speak);
          }
        });
      }
      reply.ok=true;
    }catch(error){reply.error=error instanceof VoiceError?error.message:'Voice chat could not complete that action. Please try again.';}
    return reply;
  }
  async suspend(identity:string){
    if(!this.service||!this.enrolled.has(identity))return;
    await this.queue(identity,async()=>{try{await this.service!.permissions(this.room,identity,false);}catch{/* A network drop must not interrupt the game. */}});
  }
  async remove(identity:string,departed=true){
    this.enrolled.delete(identity);
    if(departed){this.muted.delete(identity);for(const key of this.recent.keys())if(key.startsWith(identity+':'))this.recent.delete(key);}
    if(!this.service)return;
    await this.queue(identity,async()=>{this.enrolled.delete(identity);await this.service!.remove(this.room,identity);});
  }
  async dispose(){
    this.closed=true;this.enrolled.clear();
    await Promise.allSettled(this.queues.values());
    if(this.service)try{await this.service.close(this.room);}catch{console.error('Voice room cleanup is pending at the provider.');}
  }
}
