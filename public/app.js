const $ = id => document.getElementById(id);
let token = '', items = [], selectedId = null, readonly = false, busyFlag = false;
const favourites = new Set();
let bundle = [];
function alertText(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
async function api(path, payload) {
  if (!token) throw Error('Enter the access token shown in PowerShell first.');
  const res = await fetch('/api/' + path, {
    method: payload !== undefined ? 'POST' : 'GET',
    headers: { 'x-gm-token': token, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'Request failed');
  return data;
}
function option(value, label) {
  const el = document.createElement('option');
  el.value = value; el.textContent = label;
  return el;
}
function setFilters() {
  for (const [id,key] of [['type-filter','type'], ['rarity-filter','rarity']]) {
    const sel=$(id), value=sel.value;
    sel.replaceChildren(option('', key === 'type' ? 'All types' : 'All rarities'));
    for (const v of [...new Set(items.map(x=>x[key]).filter(Boolean))].sort()) sel.append(option(v,v));
    sel.value = value;
  }
}
function itemSymbol(item) {
  const t = (item.type + ' ' + item.name).toLowerCase();
  if (t.includes('potion')) return '⚗';
  if (t.includes('bow') || t.includes('ranger')) return '🏹';
  if (t.includes('wand') || t.includes('mage')) return '✧';
  if (t.includes('sword')) return '⚔';
  if (t.includes('hammer') || t.includes('mallet')) return '⚒';
  if (t.includes('fish')) return '🐟';
  if (t.includes('mount')) return '♞';
  if (t.includes('armor') || t.includes('equipment')) return '⬡';
  if (t.includes('ingredient') || t.includes('material')) return '◆';
  return '✦';
}
function itemById(id) { return items.find(x => x.id === id); }
function filter() {
  const q = $('search').value.toLowerCase().trim();
  const type = $('type-filter').value, rarity = $('rarity-filter').value, onlyFav = $('faves-only').checked;
  const filtered = items.filter(x => (!q || x.name.toLowerCase().includes(q) || String(x.id).includes(q))
    && (!type || x.type===type) && (!rarity || x.rarity===rarity) && (!onlyFav || favourites.has(x.id)));
  $('item-count').textContent = filtered.length + ' matching items (showing up to 180)';
  const root = $('item-results');
  root.replaceChildren();
  for (const item of filtered.slice(0,180)) {
    const btn = document.createElement('button'); btn.type='button';
    btn.className = 'item-row' + (selectedId===item.id?' selected':'');
    const icon = document.createElement('span'); icon.className='item-icon rarity-'+String(item.rarity).toLowerCase(); icon.textContent=itemSymbol(item);
    const content = document.createElement('span'); content.className='item-row-text';
    const name=document.createElement('strong'); name.textContent=item.name;
    const meta=document.createElement('small'); meta.textContent='#'+item.id+' · '+item.type+' · '+item.rarity;
    content.append(name,meta);
    const star=document.createElement('span'); star.textContent=favourites.has(item.id)?'★':'';
    btn.append(icon,content,star);
    btn.onclick=()=>{selectedId=item.id; preview();filter();};
    root.append(btn);
  }
  if (!filtered.length) root.textContent = 'No matching items.';
}
function preview() {
  const item = itemById(selectedId);
  const root=$('preview'); root.replaceChildren();
  if (item) {
    const title=document.createElement('strong'); title.textContent=itemSymbol(item)+'  '+item.name;
    const meta=document.createElement('small'); meta.textContent='#'+item.id+' · '+item.rarity+' · '+item.type;
    const description=document.createElement('p'); description.textContent=item.description || 'No description provided by the catalogue.';
    root.append(title,meta,description);
  } else root.textContent='Select an item from the library.';
  $('favourite').disabled=!item;
  $('grant').disabled=!item;
  $('add-bundle').disabled=!item||bundle.length>=12;
  $('favourite').textContent=item&&favourites.has(item.id)?'★ Unfavourite':'☆ Favourite';
}
function renderBundle() {
  $('bundle-count').textContent=bundle.length+' / 12';
  const root=$('bundle-list');root.replaceChildren();
  if (!bundle.length) root.textContent='No items queued';
  for (const [index,id] of bundle.entries()) {
    const item=itemById(id);
    const row=document.createElement('div');row.className='bundle-row';
    const txt=document.createElement('span');txt.textContent=(item?item.name:'#'+id);
    const remove=document.createElement('button');remove.className='secondary';remove.textContent='×';remove.title='Remove item';
    remove.onclick=()=>{bundle.splice(index,1);renderBundle();preview();};
    row.append(txt,remove);root.append(row);
  }
  $('send-bundle').disabled=!bundle.length;
  preview();
}
function playerName() {
  const name=$('character').value.trim();
  if (!name) throw Error('Enter the exact character name first.');
  return name;
}
function showActionFields() {
  const action=$('player-action').value;
  $('value-box').hidden=!(action==='rename'||action==='surname');
  $('hours-box').hidden=action!=='ban';
  $('force-box').hidden=action!=='surname';
  $('value-label').textContent=action==='rename'?'NEW CHARACTER NAME':'NEW SURNAME';
}
function resourceList(stats) {
  const root=$('resource-list');root.replaceChildren();
  if (!stats.length) { root.textContent='No running container metrics available.';return; }
  for (const s of stats) {
    const item=document.createElement('div');item.className='resource-item';
    const name=document.createElement('strong');name.textContent=s.name;
    const info=document.createElement('small');info.textContent='CPU '+s.cpu+' · RAM '+s.memory;
    item.append(name,info);root.append(item);
  }
}
async function refreshStatus() {
  const status=await api('status');
  readonly=status.readonly;
  for (const name of ['game','api']) {
    const s=status.services.find(x=>x.service===name);
    $(name+'-state').textContent=s?.state||'Offline';
    $(name+'-detail').textContent=s?.status||'Not running';
  }
  $('others').textContent=String(status.services.filter(x=>!['game','api'].includes(x.service)).length);
  $('info').textContent=status.error||JSON.stringify(status.serverInfo,null,2)||'No server info returned';
  resourceList(status.stats||[]);
  $('refresh-time').textContent='Last refresh: '+new Date().toLocaleTimeString()+(status.statsError?' · Stats unavailable':'');
  $('conn').textContent='● Connected'+(readonly?' · READ ONLY':'');
  $('conn').classList.add('ok');
  for (const el of document.querySelectorAll('button:not(#connect):not(#refresh):not(#refresh-logs):not(#refresh-audit):not(#lookup)')) {
    if (el.id==='favourite'||el.id==='add-bundle'||el.id==='clear-bundle') continue;
    if (readonly) el.disabled=true;
    else if (['grant','send-bundle','player-submit','announce','restart'].includes(el.id)) el.disabled=false;
  }
  preview();renderBundle();
}
async function refresh() {
  try {
    const cat=await api('items');items=cat.items;setFilters();filter();await refreshStatus();
    alertText(readonly?'Connected (read-only).':'Connected. Docker state refreshed; all admin changes require confirmation.');
  } catch (e) {
    $('conn').textContent='● Disconnected';$('conn').classList.remove('ok');alertText(e.message,true);
  }
}
async function busy(id,fn) {
  if (busyFlag) return;
  busyFlag=true;$(id).disabled=true;
  try {await fn();}catch(e){alertText(e.message,true);}
  finally {busyFlag=false;$(id).disabled=false;}
}
async function loadLogs() {
  const data=await api('logs');
  $('logs').textContent=data.logs||'No logs returned.';
}
async function loadAudit() {
  const data=await api('audit'),root=$('audit-list');root.replaceChildren();
  if (!data.entries.length) return root.textContent='No audit events yet.';
  for (const ev of data.entries) {
    const row=document.createElement('div');row.className='audit-row';
    const title=document.createElement('strong');title.textContent=ev.type+' · '+ev.outcome;
    const meta=document.createElement('small');meta.textContent=new Date(ev.time).toLocaleString()+' · '+JSON.stringify(ev.details);
    row.append(title,meta);root.append(row);
  }
}
$('connect').onclick=()=>{token=$('token').value.trim();$('token').value='';refresh();};
$('refresh').onclick=()=>busy('refresh',refresh);
for (const id of ['search','type-filter','rarity-filter','faves-only']) $(id).addEventListener(id==='search'?'input':'change',filter);
$('favourite').onclick=()=>{if(selectedId==null)return;favourites.has(selectedId)?favourites.delete(selectedId):favourites.add(selectedId);preview();filter();};
$('add-bundle').onclick=()=>{if(selectedId!=null&&bundle.length<12){bundle.push(selectedId);renderBundle();}};
$('clear-bundle').onclick=()=>{bundle=[];renderBundle();};
$('grant').onclick=()=>busy('grant',async()=>{
  const character=playerName(),item=itemById(selectedId);
  if (!item)throw Error('Select an item first.');
  if (!confirm('Give '+item.name+' (#'+item.id+') to '+character+'?'))return;
  const r=await api('grant',{character,itemId:item.id});
  alertText('Grant command completed for '+character+'. Verify in-game. '+(r.result.response||''));
  await loadAudit();
});
$('send-bundle').onclick=()=>busy('send-bundle',async()=>{
  const character=playerName();
  if(!bundle.length)throw Error('Bundle is empty.');
  if(!confirm('Give '+bundle.length+' items to '+character+'? This cannot be undone automatically.'))return;
  const r=await api('bundle',{character,itemIds:bundle});
  alertText('Bundle: '+r.result.completed+'/'+r.result.requested+' commands completed. Verify inventory.',r.result.completed!==r.result.requested);
  await loadAudit();
});
$('player-action').onchange=showActionFields;showActionFields();
$('lookup').onclick=()=>busy('lookup',async()=>{
  const r=await api('lookup',{character:playerName()});
  $('player-response').textContent='Account lookup response: '+(r.result.response||'(empty)');
  alertText('Lookup command completed.');await loadAudit();
});
$('player-submit').onclick=()=>busy('player-submit',async()=>{
  const character=playerName(),action=$('player-action').value;
  const data={character,action};
  if(action==='rename'||action==='surname')data.value=$('player-value').value.trim();
  if(action==='surname')data.force=$('surname-force').checked;
  if(action==='ban')data.hours=Number($('ban-hours').value);
  const detail=action==='ban'?' for '+data.hours+' hours':data.value?' → '+data.value:'';
  if(!confirm('Execute '+action+' on '+character+detail+'?\n\nThis affects the real server.'))return;
  const r=await api('player',data);
  $('player-response').textContent='Server response: '+(r.result.response||'(empty)');
  alertText(action+' command completed. Verify in-game.');
  await loadAudit();
});
$('preset').onchange=()=>{if($('preset').value){$('message').value=$('preset').value;$('message').dispatchEvent(new Event('input'));}};
$('message').oninput=()=>$('count').textContent=$('message').value.length+' / 160';
$('announce').onclick=()=>busy('announce',async()=>{
  const message=$('message').value.trim();
  if(!message)throw Error('Type an announcement first.');
  if(!confirm('Broadcast to ALL online players?\n\n'+message))return;
  const r=await api('announce',{message});
  alertText('Broadcast command completed. '+(r.result.response||''));await loadAudit();
});
$('refresh-logs').onclick=()=>busy('refresh-logs',loadLogs);
$('refresh-audit').onclick=()=>busy('refresh-audit',loadAudit);
$('restart').onclick=()=>busy('restart',async()=>{
  const response=prompt('This disconnects players. Type RESTART to confirm:');
  if(response!=='RESTART')return;
  await api('restart',{confirmation:response});
  alertText('Restart command completed. Server may need a moment to recover.');
  await loadAudit();await refreshStatus();
});
setInterval(()=>{if(token&&!busyFlag)refreshStatus().catch(e=>alertText('Status refresh: '+e.message,true));},30000);
