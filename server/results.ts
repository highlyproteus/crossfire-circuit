import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import type { WorldState } from '../src/network-types';
const directory=process.env.RESULTS_DIR??'work/result-outbox';
const client=process.env.CONVEX_URL?new ConvexHttpClient(process.env.CONVEX_URL):undefined;
let flushing=false;
export async function queueResult(key:string,state:WorldState){
 if(!client||!process.env.GAME_SERVER_SECRET)return;
 const data={key,room:state.roomId,round:state.round,ended:Date.now(),reason:state.reason,players:state.players.map(p=>({name:p.name,role:p.role,finished:p.finished,checkpoint:p.checkpoint,deaths:p.deaths,kills:p.kills}))};
 try{await mkdir(directory,{recursive:true,mode:0o700});const file=path.join(directory,key+'.json');await writeFile(file+'.tmp',JSON.stringify(data),{mode:0o600});await rename(file+'.tmp',file);await flushResults();}catch{console.error('Match result pending: could not write or flush outbox');}
}
export async function flushResults(){if(flushing||!client||!process.env.GAME_SERVER_SECRET)return;flushing=true;try{await mkdir(directory,{recursive:true,mode:0o700});for(const file of (await readdir(directory)).filter(n=>n.endsWith('.json')).slice(0,20)){const filename=path.join(directory,file),data=JSON.parse(await readFile(filename,'utf8'));await client.mutation(api.results.record,{...data,secret:process.env.GAME_SERVER_SECRET});await unlink(filename);}}catch{console.error('Convex result save unavailable; retrying from durable outbox');}finally{flushing=false;}}
