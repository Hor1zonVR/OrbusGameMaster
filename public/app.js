const $ = id => document.getElementById(id);
let token = '', items = [];
function alertText(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
async function api(path, payload) {
  if (!token) throw Error('Enter the access token shown in PowerShell first.');
  const res = await fetch('/api/' + path, {
    method: payload ? 'POST' : 'GET',
    headers: { 'x-gm-token': token, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'Request failed');
  return data;
}
async function refresh() {
  try {
    const [status, catalogue] = await Promise.all([api('status'), api('items')]);
    items = catalogue.items;
    for (const name of ['game','api']) {
      const s = status.services.find(x => x.service === name);
      $(name + '-state').textContent = s?.state || 'Offline';
      $(name + '-detail').textContent = s?.status || 'Not running';
    }
    $('others').textContent = String(status.services.filter(x => !['game','api'].includes(x.service)).length);
    $('info').textContent = status.error || JSON.stringify(status.serverInfo, null, 2) || 'No server info returned';
    $('conn').textContent = '● Connected'; $('conn').classList.add('ok');
    filter();
    alertText(status.readonly ? 'Connected in read-only mode.' : 'Connected to the local admin dashboard.');
  } catch(e) {
    $('conn').textContent = '● Disconnected'; $('conn').classList.remove('ok');
    alertText(e.message, true);
  }
}
function filter() {
  const selected = $('selection'), old = selected.value;
  const q = $('search').value.toLowerCase().trim();
  selected.replaceChildren();
  const add = (id, title) => {
    const opt = document.createElement('option'); opt.value = id; opt.textContent = title;
    selected.append(opt);
  };
  add('', 'Select an item');
  for (const item of items.filter(x => x.name.toLowerCase().includes(q) || String(x.id).includes(q)).slice(0,250)) {
    add(String(item.id), '#' + item.id + ' · ' + item.name);
  }
  if ([...selected.options].some(x => x.value === old)) selected.value = old;
  preview();
}
function preview() {
  const item = items.find(x => String(x.id) === $('selection').value);
  $('preview').textContent = item ? item.name + ' · ' + item.rarity + ' · ' + item.type : 'No item selected';
}
async function busy(id, fn) {
  $(id).disabled = true;
  try { await fn(); } catch(e) { alertText(e.message, true); }
  finally { $(id).disabled = false; }
}
$('connect').onclick = () => { token = $('token').value.trim(); $('token').value = ''; refresh(); };
$('refresh').onclick = refresh;
$('search').oninput = filter;
$('selection').onchange = preview;
$('message').oninput = () => { $('count').textContent = $('message').value.length + ' / 160'; };
$('grant').onclick = () => busy('grant', async () => {
  const character = $('character').value.trim();
  const itemId = Number($('selection').value);
  const item = items.find(x => x.id === itemId);
  if (!character || !item) return alertText('Enter a character name and select an item.', true);
  if (!confirm('Give ' + item.name + ' (#' + item.id + ') to ' + character + '?')) return;
  const response = await api('grant', { character, itemId });
  alertText('Grant command finished. Server response: ' + (response.result.response || '(empty)'));
});
$('announce').onclick = () => busy('announce', async () => {
  const message = $('message').value.trim();
  if (!message) return alertText('Type a message first.', true);
  if (!confirm('Broadcast to ALL online players?\n\n' + message)) return;
  const response = await api('announce', { message });
  alertText('Broadcast command finished. Server response: ' + (response.result.response || '(empty)'));
});
