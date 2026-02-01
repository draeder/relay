import { generateSecretKey, getPublicKey, finalizeEvent, Relay } from 'nostr-tools';

const relayUrl = 'wss://relay-nostr-gun.draeder.workers.dev/';

async function main() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  const relay = await Relay.connect(relayUrl);
  console.log('[OPEN] Connected');

  const event = finalizeEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: 'Signed event test',
    pubkey: pk
  }, sk);

  const pub = relay.publish(event);
  pub.on('ok', () => console.log('[OK] Event accepted'));
  pub.on('failed', (reason) => console.log('[FAIL]', reason));

  const sub = relay.subscribe([{ kinds: [1], authors: [pk] }], {
    onevent(evt) {
      if (evt.id === event.id) {
        console.log('[EVENT] Received back');
        sub.close();
        relay.close();
      }
    },
    oneose() {
      console.log('[EOSE]');
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
