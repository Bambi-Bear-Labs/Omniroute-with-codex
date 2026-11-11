import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeContext, parseGrokAliases } from "./normalize.mjs";

export const BRIDGE_ID = "codex-grok-context-bridge-v1";
export const HEALTH_PATH = "/__codex_grok_bridge_health";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPSTREAM = "http://localhost:20128";
const DEFAULT_PORT = 20129;
const HOP_HEADERS = new Set([
  "connection", "proxy-connection", "keep-alive", "transfer-encoding",
  "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"
]);

function forwardHeaders(source) {
  const remove = new Set(HOP_HEADERS);
  for (const key of String(source.connection ?? "").split(",")) {
    if (key.trim()) remove.add(key.trim().toLowerCase());
  }
  return Object.fromEntries(Object.entries(source).filter(([key]) => !remove.has(key.toLowerCase())));
}

export function createBridge({
  upstream = DEFAULT_UPSTREAM,
  maxBufferBytes = 64 * 1024 * 1024,
  logger = entry => console.log(JSON.stringify({ time: new Date().toISOString(), ...entry })),
  exposeHealth = true,
  grokAliases = []
} = {}) {
  const target = new URL(upstream);
  if (target.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("The bridge can only forward to a fixed loopback HTTP server.");
  }
  const stats = { requests: 0, normalizedRequests: 0, normalizedItems: 0 };
  const startedAt = new Date().toISOString();
  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (exposeHealth && req.method === "GET" && pathname === HEALTH_PATH) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ id: BRIDGE_ID, pid: process.pid, directory: HERE,
        startedAt, upstream, ...stats }));
      return;
    }
    if (!(req.url ?? "").startsWith("/")) {
      res.writeHead(400); res.end("Only origin-form request paths are supported."); return;
    }
    stats.requests++;
    let outgoing;
    let streamingUpload = false;
    let chunks = [];
    let bytes = 0;
    let cancelled = false;
    const cancel = () => { cancelled = true; outgoing?.destroy(); };
    req.on("aborted", cancel);
    req.on("error", cancel);
    res.on("close", () => { if (!res.writableEnded) cancel(); });

    function dispatch(body, liveUpload = false, changed = false) {
      const headers = forwardHeaders(req.headers);
      headers.host = target.host;
      if (changed) {
        headers["content-length"] = String(body.length);
        // A body-bound digest would be stale after a deliberate transformation.
        delete headers["content-md5"];
        delete headers.digest;
      }
      outgoing = http.request({
        hostname: target.hostname.replace(/^\[|\]$/g, ""),
        port: target.port || 80,
        method: req.method,
        path: req.url,
        headers
      }, incoming => {
        if (cancelled) { incoming.destroy(); return; }
        res.writeHead(incoming.statusCode ?? 502, incoming.statusMessage,
          forwardHeaders(incoming.headers));
        incoming.on("error", () => res.destroy());
        incoming.pipe(res); // No parsing, buffering, or rewriting of SSE responses.
      });
      outgoing.on("error", error => {
        if (cancelled) return;
        logger({ event: "upstream_error", code: error.code ?? "UNKNOWN" });
        if (res.headersSent) res.destroy();
        else {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "Local OmniRoute connection failed.",
            type: "bridge_connection_error" } }));
        }
      });
      if (cancelled) { outgoing.destroy(); return; }
      if (liveUpload) {
        if (body?.length) outgoing.write(body);
        req.pipe(outgoing);
      } else outgoing.end(body);
    }

    const encoding = String(req.headers["content-encoding"] ?? "identity").toLowerCase();
    const inspect = req.method === "POST" && /^\/v1\/responses\/?$/.test(pathname) &&
      encoding === "identity" && /^application\/json\b/i.test(req.headers["content-type"] ?? "");
    if (!inspect) { dispatch(undefined, true); return; }
    req.on("data", chunk => {
      if (streamingUpload) return;
      chunks.push(chunk); bytes += chunk.length;
      if (bytes > maxBufferBytes) {
        // Large uploads retain their original bytes instead of getting a new size limit.
        streamingUpload = true;
        dispatch(Buffer.concat(chunks), true);
        chunks = [];
      }
    });
    req.on("end", () => {
      if (streamingUpload || cancelled) return;
      let body = Buffer.concat(chunks);
      let count = 0;
      let model;
      try {
        const parsed = JSON.parse(body.toString("utf8"));
        const normalized = normalizeContext(parsed, { grokAliases });
        count = normalized.count;
        model = parsed?.model;
        if (count) body = Buffer.from(JSON.stringify(normalized.body));
      } catch { /* Invalid JSON is forwarded unchanged; OmniRoute owns validation. */ }
      if (count) {
        stats.normalizedRequests++; stats.normalizedItems += count;
        // No prompts, tool outputs, API keys, or authentication headers are logged.
        logger({ event: "normalized_context", model, contextItems: count });
      }
      dispatch(body, false, count > 0);
    });
  });
  server.requestTimeout = 0;
  server.timeout = 0;
  return server;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const server = createBridge({
    grokAliases: parseGrokAliases(process.env.OMNIROUTE_CODEX_GROK_ALIASES)
  });
  const stateFile = path.join(HERE, "bridge-state.json");
  const removeOwnState = () => {
    try {
      if (JSON.parse(fs.readFileSync(stateFile, "utf8")).pid === process.pid) fs.unlinkSync(stateFile);
    } catch { /* No state to remove. */ }
  };
  server.on("error", error => {
    console.error(JSON.stringify({ event: "listen_error", code: error.code ?? "UNKNOWN" }));
    process.exitCode = 1;
  });
  server.listen(DEFAULT_PORT, "127.0.0.1", () => {
    fs.writeFileSync(stateFile, JSON.stringify({ id: BRIDGE_ID, pid: process.pid,
      address: "127.0.0.1", port: DEFAULT_PORT, upstream: DEFAULT_UPSTREAM }, null, 2) + "\n");
    console.log(JSON.stringify({ event: "listening", address: "127.0.0.1", port: DEFAULT_PORT }));
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
    server.close(() => { removeOwnState(); process.exit(0); });
    setTimeout(() => { removeOwnState(); process.exit(0); }, 3000).unref();
  });
  process.on("exit", removeOwnState);
}
