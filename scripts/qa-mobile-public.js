async page=>{
const browser=page.context().browser();const mobileContext=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await mobileContext.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewportSize({width:844,height:390});await p.goto('https://crossfire-circuit.vercel.app/?qa=1');await p.locator('#online').click();await p.locator('#player-name').fill('Mobile Pilot');await p.locator('#join-lobby').click();await p.waitForFunction(()=>window.gameDebug?.multiplayer.state?.players.length===1);
const roomId=await p.evaluate(()=>window.gameDebug.multiplayer.room.roomId);const originalId=await p.evaluate(()=>window.gameDebug.multiplayer.room.sessionId);
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true}),guest=await context.newPage();await guest.goto('https://crossfire-circuit.vercel.app/?qa=1&room='+roomId);await guest.locator('#player-name').fill('Desktop Pilot');await guest.locator('#join-lobby').click();await guest.waitForFunction(()=>window.gameDebug?.multiplayer.state?.players.length===2);await p.bringToFront();await p.locator('#launch-round').click();await p.waitForFunction(()=>window.gameDebug.multiplayer.state.stage==='warmup');if(await p.locator('#pause-panel').isVisible())await p.locator('#resume').tap();
await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-public-warmup.png'});
await p.waitForFunction(()=>window.gameDebug.multiplayer.state.stage==='racing',null,{timeout:42000});

// Both public clients use real touch events, whichever one is randomly assigned.
await p.waitForTimeout(4000);
const mark=await p.evaluate(()=>window.gameDebug.sim.role==='marksman')?p:guest;const driver=mark===p?guest:p;
await driver.bringToFront();if(await driver.locator('#pause-panel').isVisible())await driver.locator('#resume').tap();const dcdp=await driver.context().newCDPSession(driver);const gas=await driver.locator('[data-hold=gas]').boundingBox();const stick=await driver.locator('#touch-stick').boundingBox();
await dcdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:stick.x+stick.width/2+14,y:stick.y+stick.height/2},{id:2,x:gas.x+gas.width/2,y:gas.y+gas.height/2}]});await driver.waitForTimeout(800);const drive=await driver.evaluate(()=>({speed:window.gameDebug.sim.speed,steer:window.gameDebug.readInput().steer}));await dcdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await dcdp.detach();if(drive.speed<2||drive.steer<=0)throw Error('Public touch driving failed');
await mark.bringToFront();if(await mark.locator('#pause-panel').isVisible())await mark.locator('#resume').tap();const mcdp=await mark.context().newCDPSession(mark),move=await mark.locator('#touch-stick').boundingBox();const markBefore=await mark.evaluate(()=>window.gameDebug.sim.markEye());await mcdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:3,x:move.x+move.width/2,y:move.y+move.height/2-30}]});await mark.waitForTimeout(500);await mcdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const markAfter=await mark.evaluate(()=>window.gameDebug.sim.markEye());await mcdp.detach();
await mark.locator('#mobile-ads').tap();const ads=await mark.evaluate(()=>window.gameDebug.view.zoomed);await mark.locator('#mobile-ads').tap();
await mark.evaluate(()=>{const d=window.gameDebug;d.view.markPitch=.6;});await mark.locator('[data-hold=fire]').tap();await mark.waitForTimeout(500);const ammo=await mark.evaluate(()=>window.gameDebug.sim.ammo.sniper);await mark.locator('[data-tap=reload]').tap();await mark.waitForTimeout(350);const reload=await mark.evaluate(()=>window.gameDebug.sim.reloadTime>0);await mark.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-public-marksman.png'});await mark.waitForTimeout(2300);const refill=await mark.evaluate(()=>window.gameDebug.sim.ammo.sniper);
if(!ads||ammo!==3||!reload||refill!==4||Math.hypot(markAfter.x-markBefore.x,markAfter.z-markBefore.z)<.5)throw Error('Public marksman controls failed');
const touchCombat={drive,marksmanMoved:Math.hypot(markAfter.x-markBefore.x,markAfter.z-markBefore.z),ads,ammo,reload,refill};
await p.bringToFront();

const initial=await p.evaluate(()=>({id:window.gameDebug.multiplayer.room.sessionId,role:window.gameDebug.sim.role,checkpoint:window.gameDebug.sim.checkpoint,token:window.gameDebug.multiplayer.room.reconnectionToken}));
// A real offline browser context plus a dropped socket, longer than the old 20-second reservation.
await p.context().setOffline(true);await p.evaluate(()=>window.gameDebug.multiplayer.room.connection.close(4010,'QA network interruption'));await p.waitForFunction(()=>window.gameDebug.multiplayer.reconnecting);
await p.waitForTimeout(25000);const interrupted=await p.locator('#connection-message').textContent();await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-public-reconnecting.png'});
await p.context().setOffline(false);await p.waitForFunction(()=>window.gameDebug.multiplayer.connected&&!window.gameDebug.multiplayer.reconnecting,null,{timeout:15000});
const restored=await p.evaluate(()=>{const m=window.gameDebug.multiplayer;return{id:m.room.sessionId,role:window.gameDebug.sim.role,checkpoint:window.gameDebug.sim.checkpoint,count:m.state.players.length,token:m.room.reconnectionToken,saved:JSON.parse(sessionStorage.getItem('crossfire-reconnect-'+m.room.roomId)).token,error:m.error}});
if(restored.id!==originalId||restored.role!==initial.role||restored.token!==restored.saved||restored.token===initial.token||restored.count!==2)throw Error('Session restoration failed');
// Refresh after recovery must use the rotated token and preserve the same player.
await p.reload();await p.locator('#join-lobby').click();await p.waitForFunction(()=>window.gameDebug.multiplayer.connected&&window.gameDebug.multiplayer.state?.stage==='racing',null,{timeout:15000});const refreshed=await p.evaluate(()=>({id:window.gameDebug.multiplayer.room.sessionId,players:window.gameDebug.multiplayer.state.players.length,error:window.gameDebug.multiplayer.error}));
if(refreshed.id!==originalId||refreshed.players!==2)throw Error('Refresh after reconnect failed');
const mobileState=await p.evaluate(()=>window.gameDebug.snapshot());await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-public-recovered.png'});
await p.evaluate(()=>window.gameDebug.multiplayer.leave());await guest.evaluate(()=>window.gameDebug.multiplayer.leave());await context.close();
return{roomId,touchCombat,outageSeconds:25,interrupted,restored:{...restored,token:undefined,saved:undefined},refreshed,mobileState,errors};
}
