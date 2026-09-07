async(page)=>{
  await page.reload();
  await page.getByRole('button',{name:'RIDE THE CIRCUIT'}).click();
  await page.keyboard.press('e');
  await page.evaluate(()=>{window.controlQA={keyboard:{},assets:{}};});
  for(const key of ['a','d']){
    await page.evaluate(()=>{const d=window.gameDebug;d.manual(false);d.sim.start(true);d.sim.mount();window.startYaw=d.sim.yaw;window.startPosition={...d.sim.position()};});
    await page.keyboard.down('w');await page.waitForTimeout(600);
    await page.keyboard.down(key);await page.waitForTimeout(300);
    await page.evaluate(key=>{const d=window.gameDebug;window.controlQA.keyboard[key]={yawDelta:d.sim.yaw-window.startYaw,speed:d.sim.speed,position:d.sim.position(),start:window.startPosition,wheelSteering:d.view.vehicle.wheels[0].rotation.y,wheelSpin:d.view.vehicle.wheels[0].children[0].rotation.x};},key);
    await page.keyboard.up(key);await page.keyboard.up('w');
  }
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    const d=window.gameDebug;window.controlQA.pause=d.sim.paused;
    let bones=0,skinned=0;d.view.vehicle.rider.traverse(o=>{if(o.isBone)bones++;if(o.isSkinnedMesh)skinned++;});
    window.controlQA.assets={requests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/models/')&&r.name.endsWith('.glb')).map(r=>({url:r.name,bytes:r.transferSize})),bones,skinned,wheels:d.view.vehicle.wheels.length,riderScale:d.view.vehicle.rider.scale.x,metrics:d.metrics()};
  });
  await page.setViewportSize({width:390,height:844});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{const d=window.gameDebug;d.sim.start(true);d.sim.mount();d.manual(false);window.startYaw=d.sim.yaw;});
  await page.keyboard.down('w');await page.waitForTimeout(600);
  const right=page.getByRole('button',{name:'Steer right',exact:true});
  const box=await right.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(300);
  await page.evaluate(()=>{window.controlQA.touchRight={yawDelta:window.gameDebug.sim.yaw-window.startYaw};});
  await page.mouse.up();await page.keyboard.up('w');
  await page.setViewportSize({width:1200,height:758});
  await page.evaluate(()=>{const d=window.gameDebug;d.manual(true);d.sim.start(true);d.sim.mount();d.advance(60,{throttle:0,steer:0,brake:false});});
}
