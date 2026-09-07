// Exercise Funnel's public ingress even from a Mac joined to this tailnet.
import dns from 'node:dns';
const hostname='hive3-standalone.barracuda-nessie.ts.net';
const resolver=new dns.promises.Resolver();resolver.setServers(['1.1.1.1']);
const addresses=await resolver.resolve4(hostname);const lookup=dns.lookup;
(dns as unknown as {lookup:Function}).lookup=(host:string,options:any,callback:any)=>{if(host!==hostname)return (lookup as Function)(host,options,callback);const cb=typeof options==='function'?options:callback;if(options?.all)cb(null,addresses.map(address=>({address,family:4})));else cb(null,addresses[0],4);};
console.log('Testing through public Funnel ingress:',addresses.join(', '));
await import('./qa-public-load');
