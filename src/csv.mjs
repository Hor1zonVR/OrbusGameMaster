export function parseCsv(source) {
  const rows = []; let row = [], cell = '', quoted = false;
  const s = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (quoted) throw Error('Unterminated CSV quote');
  if (row.length || cell) { row.push(cell); rows.push(row); }
  return rows;
}
export function parseItems(source) {
  const [header, ...rows] = parseCsv(source);
  if (!header || !header.includes('id') || !header.includes('name')) throw Error('Invalid item catalogue');
  const ix = Object.fromEntries(header.map((k, i) => [k.trim(), i]));
  return rows.filter(r => /^\d+$/.test(r[ix.id] || '')).map(r => ({
    id: Number(r[ix.id]), name: r[ix.name] || '', type: r[ix.type] || '',
    rarity: r[ix.rarity] || '', description: r[ix.description] || ''
  }));
}
