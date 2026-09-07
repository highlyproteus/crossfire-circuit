import {center,closest,frame,jumps,obstacles,COURSE_LENGTH,clamp,wrap} from './course';
import type {Simulation,Input} from './simulation';
export function driveAI(sim:Simulation):Input{
 const p=sim.position(),near=closest(p),t=near.t,speed=Math.abs(sim.speed);
 const turn=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 const heading=frame(t).yaw;
 let curvature=0;for(const ahead of [5,10,16,22])curvature=Math.max(curvature,Math.abs(turn(frame(t+ahead/COURSE_LENGTH).yaw,heading)));
 let desired=curvature>.75?3.8:curvature>.3?9:27;
 if(Math.abs(turn(heading,sim.yaw))>.2||near.distance>4.2)desired=Math.min(desired,3.8);
 let offset=0;
 const obstacle=obstacles.map(o=>({...o,distance:(o.t-t)*COURSE_LENGTH})).filter(o=>o.distance>-5&&o.distance<24).sort((a,b)=>a.distance-b.distance)[0];
 if(obstacle){offset=-obstacle.side*3.4;desired=Math.min(desired,6.5);}
 const approach=jumps.find(j=>{const d=(j.lip-t)*COURSE_LENGTH;return d>-j.gap-6&&d<42;});
 if(approach){desired=27;offset=0;}
 const look=approach?9:clamp(speed*.38+3,6,10),f=frame(wrap(t+look/COURSE_LENGTH));
 const target=Math.atan2(f.p.x+f.right.x*offset-p.x,f.p.z+f.right.z*offset-p.z);
 const error=turn(target,sim.yaw),velocity=sim.body.linvel(),side=velocity.x*Math.cos(sim.yaw)-velocity.z*Math.sin(sim.yaw);
 return{throttle:speed>desired+.6?-1:speed<desired?1:0,steer:clamp(-Math.atan2(6.8*Math.sin(error),look)/.61+side*.04,-1,1),brake:false};
}
