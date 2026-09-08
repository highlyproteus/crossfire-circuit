import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import RAPIER from '@dimforge/rapier3d-compat';
import {ArenaRoom} from './arena-room';
import type {VoiceService} from './voice';
import type {VoiceReply,VoiceRequest} from '../src/voice-types';
const calls:{room:string;identity:string;speak?:boolean}[]=[];
const service:VoiceService={
  async credentials(room,identity,name){calls.push({room,identity});return{url:'wss://test.livekit.cloud',token:'test-only-'+name,room,identity};},
  async permissions(room,identity,speak){calls.push({room,identity,speak});},
  async remove(){},async close(){},
};
class VoiceArena extends ArenaRoom {protected voiceService(){return service;}}
const server=new Server({transport:new WebSocketTransport(),greet:false});
const clients:Room[]=[],messages=new Map<Room,VoiceReply[]>();let sequence=0;
before(async()=>{await RAPIER.init();server.define('circuit',VoiceArena);await server.listen(2574,'127.0.0.1');});
after(async()=>{for(const room of clients)await room.leave();await server.gracefullyShutdown(false);});
async function join(name:string,id?:string){const c=new Client('http://127.0.0.1:2574');const r=id?await c.joinById(id,{name}):await c.create('circuit',{name});clients.push(r);messages.set(r,[]);r.onMessage('world',()=>{});r.onMessage('notice',()=>{});r.onMessage('voice-reply',(v:VoiceReply)=>messages.get(r)!.push(v));return r;}
async function rpc(room:Room,action:VoiceRequest['action'],data:Partial<VoiceRequest>={}){
  const requestId=++sequence;room.send('voice',{requestId,action,...data});
  for(let i=0;i<100;i++){const reply=messages.get(room)!.find(r=>r.requestId===requestId);if(reply)return reply;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Voice RPC did not reply');
}
test('real game sockets scope private voice replies and leader moderation to their own lobby',async()=>{
  const host=await join('Host'),guest=await join('Guest',host.roomId),other=await join('Other lobby');
  const reply=await rpc(guest,'join',{target:host.sessionId});assert.ok(reply.ok);assert.equal(reply.credentials?.identity,guest.sessionId);
  assert.equal(messages.get(host)!.length,0,'Credentials must never be broadcast to the lobby');assert.equal(messages.get(other)!.length,0);
  const otherReply=await rpc(other,'join');assert.notEqual(otherReply.credentials?.room,reply.credentials?.room);
  assert.ok((await rpc(guest,'activate')).ok);assert.ok((await rpc(guest,'microphone',{enabled:true})).ok);
  assert.equal((await rpc(other,'moderate',{target:guest.sessionId,muted:true})).ok,false,'Another lobby leader cannot moderate this lobby');
  assert.equal((await rpc(guest,'moderate',{target:host.sessionId,muted:true})).ok,false);
  assert.ok((await rpc(host,'moderate',{target:guest.sessionId,muted:true})).ok);
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal((await rpc(guest,'microphone',{enabled:true})).ok,false);assert.equal(calls.at(-1)?.speak,false);
});
