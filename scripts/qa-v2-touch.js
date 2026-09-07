async(page)=>{
 await page.reload();await page.setViewportSize({width:390,height:844});
 const client=await page.context().newCDPSession(page);await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const touch=async(type,x,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1,radiusX:1,radiusY:1}]});
 const tap=async(locator)=>{const b=await locator.boundingBox();await touch('touchStart',b.x+b.width/2,b.y+b.height/2);await touch('touchEnd',0,0);};
 await tap(page.getByRole('button',{name:'PLAY AS MARKSMAN'}));await page.waitForFunction(()=>window.gameDebug.sim.role==='marksman');
 await page.evaluate(()=>{window.gameDebug.manual(true);window.touchQA={yaw:window.gameDebug.view.markYaw,pitch:window.gameDebug.view.markPitch,locked:!!document.pointerLockElement};});
 await touch('touchStart',100,250);await touch('touchMove',160,280);await touch('touchEnd',0,0);
 const fire=await page.getByRole('button',{name:'Fire weapon'}).boundingBox();await touch('touchStart',fire.x+35,fire.y+35);await page.waitForTimeout(120);await touch('touchEnd',0,0);
 await tap(page.getByRole('button',{name:'SCOPE',exact:true}));
 await page.evaluate(()=>{const d=window.gameDebug;Object.assign(window.touchQA,{yawDelta:d.view.markYaw-window.touchQA.yaw,pitchDelta:d.view.markPitch-window.touchQA.pitch,shots:d.sim.shots,zoom:d.view.zoomed});});
 await tap(page.getByRole('button',{name:'2 · ROCKETS'}));await page.evaluate(()=>{window.touchQA.weapon=window.gameDebug.sim.attackType;});
}
