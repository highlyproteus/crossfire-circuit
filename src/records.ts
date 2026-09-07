import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
export async function loadRecords(){
 if(!import.meta.env.VITE_CONVEX_URL)throw new Error('Match history is available on the hosted game.');
 const client=new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
 const [recent,fastest]=await Promise.all([client.query(api.results.recent,{}),client.query(api.results.fastest,{})]);return{recent,fastest};
}
