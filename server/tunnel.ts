import {spawn} from 'node:child_process';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '../convex/_generated/api';
if(!process.env.CONVEX_URL||!process.env.GAME_SERVER_SECRET)throw new Error('Server discovery credentials missing');
const client=new ConvexHttpClient(process.env.CONVEX_URL);
const child=spawn('/usr/local/bin/cloudflared',['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:2567'],{stdio:['ignore','ignore','pipe']});
let endpoint='',buffer='',busy=false,ready=false;
async function publish(){if(!endpoint||!ready||busy)return;busy=true;try{const response=await fetch('http://127.0.0.1:2567/health',{signal:AbortSignal.timeout(8000)});if(!response.ok)return;await client.mutation(api.servers.publish,{secret:process.env.GAME_SERVER_SECRET!,endpoint});}catch{console.error('Server discovery refresh pending');}finally{busy=false;}}
child.stderr.on('data',(chunk:Buffer)=>{buffer=(buffer+chunk.toString()).slice(-6000);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!endpoint){endpoint=match[0];console.log('Public game tunnel: '+endpoint);void publish();}if(chunk.toString().includes('Registered tunnel connection')){ready=true;void publish();}});
setInterval(()=>void publish(),15000).unref();
child.on('exit',()=>process.exit(1));
process.on('SIGTERM',()=>{child.kill('SIGTERM');setTimeout(()=>process.exit(0),1000).unref();});
