import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItems } from '../src/csv.mjs';
import { createEngine, parseComposePs, validateCharacter, validateMessage, validateBanHours, validateBundle, adminPath, parseDockerStats } from '../src/engine.mjs';
test('CSV quotes and item ID', () => {
 const items = parseItems('id,name,type,description\r\n103,Giant Growth Potion,potion,"Big, ""very"" big"\r\n');
 assert.equal(items[0].id, 103); assert.equal(items[0].description, 'Big, "very" big');
});
test('rejects malicious names and announcements', () => {
 for (const s of ['../etc', 'A/b', '--help', 'A\nB', 'Test;rm']) assert.throws(() => validateCharacter(s));
 assert.throws(() => validateMessage('hello\nworld'));
});
test('Docker Compose JSON lines status and stats', () => {
 assert.equal(parseComposePs('{"Service":"api"}\n{"Service":"game"}').length, 2);
 assert.deepEqual(parseDockerStats('{"Name":"test","CPUPerc":"1.2%","MemUsage":"20MiB / 1GiB"}')[0].cpu, '1.2%');
});
test('player action URL paths validate and encode names', () => {
 assert.equal(adminPath('rename', {character:'Horizon TheBard',value:'Horizon New'}), '/renamecharacter/Horizon%20TheBard/Horizon%20New');
 assert.equal(adminPath('surname', {character:'Horizon',value:'TheBard',force:true}), '/surname/Horizon/TheBard/1');
 assert.equal(adminPath('ban', {character:'Horizon',hours:48}), '/ban/Horizon/48');
 assert.throws(() => adminPath('exec', {character:'Horizon'}));
 assert.throws(() => validateBanHours(0));
 assert.throws(() => validateBanHours(9000));
});
test('bundle caps before issuing any command', () => {
 const items = [{id:103}];
 assert.deepEqual(validateBundle([103, 103], items), [103, 103]);
 assert.throws(() => validateBundle(Array(13).fill(103), items));
 assert.throws(() => validateBundle([104], items));
});
test('Docker calls keep arguments separate and target right service', async () => {
 const calls = [];
 const engine = createEngine('/server', async (_binary, args) => { calls.push(args); return 'ok'; });
 engine.items = async () => [{id:103,name:'Giant Growth Potion'}];
 await engine.grant('Horizon TheBard',103);
 await engine.player('resetposition',{character:'Horizon'});
 await engine.announce('Hello Patreayl!');
 await engine.restart('RESTART');
 assert.deepEqual(calls[0].slice(0,4),['compose','exec','-T','api']);
 assert.ok(calls[0].at(-1).endsWith('/Horizon%20TheBard/103'));
 assert.ok(calls[1].at(-1).endsWith('/resetposition/Horizon'));
 assert.deepEqual(calls[2].slice(0,8),['compose','exec','-T','game','node','orbus-server.js','repl','broadcast']);
 assert.deepEqual(calls[3],['compose','restart','game','api']);
});
test('bundle stops on first Docker failure and reports partial results', async () => {
 let calls=0;
 const engine=createEngine('/server',async()=>{ calls++; if(calls===2) throw Error('offline'); return 'ok'; });
 engine.items=async()=>[{id:103}];
 const x=await engine.grantBundle('Horizon',[103,103,103]);
 assert.equal(x.completed,1); assert.equal(x.results.length,2); assert.equal(calls,2);
});
