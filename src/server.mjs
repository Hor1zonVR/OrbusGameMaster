import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine, ADMIN_ACTIONS } from './engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = resolve(process.env.ORBUS_SERVER_PATH || join(root, '..', 'reborn-server'));
const port = Number(process.env.GM_PORT || 4177);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw Error('Invalid GM_PORT');
const token = process.env.GM_TOKEN || randomBytes(32).toString('hex');
const engine = createEngine(serverPath);
const logFile = join(root, 'logs', 'audit.jsonl');
const readonly = process.env.GM_READ_ONLY === '1';

function json(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(JSON.stringify(data));
}
function authorized(req) {
  const given = req.headers['x-gm-token'];
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function parseBody(req) {
  let s = '';
  for await (const chunk of req) {
    s += chunk.toString('utf8');
    if (s.length > 8192) throw Error('Request too large');
  }
  let data;
  try { data = JSON.parse(s); } catch { throw Error('Invalid JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid request');
  return data;
}
async function audit(type, outcome, details) {
  try {
    await mkdir(dirname(logFile), { recursive: true });
    await appendFile(logFile, JSON.stringify({ time: new Date().toISOString(), type, outcome, details }) + '\n', { mode: 0o600 });
  } catch (e) { console.error('Audit log warning:', e.message); }
}
async function history() {
  try {
    const content = await readFile(logFile, 'utf8');
    return content.trim().split(/\r?\n/).slice(-60).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    }).reverse();
  } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function execute(res, type, body, operation) {
  try {
    const result = await operation();
    await audit(type, 'command-completed', body);
    return json(res, 200, { ok: true, result, notice: 'The command completed. Verify the in-game outcome.' });
  } catch (e) {
    await audit(type, 'failed', body);
    throw e;
  }
}
const assets = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/style.css', ['style.css','text/css; charset=utf-8']],
  ['/app.js', ['app.js','text/javascript; charset=utf-8']]
]);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [name, mime] = assets.get(url.pathname);
      const content = await readFile(join(root, 'public', name));
      res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
      return res.end(content);
    }
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (!authorized(req)) return json(res, 401, { error: 'Invalid access token' });
    if (req.method === 'POST' && req.headers['content-type']?.split(';')[0] !== 'application/json') return json(res, 415, { error: 'Expected JSON' });
    if (req.method === 'POST' && readonly) return json(res, 403, { error: 'Read-only mode' });

    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { ...await engine.status(), readonly });
    if (req.method === 'GET' && url.pathname === '/api/items') return json(res, 200, { items: await engine.items() });
    if (req.method === 'GET' && url.pathname === '/api/logs') return json(res, 200, { logs: await engine.logs() });
    if (req.method === 'GET' && url.pathname === '/api/audit') return json(res, 200, { entries: await history() });
    if (req.method === 'POST' && url.pathname === '/api/lookup') {
      const { character } = await parseBody(req);
      return execute(res, 'lookup', {character}, () => engine.lookup(character));
    }
    if (req.method === 'POST' && url.pathname === '/api/player') {
      const data = await parseBody(req);
      if (!ADMIN_ACTIONS.includes(data.action)) return json(res, 400, { error: 'Unknown player action' });
      return execute(res, 'player:' + data.action, { character: data.character, action: data.action, value: data.value, hours: data.hours }, () => engine.player(data.action, data));
    }
    if (req.method === 'POST' && url.pathname === '/api/grant') {
      const { character, itemId } = await parseBody(req);
      return execute(res, 'grant', { character, itemId }, () => engine.grant(character, itemId));
    }
    if (req.method === 'POST' && url.pathname === '/api/bundle') {
      const { character, itemIds } = await parseBody(req);
      return execute(res, 'bundle', { character, itemIds }, () => engine.grantBundle(character, itemIds));
    }
    if (req.method === 'POST' && url.pathname === '/api/announce') {
      const { message } = await parseBody(req);
      return execute(res, 'announce', { message }, () => engine.announce(message));
    }
    if (req.method === 'POST' && url.pathname === '/api/restart') {
      const { confirmation } = await parseBody(req);
      return execute(res, 'restart', { requested: true }, () => engine.restart(confirmation));
    }
    return json(res, 404, { error: 'Unknown action' });
  } catch (e) {
    const message = String(e.message || e).slice(0, 300);
    return json(res, message === 'Request too large' ? 413 : 400, { error: message });
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('Dashboard: http://127.0.0.1:' + port);
  console.log('Server folder: ' + serverPath);
  console.log('Access token: ' + token);
  console.log('Read-only: ' + readonly);
});
