const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const { createServer } = require('../server');

const request = async (port, path = '/') => fetch(`http://127.0.0.1:${port}${path}`);

test('serves the status page', { concurrency: false }, async (t) => {
  const { server, close } = createServer({ port: 0, log: false, skipGun: true });
  t.after(() => close());

  const port = server.address().port;
  const res = await request(port);
  assert.equal(res.status, 200);

  const body = await res.text();
  assert.match(body, /Combined Relay/);
});

test('serves the bundled GUN client', { concurrency: false }, async (t) => {
  const { server, close } = createServer({ port: 0, log: false, skipGun: true });
  t.after(() => close());

  const port = server.address().port;
  const res = await request(port, '/gun.js');
  assert.equal(res.status, 200);

  const body = await res.text();
  assert.match(body, /Gun/);
});

const computeEventId = (event) => {
  const payload = [0, event.pubkey, event.created_at, event.kind, event.tags || [], event.content || ''];
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

test('accepts and replays nostr events over /nostr', { concurrency: false }, async (t) => {
  const { server, close } = createServer({ port: 0, log: false, skipGun: true, nostr: { disableSignature: true } });
  t.after(() => close());

  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/nostr`);
  t.after(() => ws.close());

  const event = {
    kind: 1,
    pubkey: 'a'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: 'hello nostr',
    sig: 'b'.repeat(128),
  };
  event.id = computeEventId(event);

  await new Promise((resolve, reject) => {
    const msgs = [];
    const timer = setTimeout(() => reject(new Error(`nostr test timeout; got: ${JSON.stringify(msgs)}`)), 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify(['EVENT', event]));
      ws.send(JSON.stringify(['REQ', 'sub1', { kinds: [1] }]));
    });

    ws.on('message', (data) => {
      msgs.push(JSON.parse(data.toString()));
      const ok = msgs.find((m) => Array.isArray(m) && m[0] === 'OK');
      const received = msgs.find((m) => Array.isArray(m) && m[0] === 'EVENT' && m[1] === 'sub1');
      if (ok && received) {
        clearTimeout(timer);
        resolve();
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
});
