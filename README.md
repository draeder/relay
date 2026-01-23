# Combined Relay

A combined nostr and GUN relay that integrates:
- **Nostr relay** using [strfry](https://github.com/hoytech/strfry) - A high-performance nostr relay
- **GUN relay** - A decentralized P2P graph database relay

## Features

- **Nostr Protocol Support**: Websocket-based nostr relay using strfry
- **GUN Database Support**: P2P graph database synchronization
- **Docker Support**: Easy deployment with Docker Compose
- **Dual Protocol**: Run both protocols simultaneously on different ports

## Quick Start

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/draeder/relay.git
cd relay
```

2. Start both relays:
```bash
docker-compose up -d
```

This will start:
- **Nostr relay (strfry)** on port `7777` (WebSocket at `ws://localhost:7777`)
- **GUN relay** on port `8765` (HTTP/WebSocket at `http://localhost:8765/gun`)

3. Check the status:
```bash
docker-compose ps
docker-compose logs
```

### Manual Installation

#### GUN Relay

1. Install Node.js (v18 or higher)
2. Install dependencies:
```bash
npm install
```

3. Start the GUN relay:
```bash
npm start
```

The GUN relay will be available at `http://localhost:8765/gun`

#### Nostr Relay (strfry)

For manual strfry installation, see the [strfry documentation](https://github.com/hoytech/strfry).

Quick install on Debian/Ubuntu:
```bash
sudo apt install -y git build-essential libyaml-perl libtemplate-perl \
  libregexp-grammars-perl libssl-dev zlib1g-dev liblmdb-dev \
  libflatbuffers-dev libsecp256k1-dev libzstd-dev

git clone https://github.com/hoytech/strfry.git
cd strfry
git submodule update --init
make setup-golpe
make -j4
./strfry relay
```

## Configuration

### GUN Relay Configuration

Edit `index.js` to customize the GUN relay settings. Default port is `8765`.

Set environment variable to change port:
```bash
PORT=9000 npm start
```

### Nostr Relay Configuration

Edit `strfry.conf` to customize the strfry relay settings. Key configurations:
- `relay.port`: WebSocket port (default: 7777)
- `relay.bind`: Interface to bind (default: 0.0.0.0)
- `relay.info.*`: Relay metadata (name, description, contact)
- `db`: Database path

## Usage

### Connecting to the GUN Relay

```javascript
const Gun = require('gun');
const gun = Gun(['http://localhost:8765/gun']);

// Store data
gun.get('greeting').put({ message: 'Hello, World!' });

// Read data
gun.get('greeting').on((data) => {
  console.log(data); // { message: 'Hello, World!' }
});
```

### Connecting to the Nostr Relay

Use any nostr client with the WebSocket URL: `ws://localhost:7777`

Example with nostr-tools:
```javascript
import { relayInit } from 'nostr-tools';

const relay = relayInit('ws://localhost:7777');
await relay.connect();

// Subscribe to events
let sub = relay.sub([{ kinds: [1] }]);
sub.on('event', event => {
  console.log('Received event:', event);
});
```

## Ports

- **7777**: Nostr relay (strfry) WebSocket
- **8765**: GUN relay HTTP/WebSocket

## Development

### Running in Development Mode

```bash
npm run dev
```

### Building Docker Images

```bash
docker-compose build
```

## Architecture

```
┌─────────────────────────────────────┐
│      Combined Relay Server          │
├─────────────────┬───────────────────┤
│  GUN Relay      │  Nostr Relay      │
│  (Node.js)      │  (strfry)         │
│  Port: 8765     │  Port: 7777       │
│  P2P Graph DB   │  Nostr Protocol   │
└─────────────────┴───────────────────┘
```

## License

MIT License - See LICENSE file for details

## Links

- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [strfry (Nostr Relay)](https://github.com/hoytech/strfry)
- [GUN Database](https://gun.eco/)
- [GUN GitHub](https://github.com/amark/gun)
