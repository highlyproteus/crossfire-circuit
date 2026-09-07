async(page)=>{
 const client=await page.context().newCDPSession(page);
 await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await page.setViewportSize({width:1200,height:758});await page.reload();
 await page.getByRole('button',{name:'RIDE THE CIRCUIT'}).waitFor();
 await page.locator('#practice-start').check();await page.locator('#start').click();
 await page.keyboard.press('KeyE');await page.keyboard.down('KeyW');await page.waitForTimeout(900);await page.keyboard.up('KeyW');
 await page.evaluate(()=>{const d=window.gameDebug;d.manual(true);window.uiQA={driver:d.sim.snapshot(),metrics:d.metrics()};});
 await page.screenshot({path:'wide-track-preview.png'});
 await page.keyboard.press('Escape');await page.locator('#exit-mode').click();await page.locator('#start-marksman').click();
 await page.evaluate(()=>{
  const d=window.gameDebug,s=d.sim,b=s.bots[0];b.paused=true;b.invulnerable=0;
  const p=b.position(),dx=p.x,dy=p.y+.3-35.8,dz=p.z;
  d.view.markYaw=Math.atan2(-dx,-dz);d.view.markPitch=Math.atan2(dy,Math.hypot(dx,dz));
 });
 await page.mouse.down({button:'right'});await page.waitForTimeout(100);
 await page.mouse.click(600,379);await page.waitForTimeout(100);
 await page.evaluate(()=>{const d=window.gameDebug;window.uiQA.scoped={locked:document.pointerLockElement?.id,zoom:d.view.zoomed,fov:d.view.camera.fov,shots:d.sim.shots,targetHealth:d.sim.bots[0].health};});
 await page.screenshot({path:'marksman-preview.png'});
 await page.mouse.up({button:'right'});await page.keyboard.press('Digit2');await page.keyboard.press('Escape');
 await page.evaluate(()=>{const d=window.gameDebug;window.uiQA.pause={paused:d.sim.paused,unlocked:!document.pointerLockElement,weapon:d.sim.attackType};});
}
