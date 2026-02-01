# Peer Relay - Cloudflare Edition

A combined Nostr and GUN relay deployed on **Cloudflare Workers + Durable Objects** for serverless, globally-distributed relay infrastructure.

## Features

- **Nostr Relay** (NIP-01): WebSocket-based event pub/sub via Durable Objects
- **GUN Relay**: P2P graph database synchronization via Durable Objects
- **Serverless**: Deployed on Cloudflare Workers (no server management)
- **Global**: Automatic Cloudflare edge distribution
- **Scalable**: Durable Objects handle persistent state and connections

## Deployment

### Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed: `npm install -g wrangler`
- Node.js 18+

### Quick Deploy

```bash
cd worker
npm install
wrangler deploy
```

The Worker will be deployed to: `https://relay-nostr-gun.draeder.workers.dev`

**Access via**: `relay.peer.ooo`

## Usage

### Nostr Relay

**WebSocket Endpoint**: `wss://relay.peer.ooo/`

Connect with any Nostr client:

```javascript
import { relayInit } from 'nostr-tools';

const relay = relayInit('wss://relay.peer.ooo/');
await relay.connect();

// Subscribe to events
let sub = relay.sub([{ kinds: [1] }]);
sub.on('event', event => {
  console.log('Received event:', event);
});

// Publish an event
const event = await signEvent({
  kind: 1,
  content: 'Hello, Nostr!',
  created_at: Math.floor(Date.now() / 1000),
  tags: []
});
relay.publish(event);
```

**Supported NIPs**: NIP-01 (Event handling)

### GUN Relay

**WebSocket Endpoint**: `wss://relay.peer.ooo/gun`

Connect with GUN clients:

```javascript
const Gun = require('gun');
const gun = Gun(['wss://relay.peer.ooo/gun']);

// Store data
gun.get('greeting').put({ message: 'Hello, GUN!' });

// Read data
gun.get('greeting').on((data) => {
  console.log(data);
});
```

### Info Endpoint

**HTTP GET** `https://relay.peer.ooo/`

Returns NIP-11 relay metadata:

```json
{
  "name": "Peer Relay (Cloudflare)",
  "description": "Nostr relay on Cloudflare Durable Objects + GUN relay",
  "pubkey": "",
  "contact": "",
  "supported_nips": [1, 11],
  "software": "combined-relay-worker",
  "version": "1.0.0"
}
```

## Architecture

```
                   Cloudflare Edge
        ┌──────────────────────────────┐
        │    Worker (HTTP Router)      │
        ├──────────┬───────────────────┤
        │          │                   │
        │  /       │        /gun        │
        │  │       │        │           │
        ├──┼───────┼────────┼─────────┤
        │  ▼       │        ▼         │
        │ NOSTR_RELAY      GUN_RELAY │
        │ (Durable Object) (Durable  │
        │                  Object)   │
        │                            │
        └────────────────────────────┘
             Persistent State
```

## Development

### Local Testing

```bash
cd worker

# Install dependencies
npm install

# Run tests (requires WebSocket support)
node test-nostr-valid.js
```

### Project Structure

```
worker/
├── src/
│   └── worker.js          # Main Worker + Durable Object classes
├── wrangler.toml          # Cloudflare Worker config
└── package.json
```

## Security Notes

- **No hardcoded secrets**: All configuration via environment variables (if needed)
- **Signature validation**: Nostr events are validated (ID hash checked)
- **Event storage**: Ephemeral in-memory storage (resets on DO restart)
- **Database**: GUN uses DO storage (persistent within the namespace)

### Secrets Management

If you need to add API keys or secrets:

1. Store in Cloudflare Dashboard: Workers > Settings > Environment Variables
2. Access in code via `env.SECRET_NAME`
3. Never commit secrets to Git

Example:

```javascript
export default {
  async fetch(request, env) {
    const apiKey = env.MY_API_KEY; // Never hardcode this
  }
};
```

## Performance

- **Nostr relay**: ~1000 events in-memory per instance
- **GUN relay**: Uses Durable Objects persistent storage
- **Latency**: Global edge distribution via Cloudflare
- **Concurrency**: Unlimited concurrent WebSocket connections

## Limitations

- Nostr events stored in-memory (ephemeral)
- Basic Nostr validation (no signature verification for performance)
- GUN relay is basic (get/put operations only)

## Future Improvements

- [ ] Persistent event storage (R2 or D1)
- [ ] Full signature verification
- [ ] Event filtering (NIP-01 compliance)
- [ ] Relay authentication (NIP-42)
- [ ] Better GUN protocol support

## Troubleshooting

**WebSocket connection fails (400 error)**
- Ensure you're connecting with `Upgrade: websocket` header
- Verify endpoint URL is correct

**Events not stored**
- Durable Objects may restart, clearing in-memory storage
- For persistence, implement D1 database integration

**Slow performance**
- Check Cloudflare dashboard for errors
- Verify DNS is pointing to correct Worker

## Links

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [GUN Database](https://gun.eco/)
- [NIP-01 (Basic Protocol)](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-11 (Relay Info)](https://github.com/nostr-protocol/nips/blob/master/11.md)

## License

MIT License - See LICENSE file for details
