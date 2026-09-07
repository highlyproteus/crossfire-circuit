import {ConvexHttpClient} from 'convex/browser';
import {api} from '../convex/_generated/api';
import {Client,type Room} from '@colyseus/sdk';
import type {WorldState} from '../src/network-types';
const endpoint=process.env.GAME_ENDPOINT??await new ConvexHttpClient(process.env.CONVEX_URL??'https://clever-gerbil-617.convex.cloud').query(api.servers.current,{});
if(!endpoint)throw new Error('The public game server is not available.');
const count=Number(process.env.PLAYERS??26),rooms:Room[]=[],states=new Map<string,WorldState>();
const sleep=(n:number)=>new Promise(r=>setTimeout(r,n));
const summary={endpoint,players:count,stages:[] as string[],frames:0,maxGap:0,marksmen:0,errors:[] as string[],tickRate:0};
let last=0,firstTick=0,firstTime=0;
try{
 for(let i=0;i<count;i++){const client=new Client(endpoint);const room=i?await client.joinById(rooms[0].roomId,{name:'QA Driver '+i}):await client.create('circuit',{name:'QA Leader'});rooms.push(room);room.onMessage('world',(s:WorldState)=>{states.set(room.sessionId,s);if(i===0){summary.frames++;const now=Date.now();if(last)summary.maxGap=Math.max(summary.maxGap,now-last);last=now;if(!summary.stages.includes(s.stage))summary.stages.push(s.stage);if(s.stage==='racing'){summary.marksmen=s.players.filter(p=>p.role==='marksman').length;if(!firstTime){firstTime=now;firstTick=s.tick;}else summary.tickRate=(s.tick-firstTick)/(now-firstTime)*1000;}}});room.onMessage('notice',()=>{});room.onMessage('pong',()=>{});room.onError((_c,m)=>summary.errors.push(m??'error'));}
 const timer=setInterval(()=>{for(const room of rooms){const s=states.get(room.sessionId),p=s?.players.find(p=>p.id===room.sessionId);room.send('input',{throttle:p?.role==='marksman'?0:1,steer:Math.sin(Date.now()/1500)*.15,brake:false,yaw:0,ads:false,fire:false,direction:{x:0,y:0,z:-1}});}},50);
 rooms[0].send('start');await sleep(47000);clearInterval(timer);
 console.log(JSON.stringify({...summary,room:rooms[0].roomId,uniquePlayers:states.get(rooms[0].sessionId)?.players.length,clientViews:states.size},null,2));
 if(!summary.stages.includes('countdown')||summary.marksmen!==1||states.size!==count||summary.tickRate<55)process.exitCode=1;
} catch(e){console.error(e);process.exitCode=1;}finally{for(const r of rooms)await r.leave().catch(()=>{});}
