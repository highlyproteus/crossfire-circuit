()=>{const d=window.gameDebug,s=d.sim;d.manual(true);const result={checkpointJumps:[],slip:[]};
for(const [index,j]of d.jumps.entries()){
 s.start(true);s.mount();s.checkpoint=d.checkpoints.filter(t=>t<j.lip).length;s.spawn();let landed=false;
 for(let i=0;i<600;i++){s.step({throttle:1,steer:0,brake:false});if(s.launches&&s.grounded&&(d.closest(s.position()).t-j.lip)*d.COURSE_LENGTH>j.gap){landed=true;break;}if(s.phase==='dead')break;}
 result.checkpointJumps.push({index,landed,launches:s.launches,health:s.health,speed:s.speed,phase:s.phase});
}
for(const grip of [2.3,6.2]){s.start(true);s.mount();s.tuning.grip=grip;const f=d.frame(.015);s.yaw=f.yaw;s.body.setTranslation({...f.p,y:f.p.y+.97},true);s.body.setLinvel({x:f.forward.x*20,y:0,z:f.forward.z*20},true);for(let i=0;i<35;i++)s.step({throttle:0,steer:-.65,brake:false});const v=s.body.linvel();result.slip.push({grip,lateral:Math.abs(v.x*Math.cos(s.yaw)-v.z*Math.sin(s.yaw)),yaw:s.yaw});}s.tuning.grip=2.3;
s.start(false,'marksman');for(let i=0;i<33000;i++)s.step({throttle:0,steer:0,brake:false});result.traffic={elapsed:s.elapsed,escaped:s.escaped,bots:s.bots.map(b=>({checkpoint:b.checkpoint,deaths:b.deaths,phase:b.phase,launches:b.launches}))};return result;}
