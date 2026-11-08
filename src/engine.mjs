import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseItems } from './csv.mjs';

export const GIANT_GROWTH_ID = 103;
export const ADMIN_ACTIONS = Object.freeze(['rename', 'surname', 'resetposition', 'ban', 'unban', 'restore']);

export function validateCharacter(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 _'-]{0,39}$/.test(v)
    || v.trim() !== v || v.includes('  ')) throw Error('Invalid character name (1–40 characters; letters, numbers, spaces, apostrophes, _ or -)');
  return v;
}
export function validateSurname(v) {
  if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z'-]{0,29}$/.test(v)) throw Error('Surname must be 1–30 letters, apostrophes or hyphens');
  return v;
}
export function validateMessage(v) {
  if (typeof v !== 'string' || v.trim() !== v || v.length < 3 || v.length > 160
    || /[\r\n\x00-\x1F\x7F]/.test(v)) throw Error('Announcement must be one line, 3–160 characters');
  return v;
}
export function validateItem(v, items) {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^\d+$/.test(v))) throw Error('Invalid item ID');
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1 || !items.some(x => x.id === n)) throw Error('Choose a valid item from the catalogue');
  return n;
}
export function validateBundle(ids, items) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 12) throw Error('Bundle must contain 1–12 items');
  return ids.map(id => validateItem(id, items));
}
export function validateBanHours(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 8760) throw Error('Ban duration must be 1–8760 whole hours');
  return n;
}
export function runCommand(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { cwd: options.cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finished = false;
    const finish = (err, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (err) reject(err); else resolve(value);
    };
    const timer = setTimeout(() => { proc.kill(); finish(Error('Docker command timed out')); }, options.timeout || 20000);
    const add = (a, b) => (a + b.toString('utf8')).slice(0, 49152);
    proc.stdout.on('data', c => { stdout = add(stdout, c); });
    proc.stderr.on('data', c => { stderr = add(stderr, c); });
    proc.on('error', e => finish(Error('Cannot launch Docker: ' + e.message)));
    proc.on('close', code => code === 0 ? finish(null, stdout.trim()) : finish(Error(('Docker exited ' + code + ': ' + (stderr || stdout)).slice(0, 1200))));
  });
}
export function parseComposePs(text) {
  if (!text.trim()) return [];
  let values;
  try { values = JSON.parse(text); }
  catch { values = text.trim().split(/\r?\n/).map(line => JSON.parse(line)); }
  return (Array.isArray(values) ? values : [values]).map(v => ({
    name: String(v.Name || v.name || ''), service: String(v.Service || v.service || ''),
    state: String(v.State || v.state || ''), status: String(v.Status || v.status || '')
  }));
}
export function parseDockerStats(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      const v = JSON.parse(line);
      return [{ name: String(v.Name || ''), cpu: String(v.CPUPerc || ''), memory: String(v.MemUsage || ''), memoryPercent: String(v.MemPerc || '') }];
    } catch { return []; }
  });
}
export function adminPath(action, data) {
  const name = encodeURIComponent(validateCharacter(data.character));
  switch (action) {
    case 'rename': return '/renamecharacter/' + name + '/' + encodeURIComponent(validateCharacter(data.value));
    case 'surname': return '/surname/' + name + '/' + encodeURIComponent(validateSurname(data.value)) + '/' + (data.force === true ? '1' : '0');
    case 'resetposition': return '/resetposition/' + name;
    case 'ban': return '/ban/' + name + '/' + validateBanHours(data.hours);
    case 'unban': return '/unban/' + name;
    case 'restore': return '/restore/' + name;
    default: throw Error('Unknown player action');
  }
}
export function createEngine(serverPath, run = runCommand) {
  const invoke = (...args) => run('docker', ['compose', ...args], { cwd: serverPath });
  const admin = (path) => invoke('exec', '-T', 'api', 'curl', '-fsS', '--max-time', '12', 'http://localhost:3000/admin' + path);
  const inventoryPath = join(serverPath, 'content', 'items', 'item-serverdata.txt');
  return {
    async items() {
      return parseItems(await readFile(inventoryPath, 'utf8'));
    },
    async status() {
      const [ps, info] = await Promise.allSettled([
        invoke('ps', '--format', 'json'),
        invoke('exec', '-T', 'api', 'curl', '-fsS', '--max-time', '8', 'http://localhost:3000/serverinfo')
      ]);
      let services = [], serverInfo = null, stats = [], statsError = null;
      if (ps.status === 'fulfilled') {
        try { services = parseComposePs(ps.value); } catch {
          return { services: [], serverInfo: null, stats: [], error: 'Unrecognised Docker status format' };
        }
      }
      if (info.status === 'fulfilled') {
        try { serverInfo = JSON.parse(info.value); } catch { serverInfo = { response: info.value.slice(0, 500) }; }
      }
      const names = services.filter(s => s.name && ['game', 'api', 'rethinkdb', 'redis'].includes(s.service) && s.state.toLowerCase() === 'running').map(s => s.name);
      if (names.length) {
        try {
          stats = parseDockerStats(await run('docker', ['stats', '--no-stream', '--format', '{{json .}}', ...names], { cwd: serverPath, timeout: 12000 }));
        } catch (e) { statsError = e.message; }
      }
      return { services, serverInfo, stats, statsError, error: ps.status === 'rejected' ? ps.reason.message : null };
    },
    async logs() {
      return (await invoke('logs', '--tail', '100', '--no-color', 'game', 'api')).slice(-16000);
    },
    async lookup(character) {
      const name = validateCharacter(character);
      const output = await admin('/accountfor/' + encodeURIComponent(name));
      return { character: name, response: output.slice(0, 1500) };
    },
    async player(action, data) {
      if (!ADMIN_ACTIONS.includes(action)) throw Error('Unknown player action');
      const path = adminPath(action, data);
      const output = await admin(path);
      return { action, character: data.character, response: output.slice(0, 1500) };
    },
    async grant(character, itemId) {
      const name = validateCharacter(character);
      const id = validateItem(itemId, await this.items());
      const output = await admin('/updateinventory/' + encodeURIComponent(name) + '/' + id);
      return { character: name, itemId: id, response: output.slice(0, 1500) };
    },
    async grantBundle(character, itemIds) {
      const name = validateCharacter(character);
      const validated = validateBundle(itemIds, await this.items());
      const results = [];
      for (const id of validated) {
        try {
          const response = await admin('/updateinventory/' + encodeURIComponent(name) + '/' + id);
          results.push({ itemId: id, commandCompleted: true, response: response.slice(0, 400) });
        } catch (e) {
          results.push({ itemId: id, commandCompleted: false, error: e.message.slice(0, 300) });
          break; // Prevent an unnoticed partial bundle from continuing
        }
      }
      return { character: name, requested: validated.length, completed: results.filter(x => x.commandCompleted).length, results };
    },
    async announce(message) {
      const text = validateMessage(message);
      const output = await invoke('exec', '-T', 'game', 'node', 'orbus-server.js', 'repl', 'broadcast', text);
      return { message: text, response: output.slice(0, 1500) };
    },
    async restart(confirmation) {
      if (confirmation !== 'RESTART') throw Error('Type RESTART to confirm');
      const output = await invoke('restart', 'game', 'api');
      return { response: output.slice(0, 1500) };
    }
  };
}
