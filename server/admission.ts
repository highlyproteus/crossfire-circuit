import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { isIP } from 'node:net';

type Budget = { tokens:number; at:number };
// A shared Wi-Fi group can join/reconnect together. Creating worlds is much stricter.
const policies = { create:[2,300_000], join:[120,60_000], reconnect:[180,60_000], socket:[240,60_000] } as const;
type Kind = keyof typeof policies;
const loopback = (ip:string) => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
export function addressKey(ip:string):string {
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7))===4) return ip.slice(7);
  if (isIP(ip)!==6) return isIP(ip)===4 ? ip : 'unknown';
  // Count an IPv6 /64 together so rotating interface addresses cannot evade limits.
  const [left,right=''] = ip.toLowerCase().split('::');
  const a=left?left.split(':'):[], b=right?right.split(':'):[];
  const full=ip.includes('::')?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a;
  return full.slice(0,4).map(part=>parseInt(part,16).toString(16)).join(':')+'::/64';
}
export function clientAddress(req:{socket:{remoteAddress?:string};headers:IncomingMessage['headers']},trustCloudflare:boolean):string {
  const peer=req.socket.remoteAddress??'';
  const forwarded=req.headers['cf-connecting-ip'];
  // The production origin only accepts a local, dedicated Cloudflare connector.
  return addressKey(trustCloudflare&&loopback(peer)&&typeof forwarded==='string'&&isIP(forwarded) ? forwarded : peer);
}
export class AdmissionLimits {
  private budgets=new Map<string,Budget>();
  private swept=0;
  constructor(private now=Date.now){}
  allow(kind:Kind,address:string):boolean {
    const now=this.now(),[capacity,window]=policies[kind],key=kind+':'+address;
    if(now-this.swept>60_000){for(const [key,budget] of this.budgets)if(now-budget.at>=300_000)this.budgets.delete(key);this.swept=now;}
    let budget=this.budgets.get(key);
    if(!budget){if(this.budgets.size>=20_000)return false;budget={tokens:capacity,at:now};this.budgets.set(key,budget);}
    budget.tokens=Math.min(capacity,budget.tokens+(now-budget.at)*capacity/window);budget.at=now;
    if(budget.tokens<1)return false;
    budget.tokens--;return true;
  }
}

/** Install after Colyseus binds its routes: its router bypasses Express middleware. */
export function installAdmission(server:HttpServer,options:{trustCloudflare?:boolean;limits?:AdmissionLimits}={}) {
  const limits=options.limits??new AdmissionLimits();
  const requests=server.listeners('request'),upgrades=server.listeners('upgrade');
  server.removeAllListeners('request');server.removeAllListeners('upgrade');
  server.requestTimeout=15_000;server.headersTimeout=10_000;
  const reject=(req:IncomingMessage,res:ServerResponse,status:number,message:string)=>{
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':req.headers.origin??'*','Retry-After':status===429?'150':'0','Connection':'close'});
    res.end(JSON.stringify({code:status,error:message}));
  };
  server.on('request',(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    let route:string;
    try{route=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname).replace(/\/{2,}/g,'/');}
    catch{reject(req,res,400,'Invalid lobby request.');return;}
    if(req.method==='POST' && route.startsWith('/matchmake/')){
      const method=route.split('/')[2];
      const kind:Kind=method==='create'||method==='joinOrCreate'?'create':method==='reconnect'?'reconnect':'join';
      if(!limits.allow(kind,clientAddress(req,options.trustCloudflare===true))){reject(req,res,429,kind==='create'?'Too many new lobbies. Please wait a few minutes or join an existing invite.':'Too many join attempts. Please wait a moment and try again.');return;}
      if(Number(req.headers['content-length'])>4096){reject(req,res,413,'Lobby request is too large.');return;}
      let size=0;
      req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>4096){if(!res.headersSent)reject(req,res,413,'Lobby request is too large.');req.destroy();}});
    }
    for(const listener of requests)listener.call(server,req,res);
  });
  server.on('upgrade',(req,socket,head)=>{
    if(!limits.allow('socket',clientAddress(req,options.trustCloudflare===true))){socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;}
    for(const listener of upgrades)listener.call(server,req,socket,head);
  });
}
