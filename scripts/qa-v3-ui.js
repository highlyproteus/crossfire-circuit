async(page)=>{
 await page.setViewportSize({width:1280,height:800});await page.reload();await page.locator('#start-marksman').click();
 await page.waitForFunction(()=>window.gameDebug.gameAudio.ready);await page.keyboard.press('KeyV');
 await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');
 await page.evaluate(()=>{const d=window.gameDebug;window.featureUI={moved:d.sim.markEye(),thirdPerson:d.view.thirdPerson,audio:d.gameAudio.diagnostics()};d.manual(true);d.sim.bots.forEach(b=>b.paused=true);});
 await page.screenshot({path:'marksman-roaming.png'});
 await page.keyboard.press('ShiftLeft');await page.waitForTimeout(80);
 await page.evaluate(()=>{const d=window.gameDebug;window.featureUI.shift={zoom:d.view.zoomed,fov:d.view.camera.fov};});
 await page.keyboard.press('ShiftLeft');await page.keyboard.press('KeyV');await page.mouse.down();await page.mouse.up();await page.keyboard.press('KeyR');
 await page.evaluate(()=>window.gameDebug.advance(40,{throttle:0,steer:0,brake:false}));await page.waitForTimeout(80);
 await page.evaluate(()=>{const d=window.gameDebug;window.featureUI.reload={time:d.sim.reloadTime,rotation:d.view.fpsRig.rotation.z,magazine:d.view.magazine.visible};});
 await page.screenshot({path:'reload-preview.png'});
 await page.evaluate(()=>window.gameDebug.advance(100,{throttle:0,steer:0,brake:false}));
 await page.keyboard.press('Escape');await page.locator('#exit-mode').click();await page.locator('#practice-start').check();await page.locator('#start').click();await page.keyboard.press('KeyE');
 await page.evaluate(()=>{const d=window.gameDebug,s=d.sim;d.manual(true);const f=d.frame(d.boosts[2].t-8/d.COURSE_LENGTH);d.view.cameraReady=false;s.yaw=f.yaw;s.body.setTranslation({...f.p,y:25},true);s.body.setLinvel({x:f.forward.x*25,y:0,z:f.forward.z*25},true);d.advance(30,{throttle:1,steer:0,brake:false});});await page.waitForTimeout(500);
 await page.screenshot({path:'boost-preview.png'});
}
