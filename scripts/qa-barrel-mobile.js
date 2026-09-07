async page=>{
 const c=await page.context().browser().newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5190/?qa=1');await p.locator('#start').tap();await p.locator('#mount').tap();
 await p.evaluate(()=>{const d=window.gameDebug,s=d.sim;d.manual(true);s.setPractice(true);for(let i=0;i<600;i++)s.world.step();const f=d.frame(d.barrelSpots.find(b=>b.stack).t);s.invulnerable=0;s.checkpoint=2;s.yaw=f.yaw;s.body.setTranslation({x:f.p.x-f.forward.x*19,y:24.97,z:f.p.z-f.forward.z*19},true);s.body.setRotation({x:0,y:Math.sin(f.yaw/2),z:0,w:Math.cos(f.yaw/2)},true);s.body.setLinvel({x:0,y:0,z:0},true);s.messageTime=0;d.view.orbit=0;for(let i=0;i<100;i++)d.view.update(s,1/60);});
 await p.screenshot({path:'output/playwright/barrel-tower-mobile.png'});
 const box=await p.locator('[data-hold=gas]').boundingBox(),cdp=await c.newCDPSession(p),touch=[{id:1,x:box.x+box.width/2,y:box.y+box.height/2}];
 await p.evaluate(()=>window.gameDebug.manual(false));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch});await p.waitForTimeout(3300);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const result=await p.evaluate(()=>{const d=window.gameDebug,s=d.sim,f=d.frame(d.barrelSpots.find(b=>b.stack).t),p=s.position();return{health:s.health,phase:s.phase,barrelHits:s.barrelHits,passedBy:(p.x-f.p.x)*f.forward.x+(p.z-f.p.z)*f.forward.z,gasReleased:!d.touch.has('gas'),...d.metrics()};});
 await p.screenshot({path:'output/playwright/barrel-tower-mobile-after.png'});
 if(!result.barrelHits||!result.gasReleased||result.health!==100||result.passedBy<1||errors.length)throw Error(JSON.stringify({result,errors}));await c.close();return {result,errors};
}
