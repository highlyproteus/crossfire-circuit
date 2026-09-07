import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { resultPlayer } from './schema';
export const record=mutation({
 args:{secret:v.string(),key:v.string(),room:v.string(),round:v.number(),ended:v.number(),reason:v.string(),players:v.array(resultPlayer)},returns:v.id('matches'),
 handler:async(ctx,args)=>{
   if(!process.env.GAME_SERVER_SECRET||args.secret!==process.env.GAME_SERVER_SECRET)throw new Error('Unauthorized');
   if(args.players.length>26||args.key.length>100||args.room.length>30||args.reason.length>160)throw new Error('Invalid result');
   for(const p of args.players)if(p.name.length>18||p.finished<0||p.finished>1200||p.checkpoint<0||p.checkpoint>8||p.deaths<0||p.kills<0)throw new Error('Invalid player result');
   const previous=await ctx.db.query('matches').withIndex('by_key',q=>q.eq('key',args.key)).unique();if(previous)return previous._id;
   const {secret,...data}=args;const id=await ctx.db.insert('matches',data);
   for(const p of args.players)if(p.role==='driver'&&p.finished>0&&p.checkpoint===8)await ctx.db.insert('laps',{match:id,name:p.name,seconds:p.finished,deaths:p.deaths});return id;
 }
});
export const recent=query({args:{},returns:v.array(v.object({id:v.id('matches'),ended:v.number(),reason:v.string(),players:v.array(resultPlayer)})),handler:async ctx=>(await ctx.db.query('matches').withIndex('by_ended').order('desc').take(8)).map(m=>({id:m._id,ended:m.ended,reason:m.reason,players:m.players}))});
export const fastest=query({args:{},returns:v.array(v.object({name:v.string(),seconds:v.number(),deaths:v.number()})),handler:async ctx=>(await ctx.db.query('laps').withIndex('by_seconds').order('asc').take(20)).map(p=>({name:p.name,seconds:p.seconds,deaths:p.deaths}))});
