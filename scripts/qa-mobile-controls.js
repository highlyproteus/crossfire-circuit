async page=>{
const p=page.context().browser().contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('5190'));
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.bringToFront();await p.goto('http://127.0.0.1:5190/?qa=1');await p.locator('#start').waitFor();await p.locator('#start').tap();await p.locator('#mount').tap();
const cdp=await p.context().newCDPSession(p);
const center=async s=>{await p.locator(s).waitFor({state:'visible'});const b=await p.locator(s).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2}};
const point=(id,p)=>({id,x:p.x,y:p.y,radiusX:3,radiusY:3,force:1});
const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
const stick=await center('#touch-stick'),gas=await center('[data-hold=gas]');
const before=await p.evaluate(()=>window.gameDebug.sim.position());
await send('touchStart',[point(1,{x:stick.x+35,y:stick.y}),point(2,gas)]);await p.waitForTimeout(800);
const driving=await p.evaluate(()=>({input:window.gameDebug.readInput(),p:window.gameDebug.sim.position(),speed:window.gameDebug.sim.speed,yaw:window.gameDebug.sim.yaw}));
await send('touchEnd',[]);await p.waitForTimeout(100);const released=await p.evaluate(()=>window.gameDebug.readInput());
if(driving.input.throttle!==1||driving.input.steer<.5||Math.hypot(driving.p.x-before.x,driving.p.z-before.z)<1)throw Error('Touch driving failed');if(released.throttle!==0||released.steer!==0)throw Error('Stuck touch input');
await p.locator('#pause').tap();await p.locator('#exit-mode').tap();await p.locator('#start-marksman').tap();
const origin=await p.evaluate(()=>({p:window.gameDebug.sim.markEye(),yaw:window.gameDebug.view.markYaw}));
const move=await center('#touch-stick');await send('touchStart',[point(3,{x:move.x,y:move.y-35}),point(4,{x:490,y:170})]);await send('touchMove',[point(3,{x:move.x,y:move.y-35}),point(4,{x:550,y:190})]);await p.waitForTimeout(500);
const walking=await p.evaluate(()=>({input:window.gameDebug.readInput(),p:window.gameDebug.sim.markEye(),yaw:window.gameDebug.view.markYaw}));await send('touchEnd',[]);
if(Math.hypot(walking.p.x-origin.p.x,walking.p.z-origin.p.z)<.5||walking.yaw===origin.yaw)throw Error('Movement plus drag aim failed');
await p.locator('#mobile-ads').tap();const ads=await p.evaluate(()=>window.gameDebug.view.zoomed);await p.locator('#mobile-ads').tap();
const shoot=await center('[data-hold=fire]');await send('touchStart',[point(5,shoot)]);await p.waitForTimeout(100);await send('touchEnd',[]);const ammo=await p.evaluate(()=>window.gameDebug.sim.ammo.sniper);await p.locator('[data-tap=reload]').tap();await p.waitForTimeout(150);const reloading=await p.evaluate(()=>window.gameDebug.sim.reloadTime>0);await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-marksman-landscape.png'});await p.waitForTimeout(2100);const refill=await p.evaluate(()=>window.gameDebug.sim.ammo.sniper);
await p.locator('#select-rocket').tap();await p.locator('[data-hold=fire]').tap();const rocket=await p.evaluate(()=>({weapon:window.gameDebug.sim.attackType,ammo:window.gameDebug.sim.ammo.rocket}));
await p.setViewportSize({width:390,height:844});await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-marksman-portrait.png'});
if(!ads||ammo!==3||!reloading||refill!==4||rocket.ammo!==3)throw Error('Touch weapon actions failed');
await p.setViewportSize({width:320,height:568});await p.locator('#pause').tap();await p.locator('#exit-mode').tap();await p.screenshot({path:'outputs/crossfire-circuit/output/playwright/mobile-small-menu.png'});
const reachable=await p.locator('#show-records').isVisible();const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
await cdp.detach();return{driving,released,walking,ads,ammo,reloading,refill,rocket,reachable,overflow,errors};
}
