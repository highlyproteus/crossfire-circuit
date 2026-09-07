import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export const resultPlayer=v.object({name:v.string(),role:v.union(v.literal('driver'),v.literal('marksman')),finished:v.number(),checkpoint:v.number(),deaths:v.number(),kills:v.number()});
export default defineSchema({
 servers:defineTable({name:v.string(),endpoint:v.string(),updated:v.number()}).index('by_name',['name']),
 matches:defineTable({key:v.string(),room:v.string(),round:v.number(),ended:v.number(),reason:v.string(),players:v.array(resultPlayer)}).index('by_key',['key']).index('by_ended',['ended']),
 laps:defineTable({match:v.id('matches'),name:v.string(),seconds:v.number(),deaths:v.number()}).index('by_seconds',['seconds'])
});
