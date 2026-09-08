import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server, type Client as ServerClient } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import RAPIER from '@dimforge/rapier3d-compat';
import { AdmissionLimits, addressKey, clientAddress, installAdmission } from './admission';
import { ArenaRoom } from './arena-room';
import { LOBBY_WAIT_MS } from '../src/lobby-policy';

test('separate join budgets, bounded creation and IPv6 network grouping',()=>{
  let now=100_000;const limiter=new AdmissionLimits(()=>now);
  assert.ok(limiter.allow('create','one'));assert.ok(limiter.allow('create','one'));
  for(let i=0;i<20;i++)assert.equal(limiter.allow('create','one'),false);
  for(let i=0;i<26;i++){assert.ok(limiter.allow('join','one'));assert.ok(limiter.allow('reconnect','one'));assert.ok(limiter.allow('socket','one'));}
  assert.ok(limiter.allow('create','two'));now+=150_000;assert.ok(limiter.allow('create','one'));assert.equal(limiter.allow('create','one'),false);
  assert.equal(addressKey('2001:db8:abcd:1::1'),addressKey('2001:db8:abcd:0001::ffff'));
  assert.notEqual(addressKey('2001:db8:abcd:2::1'),addressKey('2001:db8:abcd:1::1'));
  const request=(peer:string)=>({socket:{remoteAddress:peer},headers:{'cf-connecting-ip':'198.51.100.9','x-real-ip':'192.0.2.8'}});
  assert.equal(clientAddress(request('127.0.0.1'),false),'127.0.0.1');
  assert.equal(clientAddress(request('127.0.0.1'),true),'198.51.100.9');
  assert.equal(clientAddress(request('203.0.113.7'),true),'203.0.113.7');
});

let now=100_000;
class TimedArena extends ArenaRoom {
  protected now(){return now;}
  // Keep a real reservation while avoiding a 90-second framework timer in this test.
  allowReconnection(client:ServerClient,_seconds:number|'manual'){return super.allowReconnection(client,1);}
}
const transport=new WebSocketTransport();
const server=new Server({transport,greet:false});
const endpoint='http://127.0.0.1:2572',clients:Room[]=[];
const wait=(ms=60)=>new Promise(resolve=>setTimeout(resolve,ms));
async function join(id?:string){const c=new Client(endpoint);const room=id?await c.joinById(id,{name:'Guest'}):await c.create('circuit',{name:'Host'});room.onMessage('world',()=>{});room.onMessage('notice',()=>{});room.onMessage('pong',()=>{});room.onMessage('lobby-expired',()=>{});clients.push(room);return room;}
before(async()=>{await RAPIER.init();server.define('circuit',TimedArena);await server.listen(2572,'127.0.0.1');installAdmission(transport.server!,{limits:new AdmissionLimits(()=>now)});});
after(async()=>{for(const client of clients)if(client.connection.isOpen)try{await client.leave();}catch{}await server.gracefullyShutdown(false);});

test('actual matchmaking rejects abuse before allocating worlds and reclaims idle capacity',async()=>{
  await assert.rejects(()=>new Client(endpoint).create('circuit',{name:'x'}));
  assert.equal(ArenaRoom.active.size,0,'Invalid names must not allocate physics worlds');
  const host=await join();const arena=[...ArenaRoom.active][0];arena.setTimestep();
  const created=now;
  const denied=await fetch(endpoint+'/matchmake/create/circuit',{method:'POST',headers:{'content-type':'application/json','x-real-ip':'203.0.113.5','cf-connecting-ip':'203.0.113.6'},body:JSON.stringify({name:'Spoofed'})});
  assert.equal(denied.status,429);assert.match((await denied.json()).error,/Too many new lobbies/);assert.equal(ArenaRoom.active.size,1);
  const encoded=await fetch(endpoint+'/matchmake/%63reate/circuit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Encoded'})});assert.equal(encoded.status,429);
  const oversized=await fetch(endpoint+'/matchmake/joinById/'+host.roomId,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Guest',extra:'x'.repeat(5000)})});assert.equal(oversized.status,413);
  for(let i=1;i<26;i++)await join(host.roomId);
  assert.equal(arena.players.size,26,'One shared Wi-Fi network must fit a full lobby');
  let warned=false,expired=false,closed=false;
  host.onMessage('notice',(message:string)=>{if(message.includes('one minute'))warned=true;});
  host.onMessage('lobby-expired',()=>{expired=true;});host.onLeave(()=>{closed=true;});
  now=created+LOBBY_WAIT_MS-59_000;
  for(let i=0;i<60;i++)arena.step();await wait();assert.ok(warned);
  host.send('ping',1);host.send('input',{throttle:1,steer:0,yaw:0,direction:{x:0,y:0,z:-1}});await wait();
  const disconnected=clients[1];disconnected.reconnection.enabled=false;disconnected.connection.close(4010,'reservation test');await wait();
  now=created+LOBBY_WAIT_MS+1;
  for(let i=0;i<60;i++)arena.step();
  for(let i=0;i<30&&ArenaRoom.active.size;i++)await wait(100);
  assert.ok(expired);assert.ok(closed);assert.equal(ArenaRoom.active.size,0,'Expiry must also release reconnection reservations');
  await join();assert.equal(ArenaRoom.active.size,1,'A fresh lobby must be available after expiry');
});
