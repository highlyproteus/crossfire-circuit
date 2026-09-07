()=>{const d=window.gameDebug,s=d.sim;d.manual(true);s.start(false,'marksman');const result={};
const stage=(bot,t)=>{bot.start(true);bot.mount();bot.invulnerable=0;bot.paused=true;const p=d.center(t);bot.body.setTranslation({x:p.x,y:p.y+.97,z:p.z},true);bot.body.setLinvel({x:0,y:0,z:0},true);return bot.position();};
const aim=p=>{const e=s.markEye();return{x:p.x-e.x,y:p.y+.3-e.y,z:p.z-e.z};};
let p=stage(s.bots[0],.006);s.attackType='sniper';s.fireMarksman(aim(p));result.rifleFirst={health:s.bots[0].health,hits:s.sniperHits,cooldown:s.cooldown};result.cooldownBlocked=!s.fireMarksman(aim(p));s.cooldown=0;s.fireMarksman(aim(p));result.rifleKill={kills:s.kills,phase:s.bots[0].phase};
p=stage(s.bots[1],d.coverPositions[0]);s.cooldown=0;s.fireMarksman(aim(p));result.coverHealth=s.bots[1].health;
p=stage(s.bots[2],.006);s.cooldown=0;s.attackType='rocket';s.fireMarksman(aim(p));for(let i=0;i<300;i++)s.step({throttle:0,steer:0,brake:false});result.rocket={kills:s.kills,hits:s.rocketHits,phase:s.bots[2].phase,health:s.bots[2].health,remaining:s.rockets.length};
p=stage(s.bots[0],.006);s.cooldown=0;s.attackType='sniper';s.fireMarksman(aim(p));s.bots[0].paused=false;s.bots[0].body.setTranslation({...p,y:0},true);s.step({throttle:0,steer:0,brake:false});result.creditedFall=s.kills;
p=stage(s.bots[1],.006);s.cooldown=0;s.ammo.sniper=4;s.reloadTime=0;s.fireMarksman({x:p.x,y:p.y+1.3-s.markEye().y,z:p.z});result.helmetHit=s.bots[1].health;s.recover();result.recoverIgnored=s.phase==='racing';
s.paused=true;const before=s.elapsed,positions=s.bots.map(b=>b.position());for(let i=0;i<60;i++)s.step({throttle:0,steer:0,brake:false});result.pause={elapsedFrozen:s.elapsed===before,botsFrozen:JSON.stringify(positions)===JSON.stringify(s.bots.map(b=>b.position())),shotBlocked:!s.fireMarksman(aim(p))};
s.start(false,'marksman');result.restart={kills:s.kills,escaped:s.escaped,bots:s.bots.length};return result;}
