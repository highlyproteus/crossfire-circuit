() => {
  const d=window.gameDebug,s=d.sim;
  d.manual(true);
  const zero={throttle:0,steer:0,brake:false};
  function drive(limit=7000,stopCheckpoint=4){
    let airborne=0;
    for(let i=0;i<limit&&s.phase!=="finished"&&s.checkpoint<stopCheckpoint;i++){
      const p=s.position();let best=Infinity,t=0;
      for(let j=0;j<240;j++){const c=d.center(j/240),dist=Math.hypot(c.x-p.x,c.z-p.z);if(dist<best){best=dist;t=j/240;}}
      const f=d.frame(t+.014),target=Math.atan2(f.p.x-p.x,f.p.z-p.z);
      const diff=Math.atan2(Math.sin(target-s.yaw),Math.cos(target-s.yaw));
      s.step({throttle:t>.4&&t<.47?1:.64,steer:Math.max(-1,Math.min(1,-diff*1.4)),brake:false});
      if(!s.grounded)airborne++;
    }
    return {state:s.snapshot(),airborne};
  }
  const results={};
  s.start(true);s.mount();results.practiceLap=drive();
  s.start(true);s.mount();drive(1500,1);
  const saved=s.checkpoint;
  for(let i=0;i<1000&&s.deaths===0;i++)s.step({throttle:1,steer:1,brake:false});
  results.fall={deaths:s.deaths,phase:s.phase,savedCheckpoint:saved};
  for(let i=0;i<80;i++)s.step(zero);
  results.respawn=s.snapshot();
  s.invulnerable=0;const p=s.position();s.explode({x:p.x-2,y:p.y+.2,z:p.z});
  results.blast={health:s.health,velocity:s.body.linvel(),hits:s.rocketHits};
  s.hit(110,"QA lethal hit");results.lethal={phase:s.phase,deaths:s.deaths};
  for(let i=0;i<80;i++)s.step(zero);
  const before=s.snapshot();s.paused=true;for(let i=0;i<120;i++)s.step({throttle:1,steer:1,brake:false});
  results.pause={before,after:s.snapshot()};s.paused=false;
  const cover=d.center(.084),open=d.center(.2);
  results.sightlines={coverBlocked:!s.lineClear(s.source,{x:cover.x,y:cover.y+1,z:cover.z}),openClear:s.lineClear(s.source,{x:open.x,y:open.y+1,z:open.z})};
  s.start(false);s.mount();for(let i=0;i<1500;i++)s.step(zero);results.stationaryAttacks=s.snapshot();
  s.start(false);s.mount();results.liveLap=drive();
  s.start(true);s.mount();d.advance(60,zero);d.manual(false);
  results.metrics=d.metrics();
  return results;
}
