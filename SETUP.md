# Combined Relay Setup Guide

This guide provides detailed instructions for setting up and running the combined nostr and GUN relay.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Methods](#installation-methods)
3. [Configuration](#configuration)
4. [Running the Relays](#running-the-relays)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### For Docker Installation (Recommended)
- Docker (v20.10 or higher)
- Docker Compose (v2.0 or higher)

### For Manual Installation
- Node.js v18 or higher
- npm v8 or higher
- (Optional) For strfry: C++20 compiler, build tools, and dependencies

## Installation Methods

### Method 1: Docker Compose (Recommended)

This is the easiest method as it handles both relays automatically.

```bash
# Clone the repository
git clone https://github.com/draeder/relay.git
cd relay

# Start both relays
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the relays
docker-compose down
```

### Method 2: Manual Installation

#### GUN Relay Only

```bash
# Clone the repository
git clone https://github.com/draeder/relay.git
cd relay

# Install dependencies
npm install

# Start the GUN relay
npm start
```

#### Adding Nostr Relay (strfry)

See [strfry installation guide](https://github.com/hoytech/strfry#building) for detailed instructions.

Quick install on Ubuntu/Debian:

```bash
# Install build dependencies
sudo apt update
sudo apt install -y git g++ make pkg-config libtool ca-certificates \
  libyaml-perl libtemplate-perl libregexp-grammars-perl libssl-dev \
  zlib1g-dev liblmdb-dev libflatbuffers-dev libsecp256k1-dev libzstd-dev

# Clone and build strfry
git clone https://github.com/hoytech/strfry.git
cd strfry
git submodule update --init
make setup-golpe
make -j$(nproc)

# Copy config
cp ../strfry.conf .

# Run strfry
./strfry relay
```

## Configuration

### GUN Relay Configuration

The GUN relay can be configured via environment variables:

```bash
# Set custom port (default: 8765)
export PORT=9000

# Start with custom port
npm start
```

Or edit `index.js` directly for more advanced configuration.

### Nostr Relay Configuration

Edit `strfry.conf` to configure the nostr relay:

```conf
relay {
    # Port for nostr websocket (default: 7777)
    port = 7777
    
    # Bind address (0.0.0.0 for all interfaces)
    bind = "0.0.0.0"
    
    info {
        # Relay name
        name = "My Combined Relay"
        
        # Description
        description = "A combined nostr and GUN relay"
        
        # Admin pubkey (optional)
        pubkey = ""
        
        # Contact email (optional)
        contact = ""
    }
}
```

## Running the Relays

### Using Docker Compose

```bash
# Start in foreground (see logs)
docker-compose up

# Start in background
docker-compose up -d

# Restart services
docker-compose restart

# Stop services
docker-compose stop

# Remove services
docker-compose down
```

### Manual Execution

#### Terminal 1: GUN Relay
```bash
npm start
```

#### Terminal 2: Nostr Relay (if installed manually)
```bash
cd strfry
./strfry relay
```

## Cloudflare Worker (Nostr at /)

This project includes a minimal Nostr relay that runs on Cloudflare Workers using a Durable Object.

### Deploy

```bash
cd worker
wrangler deploy
```

### Environment Variables

- `NOSTR_MAX_EVENTS` (optional): max events kept in DO storage (default 1000)

## Testing

### Test GUN Relay

Create a test file `test-gun.js`:

```javascript
const Gun = require('gun');

// Connect to your relay
const gun = Gun(['http://localhost:8765/gun']);

// Write data
gun.get('test').put({ message: 'Hello from GUN!', time: Date.now() });

// Read data
gun.get('test').on((data) => {
  console.log('Received:', data);
});
```

Run it:
```bash
node test-gun.js
```

### Test Nostr Relay

Using `websocat` (install with `cargo install websocat`):

```bash
# Connect to the relay
websocat ws://localhost:7777

# Send a REQ message (after connecting)
["REQ","test-sub",{"kinds":[1],"limit":10}]
```

Or use a nostr client like [Damus](https://damus.io/), [Amethyst](https://github.com/vitorpamplona/amethyst), or [nostr-console](https://github.com/vishalxl/nostr-console).

### Web Interface

Open your browser and navigate to:
```
http://localhost:8765
```

This shows the status page for both relays.

## Troubleshooting

### Port Already in Use

If you get a "port already in use" error:

```bash
# Find process using port 8765 (GUN)
lsof -i :8765
# or
netstat -tulpn | grep 8765

# Find process using port 7777 (Nostr)
lsof -i :7777

# Kill the process
kill -9 <PID>
```

Or change the port in configuration.

### Docker Issues

```bash
# Check if containers are running
docker-compose ps

# View logs
docker-compose logs strfry
docker-compose logs gun-relay

# Rebuild containers
docker-compose build --no-cache
docker-compose up -d
```

### GUN Relay Not Connecting

1. Check if Node.js is installed: `node --version`
2. Verify dependencies are installed: `npm install`
3. Check if port 8765 is available
4. Check firewall settings

### Nostr Relay Not Working

1. Verify strfry is running: `docker-compose ps` or check the process
2. Test WebSocket connection: `websocat ws://localhost:7777`
3. Check strfry logs: `docker-compose logs strfry`
4. Verify `strfry.conf` is correctly formatted

### Permission Issues with strfry-db

If you get permission errors with the database:

```bash
# Fix permissions for the database directory
chmod -R 755 strfry-db
```

## Performance Tuning

### GUN Relay

For production, consider using PM2:

```bash
npm install -g pm2
pm2 start index.js --name gun-relay
pm2 save
pm2 startup
```

### Nostr Relay (strfry)

Edit `strfry.conf`:

```conf
relay {
    # Increase for more concurrent connections
    numThreads = 4
    
    # Adjust limits
    maxSubsPerConnection = 20
    maxFilterLimit = 500
}

dbParams {
    # Increase for better performance
    maxreaders = 512
}
```

## Production Deployment

For production, use a reverse proxy (nginx, caddy) for:
- HTTPS/WSS support
- Load balancing
- Rate limiting
- DDoS protection

Example nginx config:

```nginx
# GUN relay
location /gun {
    proxy_pass http://localhost:8765/gun;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# Nostr relay
location / {
    proxy_pass http://localhost:7777;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Additional Resources

- [Nostr Protocol Specification](https://github.com/nostr-protocol/nips)
- [strfry Documentation](https://github.com/hoytech/strfry/tree/master/docs)
- [GUN Documentation](https://gun.eco/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
