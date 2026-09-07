import './style.css';
import {GameAudio} from './audio';
import {Multiplayer} from './network';
import {TouchControls} from './touch-controls';
import {loadRecords} from './records';
import { createSimulation, MAGAZINE_SIZE, type Input } from './simulation';
import { View } from './view';
import { loadAssets } from './assets';
import {driveAI} from './driver-ai';
import { center, frame, TAU, checkpoints, jumps, COURSE_LENGTH, closest, coverPositions, obstacles, routes, boosts, barrelSpots } from './course';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML='<div class="loading">ASSEMBLING THE CIRCUIT…</div>';
const time=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}.${Math.floor(s%1*10)}`;
try {
const [sim,assets]=await Promise.all([createSimulation(),loadAssets()]);
const view=new View(document.querySelector<HTMLCanvasElement>('#game')!,assets);
const path=Array.from({length:121},(_,i)=>{const p=center(i/120);return `${i?'L':'M'}${p.x},${p.z}`;}).join(' ')+' Z';
app.innerHTML=`
<section id="menu"><div class="kicker">MULTIPLAYER / 07</div><h1>Crossfire<br><span>Circuit.</span></h1><p class="menu-copy">Pick a lane. Find a shortcut.<br>Boost pads. Barrels. Big gaps.<br><strong>Eight checkpoints. Your route.</strong></p><div class="menu-actions"><button class="primary" id="online">PLAY WITH FRIENDS <span>↗</span></button><button class="primary" id="start">RIDE THE CIRCUIT <span>↗</span></button><button class="secondary marksman-start" id="start-marksman">PLAY AS MARKSMAN <span>⌖</span></button></div><div class="menu-footer"><span>WASD · DRIVE</span><span>SPACE · BRAKE</span><span>R · RECOVER</span></div><button id="show-records" class="records-link">MATCH HISTORY & FASTEST LAPS ↗</button><span class="credit">BUILD A LOBBY · RACE THE CROSSFIRE</span></section>
<section class="hud hidden" id="hud"><div class="marksman-ui"><div id="scope-mask" class="scope-mask hidden"></div><div id="crosshair" class="crosshair"></div><div class="weapon-hud"><div class="weapon-buttons"><button id="select-sniper">1 · SNIPER</button><button id="select-rocket">2 · ROCKETS</button></div><div id="weapon-status">READY</div><div id="reload-track"><div id="reload-progress"></div></div><p>Mouse · aim &nbsp; Click · fire &nbsp; SHIFT · ADS &nbsp; R · reload &nbsp; V · camera</p></div></div><div class="top-left"><div class="wordmark">CROSSFIRE<span>CIRCUIT</span></div><div class="status"><div><div class="metric-label" id="progress-label">CHECKPOINT</div><div class="metric-value" id="checkpoint">0 <em>/ 8</em></div></div><div><div class="metric-label">RUN TIME</div><div class="metric-value" id="timer">00:00.0</div></div><div><div class="metric-label" id="deaths-label">DEATHS</div><div class="metric-value" id="deaths">0</div></div></div></div><div class="top-right"><button id="sound" class="icon-button sound-button" aria-label="Toggle sound">SOUND OFF</button><button id="pause" class="icon-button" aria-label="Pause game">Ⅱ <span>ESC</span></button></div><div class="practice-badge hidden" id="practice-badge">PRACTICE · MARKSMAN OFF</div><div class="map"><svg viewBox="-365 -370 750 660" role="img" aria-label="Course minimap"><path d="${path}" fill="none" stroke="#162e3e" stroke-width="17"/><path d="${path}" fill="none" stroke="#aacbd5" stroke-width="4"/>${routes.filter(r=>r.id!=='secret').map(r=>`<path d="${r.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.z}`).join(' ')}" fill="none" stroke="#a998df" stroke-width="4"/>`).join('')}<circle r="20" fill="#f88757"/><g id="map-gates">${[0,...checkpoints.slice(0,-1)].map((t,i)=>{const p=center(t);return `<circle cx="${p.x}" cy="${p.z}" r="6" fill="${i?'#72e9ee':'#f8ae68'}"/>`;}).join('')}</g><path id="map-rider" d="M 0 -10 L 7 7 L 0 4 L -7 7 Z" fill="#fff" stroke="#10212b" stroke-width="2"/></svg><div class="map-caption">THE CIRCUIT</div></div><div class="bottom-left"><div class="health-label"><span>VEHICLE INTEGRITY</span><span id="health">100%</span></div><div class="health-track"><div id="health-fill" class="health-fill"></div></div><div id="protection" class="protection"></div></div><div class="speedometer"><span class="speed-number" id="speed">0</span><span class="speed-unit">KM/H</span></div><div id="feature-status" class="feature-status"></div><div class="hint"><span class="key">WASD</span> drive <span class="key">SPACE</span> brake <span class="key">R</span> recover</div><div id="message" class="message hidden" role="status"></div><div id="threat" class="threat hidden"><span id="threat-label">SNIPER TAKING AIM</span><div class="bar" id="threat-bar"></div></div><button id="mount" class="mount hidden"><span class="key">E</span>MOUNT YOUR ATV</button><div id="death-vignette" class="death-vignette hidden"></div><div id="fps" class="hidden"></div></section>
<section class="shade hidden" id="pause-panel"><div class="panel"><div class="kicker">Sound & controls</div><h2>SETTINGS</h2><label class="row">Enable sound<input id="sound-enabled" type="checkbox"></label><label class="row">Music volume<input id="music-volume" type="range" min="0" max="0.6" step="0.05" value="0.22"></label><label class="row">Sound effects<input id="sfx-volume" type="range" min="0" max="1" step="0.1" value="0.7"></label><hr><div class="controls driver-controls"><span><b class="key">W</b><b class="key">S</b></span><span>Accelerate / reverse</span><span><b class="key">A</b><b class="key">D</b></span><span>Steer left / right</span><span><b class="key">SPACE</b></span><span>Brake / drift</span><span><b class="key">R</b></span><span>Return to checkpoint</span><span>Right mouse drag</span><span>Look around</span></div><div class="marksman-controls">WASD moves around the overlook. Mouse aims. Click fires. Shift toggles ADS; right mouse holds it. R reloads. V switches first/third person. 1 / 2 select weapons. Stop the riders before they finish.</div><button class="primary" id="resume">BACK TO THE RUN <span>↗</span></button><button class="secondary" id="restart">Restart from the beginning</button><button class="secondary" id="exit-mode">Choose another role</button></div></section>
<section class="shade hidden" id="finish"><div class="panel"><div class="kicker">You made it across</div><h2>CIRCUIT COMPLETE.</h2><p id="finish-description">The marksman will remember this one.</p><div class="finish-stats"><div><div class="metric-label">RUN TIME</div><div class="metric-value" id="finish-time"></div></div><div><div class="metric-label">DEATHS</div><div class="metric-value" id="finish-deaths"></div></div></div><p id="best"></p><button id="again" class="primary">RIDE AGAIN <span>↗</span></button><button id="back" class="secondary">Back to the overlook</button></div></section>`;
app.insertAdjacentHTML('beforeend',`
<section id="online-panel" class="shade hidden"><div class="panel lobby-panel"><div class="kicker">Your crew. Your circuit.</div><h2 id="lobby-title">PLAY TOGETHER.</h2><div id="join-form"><label class="field">YOUR NAME<input id="player-name" maxlength="18" minlength="2" placeholder="Choose your callsign" autocomplete="nickname"></label><label class="field">LOBBY CODE<input id="room-code" maxlength="20" placeholder="Leave blank to create a lobby" spellcheck="false" autocomplete="off"></label><button id="join-lobby" class="primary">CREATE / JOIN LOBBY ↗</button><p class="small-copy">2–26 players · 30 seconds of free play · one random marksman</p></div><div id="lobby-content" class="hidden"><div class="lobby-code"><span id="lobby-code"></span><button id="copy-invite" class="secondary">COPY INVITE</button></div><p id="lobby-summary"></p><div id="lobby-roster"></div><button id="launch-round" class="primary">START THE WARMUP ↗</button><button id="next-round" class="primary hidden">BACK TO LOBBY ↗</button></div><p id="network-error" role="status"></p><button id="leave-lobby" class="secondary">BACK TO MENU</button></div></section>
<section id="records-panel" class="shade hidden"><div class="panel lobby-panel"><div class="kicker">Saved to the circuit</div><h2>MATCH HISTORY.</h2><div id="records-content"></div><button id="close-records" class="secondary">BACK TO MENU</button></div></section>
<div id="round-banner" class="round-banner hidden"><strong id="round-label"></strong><span id="round-detail"></span></div>
<aside id="standings" class="standings hidden"><button id="toggle-standings">LIVE STANDINGS <span>−</span></button><div id="standings-list"></div><small id="connection-status"></small></aside>`);
const el=(id:string)=>document.getElementById(id)!;
const checkbox=(id:string)=>el(id) as HTMLInputElement;
const keys=new Set<string>();

let manualInput:Input|null=null,manualClock=false,last=performance.now(),acc=0,lastPhase=sim.phase;
const gameAudio=new GameAudio();
const multiplayer=new Multiplayer(sim,view);
const touch=new TouchControls(el('hud'),()=>sim.role,action=>{if(sim.paused)return;if(action==='fire')fireWeapon();if(action==='ads'){adsToggle=!view.zoomed;view.zoomed=adsToggle;}if(action==='reload'){if(multiplayer.room)multiplayer.send('reload');else sim.requestReload();}if(action==='recover'){if(multiplayer.room)multiplayer.send('recover');else sim.recover();}});
const touchDevice=matchMedia('(pointer:coarse)').matches;
document.body.classList.toggle('touch-device',touchDevice);
if(touchDevice){el('standings').classList.add('collapsed');document.querySelector('.menu-footer')!.textContent='JOYSTICK + GAS · DRAG TO AIM · TOUCH TO FIRE';}
app.insertAdjacentHTML('beforeend','<div id=connection-alert class="connection-alert hidden" role=status><span id=connection-message></span><button id=connection-exit>BACK TO LOBBY</button></div>');
el('connection-exit').onclick=async()=>{await leaveOnline();onlineMenu();};
let onlineBusy=false,uiSignature='';
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const roomParam=new URLSearchParams(location.search).get('room')??'';
checkbox('room-code').value=roomParam;try{checkbox('player-name').value=localStorage.getItem('crossfire-name')??'';}catch{}
function onlineMenu(){el('online-panel').classList.remove('hidden');el('menu').classList.add('hidden');if(!matchMedia('(pointer:coarse)').matches)checkbox('player-name').focus();}
el('online').onclick=onlineMenu;if(roomParam)onlineMenu();
el('close-records').onclick=()=>el('records-panel').classList.add('hidden');
el('show-records').onclick=async()=>{el('records-panel').classList.remove('hidden');el('records-content').textContent='Loading saved rounds…';try{const data=await loadRecords();el('records-content').innerHTML='<h3>FASTEST LAPS</h3>'+(data.fastest.length?data.fastest.map((p,i)=>`<div class="roster-row"><b>${i+1}</b><span>${escapeHtml(p.name)}</span><strong>${time(p.seconds)}</strong></div>`).join(''):'<p>No finished laps yet. Set the first record.</p>')+'<h3>RECENT ROUNDS</h3>'+data.recent.map(r=>`<article class="record-match"><small>${new Date(r.ended).toLocaleString()}</small><p>${escapeHtml(r.reason)}</p>${r.players.map(p=>`<div class="roster-row"><b>${p.role==='marksman'?'⌖':'↗'}</b><span>${escapeHtml(p.name)}</span><strong>${p.role==='marksman'?p.kills+' KOs':p.finished?time(p.finished):p.checkpoint+'/8'}</strong></div>`).join('')}</article>`).join('');}catch(e){el('records-content').textContent=e instanceof Error?e.message:'Could not load records.';}};
el('join-lobby').onclick=async()=>{if(onlineBusy)return;onlineBusy=true;const button=el('join-lobby') as HTMLButtonElement;button.disabled=true;button.textContent='CONNECTING…';try{await multiplayer.connect(checkbox('player-name').value,checkbox('room-code').value.trim());try{localStorage.setItem('crossfire-name',checkbox('player-name').value);}catch{}if(!gameAudio.started)setSound(true);}catch{}finally{onlineBusy=false;button.disabled=false;button.textContent='CREATE / JOIN LOBBY ↗';networkUI();}};
el('launch-round').onclick=()=>multiplayer.send('start');el('next-round').onclick=()=>multiplayer.send('next');
el('copy-invite').onclick=()=>{const url=new URL(location.href);url.searchParams.delete('qa');navigator.clipboard.writeText(url.toString()).then(()=>{el('copy-invite').textContent='COPIED';setTimeout(()=>el('copy-invite').textContent='COPY INVITE',2000);}).catch(()=>{multiplayer.error='Copy the invite from your browser address bar.';networkUI();});};
async function leaveOnline(){if(document.pointerLockElement)document.exitPointerLock();await multiplayer.leave();sim.phase='menu';sim.role='driver';document.body.dataset.role='driver';document.body.classList.remove('online');for(const id of ['online-panel','hud','pause-panel','round-banner','standings'])el(id).classList.add('hidden');el('menu').classList.remove('hidden');el('join-form').classList.remove('hidden');el('lobby-content').classList.add('hidden');multiplayer.error='';uiSignature='';}
el('leave-lobby').onclick=()=>{if(onlineBusy)void multiplayer.leave();if(multiplayer.room)void leaveOnline();else{el('online-panel').classList.add('hidden');el('menu').classList.remove('hidden');}};
el('toggle-standings').onclick=()=>{const collapsed=el('standings').classList.toggle('collapsed');el('toggle-standings').querySelector('span')!.textContent=collapsed?'+':'−';};
if(touchDevice)el('toggle-standings').querySelector('span')!.textContent='+';
function networkUI(){
 el('network-error').textContent=multiplayer.error;
 el('connection-alert').classList.toggle('hidden',!multiplayer.room||multiplayer.connected);el('connection-message').textContent=multiplayer.error;

 const state=multiplayer.state;if(!multiplayer.room||!state)return;
 document.body.classList.add('online');document.body.dataset.role=sim.role;
 const panel=state.stage==='lobby'||state.stage==='results',leader=state.leader===multiplayer.room.sessionId;
 el('online-panel').classList.toggle('hidden',!panel);el('join-form').classList.add('hidden');el('lobby-content').classList.remove('hidden');el('menu').classList.add('hidden');el('finish').classList.add('hidden');el('hud').classList.toggle('hidden',panel);el('round-banner').classList.toggle('hidden',panel);el('standings').classList.toggle('hidden',panel);el('practice-badge').classList.add('hidden');
 el('lobby-title').textContent=state.stage==='results'?'ROUND RESULTS.':'THE STARTING LOBBY.';el('lobby-code').textContent=state.roomId;
 const count=state.players.filter(p=>p.connected).length;
 el('lobby-summary').textContent=state.stage==='results'?state.reason:`${count} / 26 players · ${leader?'You lead this lobby. Start when your crew is ready.':'Waiting for '+(state.players.find(p=>p.id===state.leader)?.name??'the leader')+' to start.'}`;
 el('launch-round').classList.toggle('hidden',!leader||state.stage!=='lobby');(el('launch-round') as HTMLButtonElement).disabled=count<2;
 el('next-round').classList.toggle('hidden',!leader||state.stage!=='results');
 const ranked=[...state.players].sort((a,b)=>a.role==='marksman'?1:b.role==='marksman'?-1:a.finished&&b.finished?a.finished-b.finished:a.finished?-1:b.finished?1:b.progress-a.progress||a.deaths-b.deaths);
 const signature=JSON.stringify(ranked.map(p=>[p.id,p.name,p.role,p.connected,p.checkpoint,p.deaths,p.finished,p.kills]))+state.leader+state.stage;
 if(signature!==uiSignature){uiSignature=signature;const rows=ranked.map((p,i)=>`<div class="roster-row ${p.id===multiplayer.room!.sessionId?'is-you':''}"><b>${p.role==='marksman'?'⌖':i+1}</b><span>${escapeHtml(p.name)}${p.id===state.leader?' <small>LEADER</small>':''}${!p.connected?' <small>RECONNECTING</small>':''}</span><strong>${state.stage==='lobby'?'READY':p.role==='marksman'?p.kills+' KOs':p.finished?time(p.finished):p.checkpoint+'/8'}</strong></div>`).join('');el('lobby-roster').innerHTML=rows;el('standings-list').innerHTML=rows;}
 const mark=state.players.find(p=>p.id===state.marksman);
 el('round-label').textContent=state.stage==='warmup'?`FREE PLAY · ${Math.ceil(state.remaining)}s`:state.stage==='countdown'?String(Math.ceil(state.remaining)):state.elapsed<3?'GO!':`${Math.floor(state.remaining/60)}:${String(Math.floor(state.remaining%60)).padStart(2,'0')} LEFT`;
 el('round-detail').textContent=state.stage==='warmup'?'Explore the track. Everyone resets before the race.':state.stage==='countdown'?'One of you will become the marksman':mark?.id===multiplayer.room.sessionId?'YOU ARE THE MARKSMAN · Stop the drivers':`${mark?.name??'The marksman'} is in the tower · Race through all 8 checkpoints`;
 el('connection-status').textContent=multiplayer.connected?`${count} connected · ${multiplayer.latency} ms`:multiplayer.error;
 el('pause-panel').querySelector('h2')!.textContent='SETTINGS';
}
multiplayer.onChange=networkUI;

function syncSound(){el('sound').textContent=gameAudio.enabled?'SOUND ON':'SOUND OFF';checkbox('sound-enabled').checked=gameAudio.enabled;}
function setSound(enabled:boolean){void gameAudio.enable(enabled).then(syncSound);syncSound();}
function toggleSound(){setSound(!gameAudio.enabled);}
el('music-volume').oninput=()=>gameAudio.musicVolume=Number(checkbox('music-volume').value);
el('sfx-volume').oninput=()=>gameAudio.sfxVolume=Number(checkbox('sfx-volume').value);
let adsToggle=false;
let mouseFire=false;
function fireWeapon(){if(multiplayer.room){multiplayer.requestShot();return;}if(sim.fireMarksman(view.aimDirection()))view.recoil=.1;}
function pause(value:boolean){if(sim.phase==='menu'||(!multiplayer.room&&sim.phase==='finished'))return;sim.paused=value;if(multiplayer.room)multiplayer.localPaused=value;keys.clear();touch.clear();mouseFire=false;view.zoomed=false;adsToggle=false;if(value&&document.pointerLockElement)document.exitPointerLock();el('pause-panel').classList.toggle('hidden',!value);syncSound();}
function start(role:'driver'|'marksman'='driver'){if(!gameAudio.started)setSound(true);adsToggle=false;sim.start(false,role);document.body.dataset.role=role;view.zoomed=false;mouseFire=false;keys.clear();touch.clear();el('menu').classList.add('hidden');el('finish').classList.add('hidden');el('pause-panel').classList.add('hidden');el('hud').classList.remove('hidden');}
el('start').onclick=()=>start();el('start-marksman').onclick=()=>{start('marksman');lockAim();};el('mount').onclick=()=>sim.mount();el('pause').onclick=()=>pause(true);el('resume').onclick=()=>{pause(false);if(sim.role==='marksman')lockAim();};
el('restart').onclick=()=>{if(multiplayer.room)return;start(sim.role);};el('again').onclick=()=>{start(sim.role);};
el('back').onclick=()=>{sim.phase='menu';sim.role='driver';document.body.dataset.role='driver';el('finish').classList.add('hidden');el('hud').classList.add('hidden');el('menu').classList.remove('hidden');};
el('exit-mode').onclick=()=>{if(multiplayer.room){void leaveOnline();return;}pause(false);if(document.pointerLockElement)document.exitPointerLock();sim.phase='menu';sim.role='driver';document.body.dataset.role='driver';el('pause-panel').classList.add('hidden');el('hud').classList.add('hidden');el('menu').classList.remove('hidden');};
function selectWeapon(weapon:'sniper'|'rocket'){if(multiplayer.room){multiplayer.send('weapon',weapon);return;}if(sim.reloadTime>0)return;sim.attackType=weapon;}
el('select-sniper').onclick=()=>selectWeapon('sniper');el('select-rocket').onclick=()=>selectWeapon('rocket');
el('sound').onclick=toggleSound;el('sound-enabled').onchange=()=>setSound(checkbox('sound-enabled').checked);
addEventListener('keydown',e=>{
  if((e.target as HTMLElement)?.tagName==='INPUT')return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'&&!e.repeat)pause(!sim.paused);
  if(sim.paused)return;
  keys.add(e.code);
  if(sim.role==='marksman'){if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat){adsToggle=!adsToggle;view.zoomed=adsToggle;}if(e.code==='KeyR'&&!e.repeat){if(multiplayer.room)multiplayer.send('reload');else sim.requestReload();}if(e.code==='KeyV'&&!e.repeat)view.thirdPerson=!view.thirdPerson;if(e.code==='Digit1')selectWeapon('sniper');if(e.code==='Digit2')selectWeapon('rocket');}
  if(e.code==='KeyE'&&!e.repeat&&!multiplayer.room)sim.mount();if(e.code==='KeyR'&&!e.repeat&&sim.role==='driver'){if(multiplayer.room)multiplayer.send('recover');else sim.recover();}
  if(e.code==='KeyF'&&!e.repeat)el('fps').classList.toggle('hidden');
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
let looking=false,lastLookX=0,lastLookY=0,lookPointer:number|null=null;
const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
function lockAim(){if(matchMedia('(pointer:fine)').matches)Promise.resolve(canvas.requestPointerLock()).catch(()=>sim.announce('Drag on the scene to aim. Click to fire.',3));}
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown=e=>{
 if(sim.paused||sim.phase==='menu')return;
 if(sim.role==='marksman'){
   if(e.button===2)view.zoomed=true;
   else if(e.pointerType==='touch'){looking=true;lookPointer=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;canvas.setPointerCapture(e.pointerId);}
   else{mouseFire=true;if(!document.pointerLockElement)lockAim();}
 }else if(e.button===2){looking=true;canvas.setPointerCapture(e.pointerId);}
};
canvas.onpointerup=e=>{looking=false;lookPointer=null;if(e.button===0)mouseFire=false;if(e.button===2)view.zoomed=adsToggle;};
canvas.onpointercancel=()=>{looking=false;mouseFire=false;view.zoomed=false;};
// Mouse events report each button independently while pointer events combine chords.
addEventListener('mousedown',e=>{if(sim.role==='marksman'&&!sim.paused&&sim.phase==='racing'&&(e.target===canvas||document.pointerLockElement===canvas)){if(e.button===0){mouseFire=true;fireWeapon();}if(e.button===2)view.zoomed=true;}});
addEventListener('mouseup',e=>{if(e.button===0)mouseFire=false;if(e.button===2)view.zoomed=adsToggle;});
addEventListener('pointermove',e=>{
 if(sim.paused)return;
 if(sim.role==='marksman'&&(document.pointerLockElement===canvas||looking)){
  if(e.pointerType==='touch'&&e.pointerId!==lookPointer)return;
  const dx=e.pointerType==='touch'?e.clientX-lastLookX:e.movementX,dy=e.pointerType==='touch'?e.clientY-lastLookY:e.movementY;lastLookX=e.clientX;lastLookY=e.clientY;
  const sensitivity=view.zoomed?.00045:.0025;view.markYaw-=dx*sensitivity;view.markPitch=Math.max(-1.1,Math.min(.7,view.markPitch-dy*sensitivity));
 }else if(looking){view.orbit-=e.movementX*.005;view.pitch=Math.max(-2,Math.min(5,view.pitch+e.movementY*.018));}
});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&sim.role==='marksman'&&sim.phase==='racing'&&!sim.paused)pause(true);});
addEventListener('resize',()=>view.resize());
visualViewport?.addEventListener('resize',()=>view.resize());
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause(true);sim.announce('Graphics paused. Reload to restore the scene.',30);});
const readInput=():Input=>{if(manualInput)return manualInput;const t=touch.input();return{throttle:Math.max(-1,Math.min(1,t.throttle+Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')))),steer:Math.max(-1,Math.min(1,t.steer+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')))),brake:keys.has('Space')||t.brake};};
function updateUI(){
  touch.update(!sim.paused&&(sim.phase==='racing'||sim.phase==='dead')&&(!multiplayer.room||(multiplayer.connected&&(multiplayer.state?.stage==='warmup'||multiplayer.state?.stage==='racing'))),view.zoomed);
  const marksman=sim.role==='marksman';document.body.classList.toggle('third-person',marksman&&view.thirdPerson);
  el('progress-label').textContent=marksman?'TAKEDOWNS':'CHECKPOINT';el('deaths-label').textContent=marksman?'ESCAPED':'DEATHS';
  el('checkpoint').innerHTML=marksman?String(sim.kills):`${sim.checkpoint} <em>/ ${checkpoints.length}</em>`;el('timer').textContent=time(sim.elapsed);el('deaths').textContent=String(marksman?sim.escaped:sim.deaths);
  el('scope-mask').classList.toggle('hidden',!marksman||!view.zoomed||sim.reloadTime>0||sim.attackType!=='sniper');el('crosshair').classList.toggle('hit',sim.lastHit>0);
  el('weapon-status').textContent=sim.reloadTime>0?`RELOADING · ${sim.reloadTime.toFixed(1)}s`:`${sim.ammo[sim.attackType]} / ${MAGAZINE_SIZE} · ${sim.cooldown>0?'CYCLING':'READY'}`;el('reload-track').classList.toggle('hidden',sim.reloadTime<=0);el('reload-progress').style.width=`${(1-sim.reloadTime/(sim.reloadDuration||1))*100}%`;el('feature-status').textContent=sim.boostTime>0?`OVERDRIVE · ${sim.boostTime.toFixed(1)}s`:sim.routeName!=='main'?routes.find(r=>r.id===sim.routeName)?.name??'':'';el('feature-status').classList.toggle('hidden',marksman||sim.phase!=='racing');el('select-sniper').classList.toggle('selected',sim.attackType==='sniper');el('select-rocket').classList.toggle('selected',sim.attackType==='rocket');
  el('speed').textContent=String(Math.round(Math.abs(sim.speed)*3.6));el('health').textContent=`${Math.round(sim.health)}%`;
  el('health-fill').style.width=`${sim.health}%`;el('health-fill').style.background=sim.health<40?'#ff865e':'#83f3ef';
  el('protection').textContent=sim.invulnerable>0&&sim.phase==='racing'?`SPAWN PROTECTION · ${sim.invulnerable.toFixed(1)}s`:'';
  el('message').textContent=touchDevice&&sim.message.includes('WASD move')?'Move with the joystick. Drag to aim. Tap FIRE to shoot.':sim.message;el('message').classList.toggle('hidden',sim.messageTime<=0||sim.phase==='staging');
  el('mount').classList.toggle('hidden',sim.phase!=='staging');el('practice-badge').classList.toggle('hidden',!sim.practice);
  el('threat').classList.toggle('hidden',sim.warning<=0||sim.practice||sim.phase!=='racing');el('threat-label').textContent=sim.attackType==='sniper'?'SNIPER TAKING AIM · BREAK SIGHTLINE':'ROCKET INCOMING · CHANGE YOUR LINE';el('threat-bar').style.transform=`scaleX(${sim.warning})`;
  el('death-vignette').classList.toggle('hidden',sim.phase!=='dead');
  const p=sim.position();el('map-rider').setAttribute('transform',`translate(${p.x} ${p.z}) rotate(${180-sim.yaw*180/Math.PI})`);
  el('fps').textContent=`${Math.round(view.fps)} fps · ${view.renderer.info.render.calls} draw calls`;
  if(!multiplayer.room&&sim.phase==='finished'&&lastPhase!=='finished'){
    el('finish').classList.remove('hidden');el('finish-time').textContent=time(sim.elapsed);el('finish-deaths').textContent=String(sim.deaths);
    el('finish-description').textContent=sim.practice?'Clean lines. Ready to turn the marksman on?':'You beat the crossfire. Make the next run cleaner.';
    try{const key=sim.practice?'crossfire-v6-vertical-best-practice':'crossfire-v6-vertical-best-live',old=Number(localStorage.getItem(key))||Infinity,best=Math.min(old,sim.elapsed);localStorage.setItem(key,String(best));el('best').textContent=`${sim.elapsed<=old?'New best · ': 'Personal best · '}${time(best)}`;}catch{el('best').textContent='';}
  }
  lastPhase=sim.phase;
}
function loop(now:number){
  const dt=Math.min((now-last)/1000,.08);last=now;
  sim.markYaw=view.markYaw;sim.ads=view.zoomed&&sim.reloadTime<=0;
  if(multiplayer.room)multiplayer.update(dt,readInput(),mouseFire||touch.has('fire'));else if(!manualClock){acc+=dt;let count=0;while(acc>=1/60&&count<5){sim.step(readInput());acc-=1/60;count++;}}
  view.update(sim,dt);
  if(sim.role==='marksman'&&(mouseFire||touch.has('fire')))fireWeapon();
  updateUI();if(multiplayer.room)networkUI();
  gameAudio.update(sim);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// QA hooks exist only on an explicitly requested local QA URL.
if(new URLSearchParams(location.search).has('qa')){
  (window as any).gameDebug={snapshot:()=>sim.snapshot(),multiplayer,sim,view,touch,readInput,frame,center,jumps,checkpoints,COURSE_LENGTH,closest,driveAI,coverPositions,obstacles,routes,boosts,barrelSpots,gameAudio,
    input:(input:Input|null)=>manualInput=input,
    manual:(value:boolean)=>manualClock=value,
    advance:(count:number,input:Input)=>{for(let i=0;i<count;i++)sim.step(input);updateUI();return sim.snapshot();},
    metrics:()=>({fps:view.fps,drawCalls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles})};
}
}catch(error){console.error(error);app.innerHTML='<section id="failure"><h2>The circuit could not load.</h2><p>Check your connection and WebGL support, then reload this page.</p><button class="primary" onclick="location.reload()">TRY AGAIN</button></section>';}
