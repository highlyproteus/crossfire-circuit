import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TokenVerifier} from 'livekit-server-sdk';
import {LobbyVoice,issueVoiceToken,type VoiceMember,type VoiceService} from './voice';
import type {VoiceCredentials,VoiceRequest} from '../src/voice-types';

class FakeVoiceService implements VoiceService {
  calls:{method:string;room:string;identity?:string;name?:string;speak?:boolean}[]=[];
  fail=false;gate?:Promise<void>;
  async credentials(room:string,identity:string,name:string):Promise<VoiceCredentials>{this.calls.push({method:'token',room,identity,name});await this.gate;if(this.fail)throw new Error('provider-private-detail');return{url:'wss://test.livekit.cloud',token:'synthetic-token',room,identity};}
  async permissions(room:string,identity:string,speak:boolean){this.calls.push({method:'permissions',room,identity,speak});if(this.fail)throw new Error('provider-private-detail');}
  async remove(room:string,identity:string){this.calls.push({method:'remove',room,identity});}
  async close(room:string){this.calls.push({method:'close',room});}
}
function fixture(){
  const members=new Map<string,VoiceMember>([['host',{name:'Host',connected:true}],['guest',{name:'Guest',connected:true}]]);
  let leader='host',now=10000,requestId=0;const service=new FakeVoiceService();
  const voice=new LobbyVoice('one',{member:id=>members.get(id),leader:()=>leader,changed:()=>{}},service,()=>now);
  const request=(identity:string,action:VoiceRequest['action'],extra:Partial<VoiceRequest>={})=>{now+=6000;return voice.request(identity,{requestId:++requestId,action,...extra});};
  return{voice,service,members,request,leader:(value:string)=>leader=value};
}
test('voice tokens are short-lived, bound to one game identity and grant no initial media or administration',async()=>{
  const key='unit-test-key',secret='unit-test-only-not-a-production-credential';
  const token=await issueVoiceToken(key,secret,'crossfire-one','guest','Guest');
  const decoded=await new TokenVerifier(key,secret).verify(token);
  assert.equal(decoded.sub,'guest');assert.equal(decoded.name,'Guest');assert.equal(decoded.video?.room,'crossfire-one');assert.equal(decoded.video?.roomJoin,true);
  for(const grant of ['canPublish','canSubscribe','canPublishData','roomAdmin','roomRecord','roomCreate','roomList','canUpdateOwnMetadata'] as const)assert.equal(decoded.video?.[grant],false,grant);
  assert.ok((decoded.exp??0)-(decoded.nbf??0)<=120);
  await assert.rejects(()=>new TokenVerifier(key,'a-different-test-only-credential').verify(token));
});
test('game membership, identity and leader role control voice grants and mutes',async()=>{
  const f=fixture();assert.equal((await f.request('outsider','join'))?.ok,false);assert.equal(f.service.calls.length,0);
  assert.equal((await f.request('guest','activate'))?.ok,false);
  const reply=await f.request('guest','join',{target:'host'});assert.equal(reply?.credentials?.identity,'guest');assert.equal(reply?.credentials?.room,'crossfire-one');assert.equal(f.service.calls.at(-1)?.name,'Guest');
  assert.ok((await f.request('guest','activate'))?.ok);assert.equal(f.service.calls.at(-1)?.speak,false);
  assert.ok((await f.request('guest','microphone',{enabled:true}))?.ok);assert.equal(f.service.calls.at(-1)?.speak,true);
  assert.equal((await f.request('guest','moderate',{target:'host',muted:true}))?.ok,false);
  assert.ok((await f.request('host','moderate',{target:'guest',muted:true}))?.ok);assert.equal(f.service.calls.at(-1)?.speak,false);assert.deepEqual(f.voice.state().muted,['guest']);
  const count=f.service.calls.length;assert.equal((await f.request('guest','microphone',{enabled:true}))?.ok,false);assert.equal(f.service.calls.length,count);
  await f.request('guest','leave');await f.request('guest','join');await f.request('guest','activate');assert.equal((await f.request('guest','microphone',{enabled:true}))?.ok,false,'Rejoining voice must not undo a leader mute');
  assert.ok((await f.request('host','moderate',{target:'guest',muted:false}))?.ok);assert.equal(f.service.calls.at(-1)?.speak,false,'Allowing a mic must not turn it on');
  assert.ok((await f.request('guest','microphone',{enabled:true}))?.ok);
  f.leader('guest');assert.equal((await f.request('host','moderate',{target:'guest',muted:true}))?.ok,false,'Former leader loses moderation');
  f.members.get('guest')!.connected=false;await f.voice.suspend('guest');assert.equal(f.service.calls.at(-1)?.speak,false);assert.equal((await f.request('guest','microphone',{enabled:true}))?.ok,false);
  await f.voice.remove('guest');assert.equal(f.service.calls.at(-1)?.method,'remove');await f.voice.dispose();assert.equal(f.service.calls.at(-1)?.method,'close');
});
test('expired membership and concurrent requests cannot activate stale media access',async()=>{
  const f=fixture();let release!:()=>void;f.service.gate=new Promise(resolve=>release=resolve);
  const first=f.request('guest','join');await Promise.resolve();
  assert.equal((await f.request('guest','join'))?.ok,false,'Only one provider operation may be queued per player');
  f.members.delete('guest');release();const reply=await first;assert.equal(reply?.ok,false);assert.equal(reply?.credentials,undefined);
  await f.voice.dispose();assert.equal(f.service.calls.filter(c=>c.method==='token').length,1);
});
test('unavailable provider, malformed controls and cross-lobby targets fail without exposing details',async()=>{
  const f=fixture();assert.equal(await f.voice.request('host',{requestId:NaN,action:'join'}),undefined);
  assert.equal((await f.request('host','moderate',{target:'another-lobby-player',muted:true}))?.ok,false);assert.equal(f.service.calls.length,0);
  f.service.fail=true;const reply=await f.request('host','join');assert.equal(reply?.ok,false);assert.ok(!reply?.error?.includes('provider-private-detail'));
  const disabled=new LobbyVoice('disabled',{member:()=>({name:'Guest',connected:true}),leader:()=>'',changed:()=>{}});
  assert.equal(disabled.state().enabled,false);assert.equal((await disabled.request('guest',{requestId:1,action:'join'}))?.ok,false);
});
