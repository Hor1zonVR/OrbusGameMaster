import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from './engine.mjs';

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
    if (s.length > 2048) throw Error('Request too large');
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
    if (req.method === 'POST' && url.pathname === '/api/grant') {
      const { character, itemId } = await parseBody(req);
      try {
        const result = await engine.grant(character, itemId);
        await audit('grant', 'docker-command-completed', { character, itemId });
        return json(res, 200, { ok: true, result });
      } catch (e) {
        await audit('grant', 'failed', { character, itemId });
        throw e;
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/announce') {
      const { message } = await parseBody(req);
      try {
        const result = await engine.announce(message);
        await audit('announce', 'docker-command-completed', { message });
        return json(res, 200, { ok: true, result });
      } catch (e) {
        await audit('announce', 'failed', { message });
        throw e;
      }
    }
    return json(res, 404, { error: 'Unknown action' });
  } catch (e) {
    return json(res, e.message === 'Request too large' ? 413 : 400, { error: String(e.message || e).slice(0, 300) });
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('Dashboard: http://127.0.0.1:' + port);
  console.log('Server folder: ' + serverPath);
  console.log('Access token: ' + token);
  console.log('Read-only: ' + readonly);
});
