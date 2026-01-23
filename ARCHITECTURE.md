# Combined Relay Architecture

## Overview

This project combines two powerful decentralized technologies:

1. **Nostr Relay (strfry)** - A high-performance relay for the Nostr protocol
2. **GUN Relay** - A decentralized P2P graph database

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│           Combined Relay Server                      │
│                                                      │
│  ┌──────────────────┐    ┌──────────────────────┐  │
│  │  GUN Relay       │    │  Nostr Relay         │  │
│  │  (Node.js)       │    │  (strfry/C++)        │  │
│  ├──────────────────┤    ├──────────────────────┤  │
│  │ Port: 8765       │    │ Port: 7777           │  │
│  │ HTTP/WebSocket   │    │ WebSocket (Nostr)    │  │
│  │ Protocol: GUN    │    │ Protocol: Nostr      │  │
│  ├──────────────────┤    ├──────────────────────┤  │
│  │ Database:        │    │ Database:            │  │
│  │ ./radata/        │    │ ./strfry-db/         │  │
│  └──────────────────┘    └──────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
              │                      │
              │                      │
         P2P clients           Nostr clients
      (web apps, nodes)    (social apps, etc)
```

## Technology Stack

### GUN Relay
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: GUN's built-in graph database
- **Storage**: Local filesystem (`./radata/`)
- **Protocol**: HTTP/WebSocket with custom P2P protocol
- **Port**: 8765 (configurable)

### Nostr Relay (strfry)
- **Language**: C++20
- **Database**: LMDB (Lightning Memory-Mapped Database)
- **Storage**: Local filesystem (`./strfry-db/`)
- **Protocol**: WebSocket (Nostr NIPs)
- **Port**: 7777 (configurable in strfry.conf)

## Protocols

### GUN Protocol
GUN uses a graph-based data model with eventual consistency:
- **CRDT-based**: Conflict-free replicated data types
- **Real-time sync**: Changes propagate instantly
- **P2P capable**: Direct browser-to-browser connections
- **Offline-first**: Works without network, syncs when available

Example data structure:
```javascript
{
  "users": {
    "alice": {
      "name": "Alice",
      "age": 30
    }
  }
}
```

### Nostr Protocol
Nostr uses a simple event-based model:
- **Events**: JSON objects with signatures
- **Relays**: Store and forward events
- **Subscriptions**: Real-time event streaming
- **NIPs**: Nostr Implementation Possibilities (protocol specs)

Example event:
```json
{
  "id": "abc123...",
  "pubkey": "xyz789...",
  "created_at": 1234567890,
  "kind": 1,
  "tags": [],
  "content": "Hello, Nostr!",
  "sig": "signature..."
}
```

## Data Flow

### GUN Relay Data Flow
```
Client A                 GUN Relay               Client B
   │                         │                       │
   │─── PUT data ──────────> │                       │
   │                         │─── broadcast ───────> │
   │                         │                       │
   │<── acknowledgment ───── │                       │
   │                         │<── GET data ───────── │
   │                         │─── send data ───────> │
```

### Nostr Relay Data Flow
```
Client A                Nostr Relay              Client B
   │                         │                       │
   │─── EVENT msg ────────> │                       │
   │<── OK response ──────── │                       │
   │                         │                       │
   │                         │<── REQ subscription ── │
   │                         │─── EVENT ───────────> │
   │                         │                       │
   │                         │<── CLOSE sub ────────  │
```

## Deployment Options

### Option 1: Docker Compose (Recommended)
```bash
docker-compose up -d
```
- Runs both relays in containers
- Automatic networking
- Easy to manage
- Isolated environments

### Option 2: Manual Installation
```bash
# Terminal 1: GUN relay
npm start

# Terminal 2: Nostr relay
cd strfry && ./strfry relay
```
- More control
- Direct access to logs
- Better for development

### Option 3: Production (with reverse proxy)
```
Internet
   │
   ├─> Nginx/Caddy (HTTPS/WSS)
   │      │
   │      ├─> GUN Relay (port 8765)
   │      └─> Nostr Relay (port 7777)
   │
```
- SSL/TLS termination
- Load balancing
- DDoS protection
- Rate limiting

## Use Cases

### GUN Relay Use Cases
1. **Decentralized Apps**: Build web apps that work offline
2. **Collaborative Tools**: Real-time collaboration without central server
3. **P2P Networks**: Create mesh networks for data sharing
4. **Encrypted Messaging**: Secure communication with built-in encryption
5. **User Authentication**: Decentralized identity management

### Nostr Relay Use Cases
1. **Social Networks**: Censorship-resistant social media
2. **Messaging**: Private, decentralized messaging
3. **Publishing**: Blog posts, articles, content distribution
4. **Communities**: Decentralized forums and groups
5. **Marketplace**: P2P commerce without intermediaries

## Performance Considerations

### GUN Relay
- **Memory**: ~50-100 MB base + data size
- **CPU**: Low (event-driven)
- **Storage**: Grows with data (graph structure)
- **Connections**: Limited by Node.js event loop (~10k concurrent)

### Nostr Relay (strfry)
- **Memory**: ~100-500 MB base + cache
- **CPU**: Medium (event validation, signature verification)
- **Storage**: Grows with events (LMDB is very efficient)
- **Connections**: Very high (C++ multi-threaded)

## Security

### GUN Security Features
- **SEA (Security, Encryption, Authorization)**: Built-in crypto
- **User keypairs**: Public/private key authentication
- **Encrypted data**: End-to-end encryption support
- **No central authority**: Decentralized by design

### Nostr Security Features
- **Digital signatures**: All events cryptographically signed
- **Public key identity**: Users identified by pubkey
- **Event validation**: Relays verify signatures
- **Client-side encryption**: Optional encrypted DMs (NIP-04)

## Monitoring

### Health Checks
```bash
# Check GUN relay
curl http://localhost:8765/

# Check Nostr relay (requires WebSocket client)
websocat ws://localhost:7777
```

### Logs
```bash
# Docker logs
docker-compose logs -f gun-relay
docker-compose logs -f strfry

# Manual logs (stdout)
```

## Scaling

### Horizontal Scaling
- Deploy multiple instances behind a load balancer
- GUN will sync between instances automatically
- Nostr clients can connect to multiple relays

### Vertical Scaling
- Increase memory for larger datasets
- More CPU cores for higher throughput
- SSD storage for faster database access

## Backup and Recovery

### GUN Backup
```bash
# Backup the graph database
tar -czf gun-backup.tar.gz radata/
```

### Nostr Backup
```bash
# Export all events
./strfry export > events-backup.jsonl

# Or backup the database
tar -czf strfry-backup.tar.gz strfry-db/
```

## Further Reading

### GUN Resources
- [GUN Documentation](https://gun.eco/docs/)
- [GUN GitHub](https://github.com/amark/gun)
- [GUN Chat](http://chat.gun.eco)

### Nostr Resources
- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [strfry Documentation](https://github.com/hoytech/strfry)
- [Nostr NIPs](https://github.com/nostr-protocol/nips)

### Related Projects
- [Gun-relay implementations](https://github.com/amark/gun/wiki/Relay-Servers)
- [Other Nostr relays](https://nostr.watch/)
- [Nostr clients](https://github.com/aljazceru/awesome-nostr)
