export type Vec = { x: number; y: number; z: number };
export const TAU=Math.PI*2,SEGMENTS=2100;
export const wrap=(t:number)=>((t%1)+1)%1;
export const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
// Rounded fourteen-metre corners preserve the shape of a 90-degree turn while
// giving the road mesh and vehicle a finite turning radius.
const SCALE=1.8;
// The western dogleg and southern switchbacks extend the lap without crossings.
const points=[
 [120,-75],[120,-40],[95,-12],[122,18],[155,45],[155,80],[120,80],[120,115],
 [20,115],[20,80],[-25,80],[-25,115],
 [-185,115],[-185,75],[-155,75],[-155,25],[-135,25],
 [-105,-5],[-135,-35],[-135,-115],[-15,-115],
 [-15,-78],[35,-78],[35,-165],[100,-165],[100,-135],
 [145,-135],[145,-165],[190,-165],[190,-115],[120,-115]
].map(([x,z])=>[x*SCALE,z*SCALE]);
const path:{x:number;z:number;d:number}[]=[];
const add=(x:number,z:number)=>{const last=path.at(-1);path.push({x,z,d:last?last.d+Math.hypot(x-last.x,z-last.z):0});};
for(let i=0;i<points.length;i++){
 const p=points[i],before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];
 const a=Math.hypot(before[0]-p[0],before[1]-p[1]),b=Math.hypot(after[0]-p[0],after[1]-p[1]),r=Math.min(14,a*.3,b*.3);
 const start=[p[0]+(before[0]-p[0])*r/a,p[1]+(before[1]-p[1])*r/a],end=[p[0]+(after[0]-p[0])*r/b,p[1]+(after[1]-p[1])*r/b];
 for(let j=0;j<=12;j++){const t=j/12;add((1-t)**2*start[0]+2*(1-t)*t*p[0]+t*t*end[0],(1-t)**2*start[1]+2*(1-t)*t*p[1]+t*t*end[1]);}
}
add(path[0].x,path[0].z);
export const COURSE_LENGTH=path.at(-1)!.d;
function flat(t:number):Vec{
 const distance=wrap(t)*COURSE_LENGTH;let lo=0,hi=path.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(path[mid].d<distance)lo=mid;else hi=mid;}
 const a=path[lo],b=path[hi],f=(distance-a.d)/(b.d-a.d||1);return{x:a.x+(b.x-a.x)*f,y:24,z:a.z+(b.z-a.z)*f};
}
export const anchor=(x:number,z:number)=>{x*=SCALE;z*=SCALE;let best=Infinity,result=0;for(let i=0;i<5000;i++){const p=flat(i/5000),d=Math.hypot(p.x-x,p.z-z);if(d<best){best=d;result=i/5000;}}return result;};
export const jumps=[{lip:anchor(-85,115),gap:26.5,rise:4.8,run:15,name:'COMMITMENT GAP'},{lip:anchor(-77,-115),gap:27,rise:4.8,run:15,name:'THE LONG WAY DOWN'}];
export const checkpoints=[anchor(120,101),anchor(-31,115),anchor(-155,59),anchor(-120,10),anchor(-126,-115),anchor(18,-78),anchor(44,-165),1];
export function center(t:number):Vec{const p=flat(t),d=wrap(t)*COURSE_LENGTH;for(const j of jumps){const start=j.lip*COURSE_LENGTH-j.run,lip=j.lip*COURSE_LENGTH;if(d>=start&&d<lip+j.gap*.5)p.y+=Math.min(1,(d-start)/j.run)*j.rise;}return p;}
export function frame(t:number){const p=center(t),a=flat(t-.0003),b=flat(t+.0003),length=Math.hypot(b.x-a.x,b.z-a.z);const forward={x:(b.x-a.x)/length,y:0,z:(b.z-a.z)/length};return{p,forward,right:{x:forward.z,y:0,z:-forward.x},yaw:Math.atan2(forward.x,forward.z)};}
export const width=(t:number)=>{const p=flat(t);p.x/=SCALE;p.z/=SCALE;if(p.z>74&&p.z<86&&p.x>-27&&p.x<22)return 12.5;return 17+(p.x>112?5*clamp((-45-p.z)/20,0,1):0);};
export const isGap=(t:number)=>jumps.some(j=>wrap(t)>=j.lip&&wrap(t)<j.lip+j.gap/COURSE_LENGTH);
export const coverPositions=[[120,-60],[120,40],[65,115],[-185,88],[-135,-50],[-110,-115],[65,-165],[190,-139],[155,-115]].map(([x,z])=>anchor(x,z));
export const obstacles=[
 {t:anchor(155,61),side:-1},{t:anchor(120,94),side:1},
 {t:anchor(-159,115),side:-1},{t:anchor(-185,95),side:1},
 {t:anchor(-155,48),side:-1},{t:anchor(-135,-76),side:1},
 {t:anchor(3,-78),side:-1},{t:anchor(35,-116),side:1},
 {t:anchor(63,-165),side:-1},{t:anchor(83,-165),side:1},
 {t:anchor(168,-165),side:-1},{t:anchor(159,-115),side:1}
].map(o=>({...o,w:6.3,depth:3.2,height:1.6}));
const samples=Array.from({length:SEGMENTS},(_,i)=>flat(i/SEGMENTS));
export function closest(p:Vec){let best=Infinity,t=0;for(let i=0;i<samples.length;i++){const f=samples[i],d=(p.x-f.x)**2+(p.z-f.z)**2;if(d<best){best=d;t=i/SEGMENTS;}}best=Math.sqrt(best);let result={t,distance:best,roadWidth:width(t),height:center(t).y,route:'main',slopeX:0,slopeZ:0};
 let score=best*best+(p.y-.97-result.height)**2;
 for(const r of routes)for(let i=0;i<r.points.length-1;i++){const a=r.points[i],b=r.points[i+1],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,n=dx*dx+dz*dz,f=clamp(((p.x-a.x)*dx+(p.y-.97-a.y)*dy+(p.z-a.z)*dz)/(n+dy*dy),0,1),distance=Math.hypot(p.x-a.x-dx*f,p.z-a.z-dz*f),height=a.y+dy*f,candidate=distance*distance+(p.y-.97-height)**2;
 if(candidate<score){score=candidate;result={t:r.start+(r.end-r.start)*(i+f)/(r.points.length-1),distance,roadWidth:r.width,height,route:r.id,slopeX:dy*dx/n,slopeZ:dy*dz/n};}}return result;
}
export function trackGeometry(){const vertices:number[]=[],indices:number[]=[];for(let i=0;i<SEGMENTS;i++){const t=i/SEGMENTS,next=(i+1)/SEGMENTS;if(isGap((t+next)/2))continue;const a=frame(t),b=frame(next),wa=width(t)/2,wb=width(next)/2,base=vertices.length/3;for(const[f,w,side]of[[a,wa,-1],[a,wa,1],[b,wb,-1],[b,wb,1]]as const)vertices.push(f.p.x+f.right.x*w*side,f.p.y,f.p.z+f.right.z*w*side);indices.push(base,base+2,base+1,base+1,base+2,base+3);}return{vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};}

// Optional roads map their progress onto the main lap, preserving checkpoint order.
function route(id:string,name:string,start:number,end:number,controls:number[][],roadWidth:number,color:number,elevation=0){
 const a=flat(start),b=flat(end),raw=[a,...controls.map(([x,z])=>({x:x*SCALE,y:24,z:z*SCALE})),b];
 const pts:Vec[]=[];
 for(let i=0;i<raw.length-1;i++){const p0=raw[Math.max(0,i-1)],p1=raw[i],p2=raw[i+1],p3=raw[Math.min(raw.length-1,i+2)];for(let j=0;j<30;j++){const t=j/30;const c=(k:'x'|'z')=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t);pts.push({x:c('x'),y:24,z:c('z')});}}pts.push(b);
 let distance=0;const distances=pts.map((p,i)=>{if(i)distance+=Math.hypot(p.x-pts[i-1].x,p.z-pts[i-1].z);return distance;});
 const lead=elevation<0?distance*.08:0,ramp=distance*(elevation<0?.2:.4),ease=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
 pts.forEach((p,i)=>p.y=24+elevation*Math.min(ease((distances[i]-lead)/ramp),ease((distance-distances[i]-lead)/ramp)));
 return{id,name,start,end,width:roadWidth,color,elevation,points:pts};
}
export const routes=[
 route('skyline','UPPER DECK +14m',anchor(40,115),anchor(-48,115),[[20,137],[-23,137]],10,0xc78dff,14),
 route('underpass','LOWER DECK -10m',anchor(40,115),anchor(-65,115),[[15,70],[-65,70],[-86,88]],10,0x64bef5,-10),
 route('bypass','SERVICE LOOP · NO JUMP',anchor(-65,115),anchor(-119,115),[[-73,147],[-108,147]],12,0x83f3ef),
 route('secret','SKYWAY +20m',anchor(85,-165),anchor(178,-165),[[106,-190],[155,-190]],9,0x96f68c,20)
];
export function routeGeometry(r:typeof routes[number]){const vertices:number[]=[],indices:number[]=[];for(let i=0;i<r.points.length;i++){const p=r.points[i],a=r.points[Math.max(0,i-1)],b=r.points[Math.min(r.points.length-1,i+1)],n=Math.hypot(b.x-a.x,b.z-a.z);for(const side of [-1,1])vertices.push(p.x+(b.z-a.z)/n*r.width/2*side,p.y,p.z-(b.x-a.x)/n*r.width/2*side);if(i<r.points.length-1){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}return{vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};}
export const boosts=[[120,-65],[-135,-90],[35,-127],[190,-143]].map(([x,z])=>({t:anchor(x,z),length:12}));
export type BarrelSpot={t:number;offset:number;explosive:boolean;height?:number;stack?:boolean};
export const barrelTower={t:anchor(-130,115),name:'BARREL BASH'};
const scatteredBarrels:BarrelSpot[]=[[120,-28],[155,51],[120,105],[-67,115],[-146,115],[-185,83],[-155,37],[-135,-58],[-116,-115],[-15,-89],[35,-101],[56,-165],[125,-135],[182,-165],[190,-129],[143,-115]].map(([x,z],i)=>({t:anchor(x,z),offset:(i%2?1:-1)*3.8,explosive:i%3===0}));
// Fuel hazards flank driving lines, leaving room to dodge and shoot them.
const extraFuel:BarrelSpot[]=[[120,-49],[119,16],[155,72],[78,115],[52,115],[-49,115],[-169,115],[-155,66],[-114,4],[-135,-43],[-135,-96],[-97,-115],[-40,-115],[13,-78],[35,-145],[74,-165],[145,-146],[176,-115]].map(([x,z],i)=>({t:anchor(x,z),offset:(i%2?1:-1)*(i%3===0?5.5:3.1),explosive:true}));
// Four balanced layers span the road. These are light, independent rigid bodies;
// the first driver opens a path and leaves tumbling debris for the pack behind.
const barrelStack:BarrelSpot[]=[11,11,9,7].flatMap((count,level)=>Array.from({length:count},(_,column)=>({t:barrelTower.t,offset:(column-(count-1)/2)*1.44,explosive:false,height:level*1.61,stack:true})));
export const barrelSpots:BarrelSpot[]=[...scatteredBarrels,...extraFuel,...barrelStack];
export const towerCover=[{x:-12,z:-8,w:9,d:2},{x:10,z:8,w:9,d:2},{x:0,z:-22,w:2,d:9}];
