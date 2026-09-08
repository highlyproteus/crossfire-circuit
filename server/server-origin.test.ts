import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approvedEndpoint, publicOrigin } from '../src/server-origin';

const allowed = 'https://multiplayer.opencrossfirecircuit.party';
test('discovery accepts only the configured secure game origin', () => {
  assert.equal(publicOrigin(allowed + '/'), allowed);
  assert.equal(approvedEndpoint(allowed, allowed), true);
  for (const endpoint of [
    'http://multiplayer.opencrossfirecircuit.party',
    'https://old.trycloudflare.com',
    allowed + '.attacker.example', allowed + ':444',
    allowed + '/other', allowed + '?redirect=elsewhere', allowed + '#fragment',
    'https://user:password@multiplayer.opencrossfirecircuit.party',
    'not a URL',
  ]) assert.equal(approvedEndpoint(endpoint, allowed), false, endpoint);
});
test('discovery fails closed when the configured origin is absent or malformed', () => {
  assert.equal(approvedEndpoint(allowed, undefined), false);
  assert.equal(approvedEndpoint(allowed, 'http://multiplayer.opencrossfirecircuit.party'), false);
  assert.throws(() => publicOrigin(undefined));
});
