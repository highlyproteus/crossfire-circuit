import type { Input } from './simulation';

/** Each thumb owns its control until that contact ends, independently of the other thumb. */
export class TouchControls {
  x=0;y=0;
  private lastRole='';
  private stickPointer:string|null=null;
  private active=false;
  private contacts=new Map<string,{element:HTMLElement;action:string;pointerId?:number}>();
  private center={x:0,y:0};
  readonly root:HTMLElement;
  constructor(hud:HTMLElement,private role:()=>string,private action:(name:string)=>void){
    hud.insertAdjacentHTML('beforeend',`<div id="touch-controls" class="touch-controls">
      <div id="touch-stick" class="touch-stick" role="group" aria-label="Movement joystick"><span class="stick-axis"></span><span id="stick-knob"></span><span class="stick-label">STEER</span></div>
      <div class="touch-driver-actions"><button data-hold="back" aria-label="Reverse">REV</button><button data-hold="brake">BRAKE</button><button data-hold="gas" class="touch-gas" aria-label="Hold to accelerate">GAS ↑</button><button data-tap="recover">RECOVER</button></div>
      <div class="touch-marksman-actions"><button data-tap="ads" id="mobile-ads" aria-pressed="false">ADS</button><button data-tap="reload">RELOAD</button><button data-hold="fire" class="touch-shoot" aria-label="Hold to fire">FIRE</button></div>
      <span class="touch-look-hint">DRAG THE SCENE TO AIM</span>
    </div>`);
    this.root=document.getElementById('touch-controls')!;
    // Touch identifiers and PointerEvent IDs are different namespaces. Native touch
    // events retain ownership even when a mobile browser drops pointer capture.
    const nativeTouch = typeof TouchEvent !== 'undefined';
    this.root.addEventListener('touchstart', e => {
      if (!nativeTouch) return;
      let owned = false;
      for (const t of Array.from(e.changedTouches)) {
        const control = this.control(t.target);
        if (control) owned = this.begin(`touch:${t.identifier}`, control, t.clientX, t.clientY) || owned;
      }
      if (owned) e.preventDefault();
    }, {passive: false});
    const reconcile = (e: TouchEvent) => {
      const live = new Set(Array.from(e.touches, t => `touch:${t.identifier}`));
      for (const key of this.contacts.keys()) {
        if (key.startsWith('touch:') && !live.has(key)) this.release(key);
      }
    };
    window.addEventListener('touchstart', reconcile, {capture: true, passive: true});
    window.addEventListener('touchmove', e => {
      reconcile(e);
      for (const t of Array.from(e.changedTouches)) {
        if (`touch:${t.identifier}` === this.stickPointer) this.move(t.clientX, t.clientY);
      }
    }, {capture: true, passive: true});
    for (const type of ['touchend', 'touchcancel'] as const) {
      window.addEventListener(type, e => {
        for (const t of Array.from(e.changedTouches)) this.release(`touch:${t.identifier}`);
        reconcile(e);
      }, {capture: true, passive: true});
    }
    this.root.addEventListener('pointerdown', e => {
      if ((nativeTouch && e.pointerType === 'touch') || e.button !== 0) return;
      const control = this.control(e.target), key = `pointer:${e.pointerId}`;
      if (!control || !this.begin(key, control, e.clientX, e.clientY, e.pointerId)) return;
      try { control.setPointerCapture(e.pointerId); } catch { this.release(key); }
      e.preventDefault();
    });
    window.addEventListener('pointermove', e => {
      const key = `pointer:${e.pointerId}`;
      if (!this.contacts.has(key)) return;
      if (e.buttons === 0) this.release(key);
      else if (key === this.stickPointer) this.move(e.clientX, e.clientY);
    }, {capture: true});
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      window.addEventListener(type, e => this.release(`pointer:${e.pointerId}`), {capture: true});
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-tap]')) {
      button.onclick = () => { if (this.active) this.action(button.dataset.tap!); };
    }
    for (const event of ['blur', 'pagehide', 'pageshow', 'resize', 'orientationchange']) window.addEventListener(event, () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.visualViewport?.addEventListener('resize', () => this.clear());
  }
  private control(target: EventTarget | null) {
    const control = target instanceof Element ? target.closest<HTMLElement>('#touch-stick,button[data-hold]') : null;
    return control && this.root.contains(control) ? control : null;
  }
  private begin(key: string, element: HTMLElement, x: number, y: number, pointerId?: number) {
    if (!this.active || document.hidden || this.contacts.has(key)) return false;
    const action = element.id === 'touch-stick' ? 'stick' : element.dataset.hold!;
    if (action === 'stick' && this.stickPointer !== null) return false;
    this.contacts.set(key, {element, action, pointerId});
    if (action === 'stick') {
      this.stickPointer = key;
      const rect = element.getBoundingClientRect();
      this.center = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
      this.move(x, y);
    } else {
      element.classList.add('pressed');
      if (action === 'fire') this.action('fire');
    }
    return true;
  }
  private release(key: string) {
    const contact = this.contacts.get(key);
    if (!contact) return;
    this.contacts.delete(key);
    if (key === this.stickPointer) {
      this.stickPointer = null;
      this.x = this.y = 0;
      this.draw();
    } else if (!this.has(contact.action)) contact.element.classList.remove('pressed');
    if (contact.pointerId !== undefined) {
      try {
        if (contact.element.hasPointerCapture(contact.pointerId)) contact.element.releasePointerCapture(contact.pointerId);
      } catch { /* The browser may already have retired this pointer. */ }
    }
  }
  private move(x:number,y:number){const dx=(x-this.center.x)/43,dy=(y-this.center.y)/43;if(this.role()==='driver'){this.x=Math.max(-1,Math.min(1,dx));this.y=0;}else{const n=Math.max(1,Math.hypot(dx,dy));this.x=dx/n;this.y=dy/n;}this.draw();}
  private draw(){document.getElementById('stick-knob')!.style.transform=`translate(calc(-50% + ${this.x*43}px),calc(-50% + ${this.y*43}px))`;}
  has(action:string){return [...this.contacts.values()].some(contact=>contact.action===action);}
  input():Input{const dead=(v:number)=>Math.abs(v)<.12?0:Math.sign(v)*(Math.abs(v)-.12)/.88;return {steer:dead(this.x),throttle:this.role()==='marksman'?-dead(this.y):Number(this.has('gas'))-Number(this.has('back')),brake:this.has('brake')};}
  clear(){for(const key of this.contacts.keys())this.release(key);this.stickPointer=null;this.x=this.y=0;this.draw();}
  update(active:boolean,ads:boolean){
    if(!active||this.lastRole!==this.role())this.clear();
    if(this.lastRole!==this.role()){
      this.lastRole=this.role();
      this.root.querySelector('.stick-label')!.textContent=this.lastRole==='marksman'?'MOVE':'STEER';
    }
    this.active=active;
    this.root.classList.toggle('hidden',!active);
    document.getElementById('mobile-ads')!.setAttribute('aria-pressed',String(ads));
  }
}
