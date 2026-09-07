() => {
const d=window.gameDebug,s=d.sim;d.manual(true);const zero={throttle:0,steer:0,brake:false},result={length:d.COURSE_LENGTH,checkpoints:d.checkpoints,jumps:[]};
for(const [index,j]of d.jumps.entries())for(const speed of [15,22,27]){
 s.start(true);s.mount();s.checkpoint=d.checkpoints.filter(t=>t<j.lip).length;
 const t=j.lip-20/d.COURSE_LENGTH,f=d.frame(t);s.yaw=f.yaw;s.body.setTranslation({x:f.p.x,y:f.p.y+.97,z:f.p.z},true);s.body.setLinvel({x:f.forward.x*speed,y:0,z:f.forward.z*speed},true);
 let maxY=0,landing=null,launchedSpeed=0;
 for(let i=0;i<240;i++){s.step({throttle:speed===27?1:speed*.32/17,steer:0,brake:false});maxY=Math.max(maxY,s.position().y);if(s.launches&&!launchedSpeed)launchedSpeed=s.speed;if(s.launches&&s.grounded&&((d.closest(s.position()).t-j.lip)*d.COURSE_LENGTH)>j.gap){landing={frame:i,speed:s.speed};break;}if(s.phase==='dead')break;}
 result.jumps.push({index,speed,launchedSpeed,launches:s.launches,landing,maxY,phase:s.phase,position:s.position(),distance:(d.closest(s.position()).t-j.lip)*d.COURSE_LENGTH});
}
s.start(true);s.mount();const milestones=[];let prev=0,deaths=0;
for(let i=0;i<42000&&s.phase!=='finished';i++){s.step(d.driveAI(s));if(s.checkpoint!==prev){prev=s.checkpoint;milestones.push({frame:i,checkpoint:prev,deaths:s.deaths});}if(s.deaths!==deaths){deaths=s.deaths;if(deaths<8)milestones.push({frame:i,death:deaths,t:d.closest(s.position()).t,p:s.position()});}}
result.ai={snapshot:s.snapshot(),milestones};s.start(true);s.mount();d.advance(60,zero);return result;
}
