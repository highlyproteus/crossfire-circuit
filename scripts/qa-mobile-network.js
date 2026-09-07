async page=>{
const browser=page.context().browser();const p=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('5190'));
const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewportSize({width:844,height:390});await p.goto('http://127.0.0.1:5190/?qa=1');await p.locator('#online').click();await p.locator('#player-name').fill('Mobile Pilot');await p.locator('#join-lobby').click();await p.waitForFunction(()=>window.gameDebug?.multiplayer.state?.players.length===1);
const roomId=await p.evaluate(()=>window.gameDebug.multiplayer.room.roomId);const originalId=await p.evaluate(()=>window.gameDebug.multiplayer.room.sessionId);
const context=await browser.newContext({viewport:{width:1280,height:800}}),guest=await context.newPage();await guest.goto('http://127.0.0.1:5190/?qa=1&room='+roomId);await guest.locator('#player-name').fill('Desktop Pilot');await guest.locator('#join-lobby').click();await guest.waitForFunction(()=>window.gameDebug?.multiplayer.state?.players.length===2);await p.bringToFront();await p.locator('#launch-round').click();await p.waitForFunction(()=>window.gameDebug.multiplayer.state.stage==='warmup');if(await p.locator('#pause-panel').isVisible())await p.locator('#resume').tap();
await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-online-warmup.png'});
await p.waitForFunction(()=>window.gameDebug.multiplayer.state.stage==='racing',null,{timeout:42000});
const initial=await p.evaluate(()=>({id:window.gameDebug.multiplayer.room.sessionId,role:window.gameDebug.sim.role,checkpoint:window.gameDebug.sim.checkpoint,token:window.gameDebug.multiplayer.room.reconnectionToken}));
// A real offline browser context plus a dropped socket, longer than the old 20-second reservation.
await p.context().setOffline(true);await p.evaluate(()=>window.gameDebug.multiplayer.room.connection.close(4010,'QA network interruption'));await p.waitForFunction(()=>window.gameDebug.multiplayer.reconnecting);
await p.waitForTimeout(25000);const interrupted=await p.locator('#connection-message').textContent();await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-reconnecting.png'});
await p.context().setOffline(false);await p.waitForFunction(()=>window.gameDebug.multiplayer.connected&&!window.gameDebug.multiplayer.reconnecting,null,{timeout:15000});
const restored=await p.evaluate(()=>{const m=window.gameDebug.multiplayer;return{id:m.room.sessionId,role:window.gameDebug.sim.role,checkpoint:window.gameDebug.sim.checkpoint,count:m.state.players.length,token:m.room.reconnectionToken,saved:JSON.parse(sessionStorage.getItem('crossfire-reconnect-'+m.room.roomId)).token,error:m.error}});
if(restored.id!==originalId||restored.role!==initial.role||restored.token!==restored.saved||restored.token===initial.token||restored.count!==2)throw Error('Session restoration failed');
// Refresh after recovery must use the rotated token and preserve the same player.
await p.reload();await p.locator('#join-lobby').click();await p.waitForFunction(()=>window.gameDebug.multiplayer.connected&&window.gameDebug.multiplayer.state?.stage==='racing',null,{timeout:15000});const refreshed=await p.evaluate(()=>({id:window.gameDebug.multiplayer.room.sessionId,players:window.gameDebug.multiplayer.state.players.length,error:window.gameDebug.multiplayer.error}));
if(refreshed.id!==originalId||refreshed.players!==2)throw Error('Refresh after reconnect failed');
const mobileState=await p.evaluate(()=>window.gameDebug.snapshot());await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-online-recovered.png'});
await p.evaluate(()=>window.gameDebug.multiplayer.leave());await guest.evaluate(()=>window.gameDebug.multiplayer.leave());await context.close();
return{roomId,outageSeconds:25,interrupted,restored:{...restored,token:undefined,saved:undefined},refreshed,mobileState,errors};
}
