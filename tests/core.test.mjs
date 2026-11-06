import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItems } from '../src/csv.mjs';
import { createEngine, parseComposePs, validateCharacter, validateMessage } from '../src/engine.mjs';
test('CSV quotes and item ID', () => {
 const items = parseItems('id,name,type,description\r\n103,Giant Growth Potion,potion,"Big, ""very"" big"\r\n');
 assert.equal(items[0].id, 103); assert.equal(items[0].description, 'Big, "very" big');
});
test('malicious names/messages are rejected', () => {
 for (const s of ['../etc', 'A/b', '--help', 'A\nB', 'Test;rm']) assert.throws(() => validateCharacter(s));
 assert.throws(() => validateMessage('hello\nworld'));
});
test('Docker JSON lines status', () => {
 assert.equal(parseComposePs('{"Service":"api"}\n{"Service":"game"}').length, 2);
});
test('Docker command argument boundaries', async () => {
 const calls = [];
 const engine = createEngine('/server', async (_binary,args) => { calls.push(args); return 'ok'; });
 engine.items = async () => [{ id: 103, name: 'Giant Growth Potion' }];
 await engine.grant('Horizon TheBard', 103);
 await engine.announce('Hello Patreayl!');
 assert.deepEqual(calls[0].slice(0, 4), ['compose','exec','-T','api']);
 assert.ok(calls[0].at(-1).endsWith('/Horizon%20TheBard/103'));
 assert.deepEqual(calls[1].slice(0, 8), ['compose','exec','-T','game','node','orbus-server.js','repl','broadcast']);
});
