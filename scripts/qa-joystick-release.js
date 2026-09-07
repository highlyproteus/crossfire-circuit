async page=>{
for(const old of page.context().browser().contexts())if(old!==page.context())await old.close();
const c=await page.context().browser().newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const p=await c.newPage(),errors=[],checks={};p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{window.droppedPointerEvents=0;for(const type of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,e=>{if(window.blockReleaseEvents){window.droppedPointerEvents++;e.stopImmediatePropagation();}},{capture:true});});
await p.goto('http://127.0.0.1:5190/?qa=1');await p.locator('#start-marksman').tap();await p.locator('#touch-stick').waitFor({state:'visible'});
const cdp=await c.newCDPSession(p),send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
const center=async selector=>{await p.locator(selector).waitFor({state:'visible'});const r=await p.locator(selector).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2}};
const state=()=>p.evaluate(()=>({x:window.gameDebug.touch.x,y:window.gameDebug.touch.y,input:window.gameDebug.readInput(),gas:window.gameDebug.touch.has('gas'),fire:window.gameDebug.touch.has('fire')}));
const neutral=async name=>{const s=await state();if(s.x||s.y||s.input.throttle||s.input.steer||s.fire||s.gas)throw Error(name+' stuck: '+JSON.stringify(s));checks[name]=true;};
let stick=await center('#touch-stick');
// Real touch movement, then discard every pointer-level release event.
await p.evaluate(()=>{window.blockReleaseEvents=true;window.gameDebug.view.markPitch=.6;});
const before=await p.evaluate(()=>window.gameDebug.sim.markEye());
await send('touchStart',[{id:1,x:stick.x,y:stick.y-38}]);await p.waitForTimeout(550);const moving=await state();if(moving.y>-.8||moving.input.throttle<.7)throw Error('Joystick did not engage');
await send('touchMove',[{id:1,x:stick.x+180,y:stick.y-120}]);await send('touchEnd',[]);await neutral('missingPointerRelease');
const stopped=await p.evaluate(()=>window.gameDebug.sim.markEye());await p.waitForTimeout(350);const after=await p.evaluate(()=>window.gameDebug.sim.markEye());checks.moved=Math.hypot(stopped.x-before.x,stopped.z-before.z)>.5;checks.stoppedMoving=Math.hypot(after.x-stopped.x,after.z-stopped.z)<.1;
await send('touchStart',[{id:2,x:stick.x,y:stick.y-38}]);await send('touchCancel',[]);await neutral('touchCancel');
// One finger ending must not release the other finger's fire button.
const fire=await center('[data-hold=fire]');await send('touchStart',[{id:3,x:stick.x,y:stick.y-35},{id:4,...fire}]);await send('touchEnd',[{id:3,x:stick.x,y:stick.y-35}]);const fireHeld=await state();if(fireHeld.y!==0||!fireHeld.fire)throw Error('Fire lost when joystick released');await send('touchEnd',[]);await neutral('independentFireRelease');
// A lifecycle reset must retire the contact, so a later move cannot revive it.
await send('touchStart',[{id:5,x:stick.x,y:stick.y-38}]);await p.evaluate(()=>dispatchEvent(new Event('pagehide')));await neutral('pageHide');await send('touchMove',[{id:5,x:stick.x+20,y:stick.y-38}]);await neutral('noResurrection');await send('touchEnd',[]);
await send('touchStart',[{id:6,x:stick.x,y:stick.y-38}]);await p.evaluate(()=>window.gameDebug.touch.update(false,false));await neutral('hiddenControls');await send('touchEnd',[]);
await send('touchStart',[{id:7,x:stick.x,y:stick.y-38}]);await p.setViewportSize({width:390,height:844});await p.waitForTimeout(150);await neutral('rotation');await send('touchEnd',[]);
await p.locator('#pause').tap();await p.locator('#exit-mode').tap();await p.locator('#start').tap();await p.locator('#mount').tap();await p.locator('#touch-stick').waitFor({state:'visible'});stick=await center('#touch-stick');const gas=await center('[data-hold=gas]');
await send('touchStart',[{id:8,x:stick.x+35,y:stick.y},{id:9,...gas}]);await send('touchEnd',[{id:8,x:stick.x+35,y:stick.y}]);const gasHeld=await state();if(gasHeld.x!==0||gasHeld.input.throttle!==1)throw Error('Gas lost when steering released');await send('touchEnd',[]);await neutral('independentGasRelease');
await send('touchStart',[{id:10,x:stick.x+35,y:stick.y},{id:11,...gas}]);await send('touchEnd',[{id:11,...gas}]);const steeringHeld=await state();if(steeringHeld.x<.7||steeringHeld.input.throttle!==0)throw Error('Steering lost when gas released');await send('touchEnd',[]);await neutral('independentStickRelease');
// The automation browser pins every tab visible/focused, so dispatch lifecycle
// events explicitly instead of claiming a physical app-switch test.
await send('touchStart',[{id:12,x:stick.x+35,y:stick.y}]);await p.evaluate(()=>dispatchEvent(new Event('blur')));await neutral('blur');await send('touchEnd',[]);await p.locator('#resume').tap();
await p.locator('#touch-stick').waitFor({state:'visible'});await send('touchStart',[{id:13,x:stick.x+35,y:stick.y}]);await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await neutral('hiddenDocument');await send('touchEnd',[]);await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await p.locator('#resume').tap();
await p.evaluate(()=>window.blockReleaseEvents=false);await p.mouse.move(stick.x,stick.y);await p.mouse.down();await p.mouse.move(380,300);await p.mouse.up();await neutral('mouseReleaseOutside');
await p.screenshot({path:'output/playwright/joystick-recentered.png'});checks.suppressedPointerEvents=await p.evaluate(()=>window.droppedPointerEvents);checks.errors=errors;
if(!checks.moved||!checks.stoppedMoving||errors.length)throw Error('Movement or runtime regression');await c.close();return checks;
}
