const express = require('express');
const crypto = require('node:crypto');
const Gun = require('gun');
const { WebSocketServer, WebSocket } = require('ws');

function createServer(options = {}) {
  const port = options.port || process.env.PORT || 8765;
  const enableLogging = options.log !== false;
  const skipGun = options.skipGun === true;
  const nostrOptions = Object.assign({ disableSignature: process.env.NOSTR_DISABLE_SIG === 'true' }, options.nostr || {});
  const gunOptions = Object.assign({}, options.gun, { web: undefined });

  const app = express();
  
  const nip11 = {
    name: 'Peer Relay',
    description: 'Node-based Nostr + GUN relay (in-memory Nostr)',
    pubkey: '',
    contact: '',
    supported_nips: [1, 11],
    software: 'combined-relay-node',
    version: '1.0.0'
  };
  
  app.get('/nostr', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(nip11));
  });
  
  app.get('/', (req, res, next) => {
    const accept = (req.headers['accept'] || '').toLowerCase();
    if (accept.includes('application/nostr+json') || accept.includes('application/json')) {
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(JSON.stringify(nip11));
    } else {
      next();
    }
  });
  
  app.use(express.static('public'));

  if (skipGun) {
    app.get('/gun.js', (req, res) => {
      res.sendFile(require.resolve('gun/gun.js'));
    });
  } else {
    app.use(Gun.serve);
  }

  const server = app.listen(port, () => {
    if (enableLogging) {
      console.log(`GUN relay server running on port ${port}`);
      console.log(`Access the relay at: http://localhost:${port}/gun`);
    }
  });

  gunOptions.web = server;
  const gun = skipGun ? null : Gun(gunOptions);

  // --- Minimal in-memory Nostr relay (NIP-01 style) ---
  const nostrState = {
    events: [],
    subs: new Map(),
    upstreamSubs: new Map(),
  };

  // --- Upstream relay sync ---
  const upstreamRelays = (process.env.NOSTR_UPSTREAM_RELAYS || '').split(',').filter(r => r.trim()).map(r => r.trim());
  if (enableLogging && upstreamRelays.length > 0) {
    console.log('Syncing from upstream relays:', upstreamRelays);
  }

  const syncFromUpstream = async () => {
    if (upstreamRelays.length === 0) return;
    try {
      const { SimplePool } = await import('nostr-tools');
      const pool = new SimplePool();
      if (enableLogging) {
        console.log('Syncing from upstream relays:', upstreamRelays);
      }
      // Subscribe to recent events (last 1 day, limit 200)
      const filter = { since: Math.floor(Date.now() / 1000) - 86400, limit: 200 };
      const events = await pool.querySync(upstreamRelays, [filter]);
      if (enableLogging) {
        console.log(`Synced ${events.length} events from upstream relays`);
      }
      for (const event of events) {
        const existing = nostrState.events.find((e) => e.id === event.id);
        if (!existing) {
          nostrState.events.push(event);
          // Broadcast to all subscribers
          for (const [subId, sub] of nostrState.subs.entries()) {
            if (sub.ws.readyState === WebSocket.OPEN) {
              const shouldSend = sub.filters.some((f) => matchesFilter(event, f));
              if (shouldSend) {
                sendEventToSub(sub.ws, subId, event);
              }
            }
          }
        }
      }
      pool.close(upstreamRelays);
    } catch (err) {
      if (enableLogging) {
        console.error('Error syncing from upstream relays:', err.message);
      }
    }
  };

  // Start syncing on server startup
  setImmediate(() => syncFromUpstream());

  let nostrToolsPromise;
  const loadNostrTools = () => {
    if (!nostrToolsPromise) {
      nostrToolsPromise = import('nostr-tools');
    }
    return nostrToolsPromise;
  };

  let upstreamPool;
  const getUpstreamPool = async () => {
    const { SimplePool } = await loadNostrTools();
    if (!upstreamPool) {
      upstreamPool = new SimplePool();
    }
    return upstreamPool;
  };

  const computeEventId = (event) => {
    const payload = [0, event.pubkey, event.created_at, event.kind, event.tags || [], event.content || ''];
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  };

  const basicEventChecks = (event) => {
    if (!event || typeof event !== 'object') return 'invalid: not an object';
    if (typeof event.pubkey !== 'string') return 'invalid pubkey';
    if (typeof event.sig !== 'string') return 'invalid sig';
    if (typeof event.id !== 'string') return 'invalid id';
    if (typeof event.kind !== 'number') return 'invalid kind';
    if (typeof event.created_at !== 'number') return 'invalid created_at';
    if (!Array.isArray(event.tags)) return 'invalid tags';
    if (typeof event.content !== 'string') return 'invalid content';
    const id = computeEventId(event);
    if (id !== event.id) return 'invalid id hash';
    return null;
  };

  const verifySignature = async (event) => {
    if (nostrOptions.disableSignature) return true;
    try {
      const { verifySignature: verify } = await loadNostrTools();
      return verify(event);
    } catch (err) {
      if (enableLogging) {
        console.error('nostr signature verification failed', err);
      }
      return false;
    }
  };

  const matchesFilter = (event, filter) => {
    if (!filter) return true;
    if (filter.ids && Array.isArray(filter.ids) && filter.ids.length) {
      if (!filter.ids.some((id) => event.id.startsWith(id))) return false;
    }
    if (filter.authors && Array.isArray(filter.authors) && filter.authors.length) {
      if (!filter.authors.some((a) => event.pubkey.startsWith(a))) return false;
    }
    if (filter.kinds && Array.isArray(filter.kinds) && filter.kinds.length) {
      if (!filter.kinds.includes(event.kind)) return false;
    }
    // Tag filters: keys like '#e', '#p', '#d' must match event.tags
    for (const key of Object.keys(filter)) {
      if (key.startsWith('#')) {
        const values = filter[key];
        if (Array.isArray(values) && values.length) {
          const tagKey = key.slice(1);
          const hasMatch = (event.tags || []).some((t) => Array.isArray(t) && t[0] === tagKey && values.includes(t[1]));
          if (!hasMatch) return false;
        }
      }
    }
    if (filter.since && event.created_at < filter.since) return false;
    if (filter.until && event.created_at > filter.until) return false;
    return true;
  };

  const sendEventToSub = (ws, subId, event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['EVENT', subId, event]));
    }
  };

  const fulfillHistory = (ws, subId, filters, hasUpstreamBridge = false) => {
    const sent = new Set();
    filters.forEach((filter) => {
      let remaining = typeof filter.limit === 'number' ? filter.limit : Infinity;
      for (const ev of nostrState.events) {
        if (remaining <= 0) break;
        if (matchesFilter(ev, filter) && !sent.has(ev.id)) {
          sendEventToSub(ws, subId, ev);
          sent.add(ev.id);
          remaining -= 1;
        }
      }
    });
    // If upstream bridging is active, wait 4s for remote events before EOSE
    if (hasUpstreamBridge) {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(['EOSE', subId]));
        }
      }, 4000);
    } else if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['EOSE', subId]));
    }
  };

  const handleEventMessage = async (ws, payload) => {
    const event = payload[1];
    const basicError = basicEventChecks(event);
    if (basicError) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['OK', event && event.id ? event.id : null, false, basicError]));
      }
      return;
    }

    const validSig = await verifySignature(event);
    if (!validSig) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['OK', event.id, false, 'invalid: bad signature']));
      }
      return;
    }

    nostrState.events.push(event);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['OK', event.id, true, '']));
    }

    for (const [subId, sub] of nostrState.subs.entries()) {
      if (ws.readyState !== WebSocket.OPEN && sub.ws !== ws) {
        // continue delivering to other subscribers even if sender disconnected
      }
      if (sub.ws.readyState !== WebSocket.OPEN) continue;
      const shouldSend = sub.filters.some((f) => matchesFilter(event, f));
      if (shouldSend) {
        sendEventToSub(sub.ws, subId, event);
      }
    }

    // Publish upstream only if we require valid signatures
    try {
      if (upstreamRelays.length > 0 && !nostrOptions.disableSignature) {
        const pool = await getUpstreamPool();
        // Fire-and-forget publish; upstream may reject invalid events
        pool.publish(upstreamRelays, event);
      }
    } catch (err) {
      if (enableLogging) {
        console.error('Error publishing to upstream relays:', err.message);
      }
    }
  };

  const handleReqMessage = async (ws, payload) => {
    const subId = payload[1];
    let filters = payload.slice(2).filter((f) => f && typeof f === 'object');
    if (!subId || !filters.length) {
      return;
    }
    nostrState.subs.set(subId, { ws, filters });
    fulfillHistory(ws, subId, filters, upstreamRelays.length > 0);

    // Bridge this subscription to upstream relays so remote events flow in
    if (upstreamRelays.length > 0) {
      try {
        // Augment filters for common tag aliases (e.g., '#t' and '#room')
        filters = filters.map((f) => {
          const nf = { ...f };
          if (nf['#t'] && !nf['#room']) nf['#room'] = nf['#t'];
          if (nf['#room'] && !nf['#t']) nf['#t'] = nf['#room'];
          return nf;
        });
        if (enableLogging) {
          try {
            console.log('bridging upstream sub', subId, JSON.stringify(filters));
          } catch {}
        }
        // Manual upstream bridging via ws for Node reliability
        const sockets = [];
        upstreamRelays.forEach((relayUrl, idx) => {
          const connect = (attempt = 1) => {
            try {
              const rws = new WebSocket(relayUrl, { perMessageDeflate: false });
              const timeoutHandle = setTimeout(() => {
                if (rws.readyState !== WebSocket.OPEN) {
                  if (enableLogging) console.error(`upstream ws timeout [${attempt}]`, relayUrl);
                  rws.close();
                  if (attempt < 2) {
                    setTimeout(() => connect(attempt + 1), 1000 * attempt);
                  }
                }
              }, 5000);
              rws.on('open', () => {
                clearTimeout(timeoutHandle);
                if (enableLogging) console.log('upstream ws connected', relayUrl);
                try {
                  const subKey = `up_${subId}_${idx}`;
                  rws.send(JSON.stringify(['REQ', subKey, ...filters]));
                } catch (err) {
                  if (enableLogging) console.error('upstream send error', err.message);
                }
              });
              rws.on('message', (data) => {
                let msg;
                try { msg = JSON.parse(data.toString()); } catch { return; }
                if (!Array.isArray(msg)) return;
                if (msg[0] === 'EVENT' && msg[2] && typeof msg[2] === 'object') {
                  const event = msg[2];
                  if (enableLogging) {
                    try { console.log('upstream EVENT', event.id, 'tags:', JSON.stringify(event.tags || [])); } catch {}
                  }
                  if (!nostrState.events.find((e) => e.id === event.id)) {
                    nostrState.events.push(event);
                  }
                  for (const [sid, sub] of nostrState.subs.entries()) {
                    if (sub.ws.readyState !== WebSocket.OPEN) continue;
                    const shouldSend = sub.filters.some((f) => matchesFilter(event, f));
                    if (shouldSend) {
                      sendEventToSub(sub.ws, sid, event);
                    }
                  }
                }
              });
              rws.on('error', (err) => {
                if (enableLogging) console.error(`upstream ws error [${attempt}]`, relayUrl, err && err.message ? err.message : err);
                if (attempt < 2) {
                  setTimeout(() => connect(attempt + 1), 1000 * attempt);
                }
              });
              rws.on('close', () => {
                if (enableLogging) console.log('upstream ws closed', relayUrl);
              });
              sockets.push(rws);
            } catch (err) {
              if (enableLogging) console.error('Error creating upstream ws', relayUrl, err.message);
              if (attempt < 2) {
                setTimeout(() => connect(attempt + 1), 1000 * attempt);
              }
            }
          };
          connect();
        });
        nostrState.upstreamSubs.set(subId, { sockets });
      } catch (err) {
        if (enableLogging) {
          console.error('Error bridging upstream subscription:', err.message);
        }
      }
    }
  };

  const handleCloseMessage = (payload) => {
    const subId = payload[1];
    if (subId) {
      nostrState.subs.delete(subId);
      const upstreamData = nostrState.upstreamSubs.get(subId);
      if (upstreamData && upstreamData.sockets) {
        try {
          upstreamData.sockets.forEach((socket) => {
            if (socket && socket.close) socket.close();
          });
        } catch (err) {
          if (enableLogging) {
            console.error('Error closing upstream sockets', err.message);
          }
        }
      }
      nostrState.upstreamSubs.delete(subId);
    }
  };

  // Ensure nostr-tools can use WebSocket in Node environment
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = WebSocket;
  }

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  // Capture existing upgrade listeners (e.g., GUN) so we can route upgrades explicitly
  const passthroughUpgradeHandlers = server.listeners('upgrade');
  passthroughUpgradeHandlers.forEach((handler) => server.removeListener('upgrade', handler));

  wss.on('connection', (ws) => {
    if (enableLogging) {
      console.log('nostr connection open');
    }
    ws.on('message', async (data) => {
      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch (err) {
        return;
      }
      if (!Array.isArray(payload) || typeof payload[0] !== 'string') {
        return;
      }

      const type = payload[0];
      try {
        if (enableLogging) {
          if (type === 'REQ') {
            console.log('REQ received', payload[1], JSON.stringify(payload.slice(2)));
          } else if (type === 'EVENT') {
            console.log('EVENT received', (payload[1] && payload[1].id) || 'no-id');
          } else if (type === 'CLOSE') {
            console.log('CLOSE received', payload[1]);
          }
        }
        if (type === 'EVENT') {
          await handleEventMessage(ws, payload);
        } else if (type === 'REQ') {
          handleReqMessage(ws, payload);
        } else if (type === 'CLOSE') {
          handleCloseMessage(payload);
        }
      } catch (err) {
        if (enableLogging) {
          console.error('nostr handler error', err);
        }
      }
    });

    ws.on('close', () => {
      if (enableLogging) {
        console.log('nostr connection closed');
      }
      // Drop any subscriptions owned by this socket
      for (const [id, sub] of nostrState.subs.entries()) {
        if (sub.ws === ws) {
          nostrState.subs.delete(id);
        }
      }
    });

    ws.on('error', (err) => {
      if (enableLogging) {
        console.error('nostr websocket error', err && err.message ? err.message : err);
      }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    if (enableLogging) {
      console.log('upgrade request', req.url, 'ua:', req.headers['user-agent'] || 'n/a');
    }
    if (req.url !== '/nostr' && req.url !== '/' && req.url !== '') {
      // Delegate non-nostr upgrades (e.g., GUN) to their original handlers
      for (const handler of passthroughUpgradeHandlers) {
        handler.call(server, req, socket, head);
      }
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (enableLogging) {
        console.log('nostr websocket upgraded');
      }
      wss.emit('connection', ws, req);
    });
  });

  if (enableLogging) {
    console.log('Combined relay started:');
    if (skipGun) {
      console.log('- GUN relay is skipped (testing mode)');
    } else {
      console.log('- GUN relay is running on this process');
    }
    console.log('- Nostr relay (Node, in-memory) is running at path /nostr');
  }

  const shutdownGun = () => {
    if (!gun) {
      return;
    }
    try {
      const peers = (gun._ && gun._.opt && gun._.opt.peers) || {};
      Object.values(peers).forEach((peer) => {
        if (peer.wire && peer.wire.close) {
          peer.wire.close();
        }
        if (peer.socket && peer.socket.close) {
          peer.socket.close();
        }
      });
      if (gun.off) {
        gun.off();
      }
      if (gun._ && gun._.opt && gun._.opt.multicast && gun._.opt.multicast.close) {
        gun._.opt.multicast.close();
      }
      if (gun._ && gun._.opt && gun._.opt.radisk && gun._.opt.radisk.close) {
        gun._.opt.radisk.close();
      }
    } catch (err) {
      if (enableLogging) {
        console.error('Error shutting down GUN', err);
      }
    }
  };

  const close = () => new Promise((resolve, reject) => {
    shutdownGun();
    wss.clients.forEach((client) => client.close());
    wss.close(() => {
      try {
        if (upstreamPool && upstreamRelays.length > 0) {
          upstreamPool.close(upstreamRelays);
        }
      } catch {}
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  return { app, server, gun, close };
}

module.exports = { createServer };
