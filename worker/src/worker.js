const DEFAULT_MAX_EVENTS = 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route GUN requests to GUN Durable Object
    if (url.pathname.startsWith("/gun")) {
      const id = env.GUN_RELAY.idFromName("gun");
      const stub = env.GUN_RELAY.get(id);
      return stub.fetch(request);
    }

    // Nostr at root
    if (url.pathname === "/" || url.pathname === "") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
        const id = env.NOSTR_RELAY.idFromName("nostr");
        const stub = env.NOSTR_RELAY.get(id);
        return stub.fetch(request);
      }

      const nip11 = {
        name: "Peer Relay (Cloudflare)",
        description: "Nostr relay on Cloudflare Durable Objects + GUN relay",
        pubkey: "",
        contact: "",
        supported_nips: [1, 11],
        software: "combined-relay-worker",
        version: "1.0.0"
      };

      const accept = (request.headers.get("Accept") || "").toLowerCase();
      if (accept.includes("application/nostr+json") || accept.includes("application/json")) {
        return new Response(JSON.stringify(nip11), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify(nip11), {
        status: 200,
        headers: { "Content-Type": "application/nostr+json" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};

export class NostrRelay {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.events = [];
    this.maxEvents = 1000;
  }

  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 400 });
    }

    const [client, server] = new WebSocketPair();
    this.state.acceptWebSocket(server);

    // Return the client side to the client
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(ws, message) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (!Array.isArray(msg) || msg.length < 1) return;
    const type = msg[0];

    if (type === "EVENT") {
      const event = msg[1];
      const err = await this.validateEvent(event);
      if (err) {
        ws.send(JSON.stringify(["OK", event?.id || null, false, err]));
        return;
      }
      const existing = this.events.find((e) => e.id === event.id);
      if (!existing) {
        this.events.push(event);
        if (this.events.length > this.maxEvents) {
          this.events.shift();
        }
      }
      ws.send(JSON.stringify(["OK", event.id, true, ""]));
    } else if (type === "REQ") {
      const subId = msg[1];
      const filters = msg.slice(2);
      for (const evt of this.events) {
        if (!filters.length || filters.some((f) => this.match(evt, f))) {
          ws.send(JSON.stringify(["EVENT", subId, evt]));
        }
      }
      ws.send(JSON.stringify(["EOSE", subId]));
    } else if (type === "CLOSE") {
      // No-op for now
    }
  }

  async validateEvent(e) {
    if (!e || typeof e !== "object") return "invalid event";
    if (typeof e.id !== "string" || typeof e.sig !== "string") return "invalid id/sig";
    if (typeof e.pubkey !== "string" || typeof e.kind !== "number") return "invalid pubkey/kind";
    if (typeof e.created_at !== "number" || !Array.isArray(e.tags)) return "invalid created_at/tags";
    if (typeof e.content !== "string") return "invalid content";
    const id = await this.eventId(e);
    return id !== e.id ? "invalid id hash" : null;
  }

  async eventId(e) {
    const data = [0, e.pubkey, e.created_at, e.kind, e.tags, e.content];
    const buf = new TextEncoder().encode(JSON.stringify(data));
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }

  match(e, f) {
    if (!f) return true;
    if (f.ids?.length && !f.ids.some((id) => e.id.startsWith(id))) return false;
    if (f.authors?.length && !f.authors.some((a) => e.pubkey.startsWith(a))) return false;
    if (f.kinds?.length && !f.kinds.includes(e.kind)) return false;
    if (f.since && e.created_at < f.since) return false;
    if (f.until && e.created_at > f.until) return false;
    return true;
  }
}

export class GunRelay {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade for /gun
    if (url.pathname === "/gun" || url.pathname === "/gun/") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
        const [client, server] = new WebSocketPair();
        this.state.acceptWebSocket(server);

        return new Response(null, { status: 101, webSocket: client });
      }
    }

    // HTTP GET for /gun (health check)
    if (request.method === "GET" && (url.pathname === "/gun" || url.pathname === "/gun/")) {
      return new Response("GUN relay alive", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws, message) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (_) {
      return;
    }

    // Basic GUN message handling
    if (msg.get) {
      const soul = msg.get;
      const stored = await this.state.storage.get(soul);
      ws.send(JSON.stringify({ "@": msg["#"], put: stored || null }));
      return;
    }

    if (msg.put) {
      const soul = msg.soul || msg.get;
      if (!soul) return;
      await this.state.storage.put(soul, msg.put);
      ws.send(JSON.stringify({ "@": msg["#"], ok: true }));
      return;
    }
  }
}
