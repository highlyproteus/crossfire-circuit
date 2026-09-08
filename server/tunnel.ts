import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import { publicOrigin } from '../src/server-origin';

if (!process.env.CONVEX_URL || !process.env.GAME_SERVER_SECRET) {
  throw new Error('Server discovery credentials missing');
}
const endpoint = publicOrigin(process.env.GAME_SERVER_PUBLIC_ORIGIN);
const client = new ConvexHttpClient(process.env.CONVEX_URL);
let busy = false;

async function publish() {
  if (busy) return;
  busy = true;
  try {
    // Advertise only while both the game and its permanent connector are ready.
    const responses = await Promise.all([
      fetch('http://127.0.0.1:2567/health', { signal: AbortSignal.timeout(8000) }),
      fetch('http://127.0.0.1:20242/ready', { signal: AbortSignal.timeout(8000) }),
    ]);
    if (!responses.every(response => response.ok)) return;
    await client.mutation(api.servers.publish, {
      secret: process.env.GAME_SERVER_SECRET!, endpoint,
    });
  } catch {
    console.error('Server discovery refresh pending');
  } finally {
    busy = false;
  }
}

void publish();
const timer = setInterval(() => void publish(), 15000);
process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
