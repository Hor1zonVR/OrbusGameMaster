import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseItems } from './csv.mjs';

export const GIANT_GROWTH_ID = 103;
export function validateCharacter(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 _'-]{0,39}$/.test(v)
    || v.trim() !== v || v.includes('  ')) throw Error('Invalid character name (1–40 characters; letters, numbers, spaces, apostrophes, _ or -)');
  return v;
}
export function validateMessage(v) {
  if (typeof v !== 'string' || v.trim() !== v || v.length < 3 || v.length > 160
    || /[\r\n\x00-\x1F\x7F]/.test(v)) throw Error('Announcement must be one line, 3–160 characters');
  return v;
}
export function validateItem(v, items) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1 || !items.some(x => x.id === n)) throw Error('Choose a valid item from the catalogue');
  return n;
}
// Child process arguments are ALWAYS an array with shell:false.
export function runCommand(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { cwd: options.cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finished = false;
    const finish = (err, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (err) reject(err); else resolve(value);
    };
    const timer = setTimeout(() => { proc.kill(); finish(Error('Docker command timed out')); }, options.timeout || 15000);
    const add = (a, b) => (a + b.toString('utf8')).slice(0, 49152);
    proc.stdout.on('data', c => { stdout = add(stdout, c); });
    proc.stderr.on('data', c => { stderr = add(stderr, c); });
    proc.on('error', e => finish(Error('Cannot launch Docker: ' + e.message)));
    proc.on('close', code => code === 0 ? finish(null, stdout.trim()) : finish(Error(('Docker exited ' + code + ': ' + (stderr || stdout)).slice(0, 1000))));
  });
}
export function parseComposePs(text) {
  if (!text.trim()) return [];
  let values;
  try { values = JSON.parse(text); }
  catch { values = text.trim().split(/\r?\n/).map(line => JSON.parse(line)); }
  return (Array.isArray(values) ? values : [values]).map(v => ({
    name: String(v.Name || v.name || ''),
    service: String(v.Service || v.service || ''),
    state: String(v.State || v.state || ''),
    status: String(v.Status || v.status || '')
  }));
}
export function createEngine(serverPath, run = runCommand) {
  const invoke = (...args) => run('docker', ['compose', ...args], { cwd: serverPath });
  return {
    async items() {
      return parseItems(await readFile(join(serverPath, 'content', 'items', 'item-serverdata.txt'), 'utf8'));
    },
    async status() {
      const [ps, info] = await Promise.allSettled([
        invoke('ps', '--format', 'json'),
        invoke('exec', '-T', 'api', 'curl', '-fsS', '--max-time', '8', 'http://localhost:3000/serverinfo')
      ]);
      let services = [], serverInfo = null;
      if (ps.status === 'fulfilled') {
        try { services = parseComposePs(ps.value); } catch { return { services: [], serverInfo: null, error: 'Unrecognised Docker status format' }; }
      }
      if (info.status === 'fulfilled') {
        try { serverInfo = JSON.parse(info.value); } catch { serverInfo = { response: info.value.slice(0, 500) }; }
      }
      return { services, serverInfo, error: ps.status === 'rejected' ? ps.reason.message : null };
    },
    async grant(character, itemId) {
      const name = validateCharacter(character);
      const id = validateItem(itemId, await this.items());
      const url = 'http://localhost:3000/admin/updateinventory/' + encodeURIComponent(name) + '/' + id;
      const output = await invoke('exec', '-T', 'api', 'curl', '-fsS', '--max-time', '10', url);
      return { character: name, itemId: id, response: output.slice(0, 1500) };
    },
    async announce(message) {
      const text = validateMessage(message);
      const output = await invoke('exec', '-T', 'game', 'node', 'orbus-server.js', 'repl', 'broadcast', text);
      return { message: text, response: output.slice(0, 1500) };
    }
  };
}
