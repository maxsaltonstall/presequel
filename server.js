import './server/tracer.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { runQuery } from './server/duckdb.js';
import { validateSql } from './server/security.js';
import { translateTagFilter } from './server/ddsql.js';
import { allowRequest } from './server/ratelimit.js';
import { log } from './server/logger.js';
import { metrics } from './server/metrics.js';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.sql':  'text/plain; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.parquet': 'application/octet-stream',
};

async function serveStatic(req, res) {
  // Resolve requested path against project root, prevent directory traversal
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const requested = resolve(__dirname, '.' + normalize(urlPath));
  if (!requested.startsWith(__dirname)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(requested);
    const type = MIME[extname(requested)] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    if (type.startsWith('text/html')) {
      headers['Content-Security-Policy'] =
        "default-src 'self'; " +
        "script-src 'self' https://esm.sh; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self' https://esm.sh; " +
        "font-src 'self' data:; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'";
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['Referrer-Policy'] = 'no-referrer';
    }
    res.writeHead(200, headers).end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404).end('Not found');
    } else {
      res.writeHead(500).end('Server error');
    }
  }
}

const MAX_BODY = 64 * 1024; // 64 KB

async function readJsonBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    const timeout = setTimeout(() => {
      fail(new Error('body read timeout'));
      req.destroy();
    }, 5000);
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        clearTimeout(timeout);
        fail(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      clearTimeout(timeout);
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s) return fail(new Error('empty body'));
      try { ok(JSON.parse(s)); }
      catch { fail(new Error('invalid json')); }
    });
    req.on('error', (err) => { clearTimeout(timeout); fail(err); });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleRun(req, res) {
  const startNs = process.hrtime.bigint();
  const ip = req.socket.remoteAddress || 'unknown';

  if (!allowRequest(ip)) {
    log.warn('query.rate_limited', { ip });
    metrics.increment('chrono.query.rejected', { reason: 'rate_limit' });
    return sendJson(res, 429, { error: 'Rate limit exceeded — slow down.' });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch (err) {
    log.warn('query.body_error', { ip, reason: err.message });
    return sendJson(res, 400, { error: err.message });
  }
  const { chapter, sql } = body;
  if (typeof chapter !== 'string' || typeof sql !== 'string') {
    return sendJson(res, 400, { error: 'chapter and sql are required strings' });
  }
  if (!/^[a-z0-9-]+$/.test(chapter)) {
    return sendJson(res, 400, { error: 'invalid chapter id' });
  }
  const translated = translateTagFilter(sql);
  const validation = validateSql(translated);
  if (!validation.ok) {
    log.warn('query.rejected', { ip, chapter, reason: validation.error, sql_preview: sql.slice(0, 120) });
    metrics.increment('chrono.query.rejected', { reason: 'security', chapter });
    return sendJson(res, 400, { error: validation.error });
  }
  try {
    const result = await runQuery(chapter, translated);
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    log.info('query.ok', {
      ip, chapter,
      rows: result.rows?.length ?? 0,
      truncated: !!result.truncated,
      duration_ms: Math.round(durationMs),
    });
    metrics.increment('chrono.query.run', { chapter, status: 'ok' });
    metrics.timing('chrono.query.duration', Math.round(durationMs), { chapter });
    return sendJson(res, 200, result);
  } catch (err) {
    log.error('query.duckdb_error', { ip, chapter, reason: err.message });
    metrics.increment('chrono.query.run', { chapter, status: 'error' });
    return sendJson(res, 200, { error: err.message });
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
  }
  if (req.method === 'GET') return serveStatic(req, res);
  if (req.method === 'POST' && req.url === '/run') return handleRun(req, res);
  res.writeHead(405).end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Chrono Consulting running at http://localhost:${PORT}`);
});

function shutdown(signal) {
  log.info('shutdown', { signal });
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
