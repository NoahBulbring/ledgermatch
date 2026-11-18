const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const fmtDate = (d) => (d ? d.toISOString().slice(0, 10) : '—');

const state = { bank: null, ledger: null, result: null };

function setupDropzone(zoneId, inputId, onText) {
  const zone = $(zoneId), input = $(inputId);
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => input.files[0] && readFile(input.files[0], onText));
  ['dragover', 'dragenter'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) readFile(f, onText);
  });
}

function readFile(file, cb) {
  const r = new FileReader();
  r.onload = () => cb(r.result, file.name);
  r.readAsText(file);
}

function loadSide(side, text, label) {
  const txns = normalize(parseCSV(text));
  state[side] = txns;
  const zone = $(side + '-zone');
  zone.classList.add('loaded');
  zone.querySelector('.dz-title').textContent = label;
  zone.querySelector('.dz-sub').textContent = `${txns.length} transactions parsed`;
  maybeRun();
}

function maybeRun() {
  // only run once both files are loaded
  if (!state.bank || !state.ledger) return;
  state.result = reconcile(state.bank, state.ledger, parseInt($('window').value, 10) || 5);
  render(state.result);
}

function badge(score) {
  // 85 / 65 cutoffs are arbitrary
  const p = Math.round(score * 100);
  const cls = score >= 0.85 ? 'high' : score >= 0.65 ? 'med' : 'low';
  return `<span class="conf ${cls}">${p}%</span>`;
}

function render(r) {
  $('results').hidden = false;
  const s = r.stats;
  $('stat-rate').textContent = Math.round(s.matchRate * 100) + '%';
  $('stat-matched').textContent = s.matchedCount;
  $('stat-bank').textContent = s.bankCount - s.matchedCount;
  $('stat-ledger').textContent = s.ledgerCount - s.matchedCount;
  $('sum-bank').textContent = fmt(s.bankTotal);
  $('sum-ledger').textContent = fmt(s.ledgerTotal);
  const diff = Math.round((s.bankTotal - s.ledgerTotal) * 100) / 100;
  const de = $('sum-diff');
  de.textContent = fmt(diff);
  de.classList.toggle('bad', Math.abs(diff) >= 0.01);

  $('matched-body').innerHTML = r.matches.map((m) =>
    `<tr><td>${fmtDate(m.bank.date)}</td><td>${esc(m.bank.desc)}</td>
     <td>${fmtDate(m.ledger.date)}</td><td>${esc(m.ledger.desc)}</td>
     <td class="num">${fmt(m.bank.amount)}</td><td class="num">${badge(m.score)}</td></tr>`).join('');

  $('ub-body').innerHTML = r.unmatchedBank.map((t) =>
    `<tr><td>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td class="num">${fmt(t.amount)}</td></tr>`).join('') ||
    '<tr><td colspan="3" class="empty">None — every bank transaction is matched ✓</td></tr>';

  $('ul-body').innerHTML = r.unmatchedLedger.map((t) =>
    `<tr><td>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td class="num">${fmt(t.amount)}</td></tr>`).join('') ||
    '<tr><td colspan="3" class="empty">None — every ledger entry is matched ✓</td></tr>';

  $('ub-count').textContent = r.unmatchedBank.length;
  $('ul-count').textContent = r.unmatchedLedger.length;
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function exportReport() {
  // TODO: .xlsx support — a lot of bank exports come as Excel
  const r = state.result;
  if (!r) return;
  const lines = ['Section,Bank date,Bank description,Ledger date,Ledger description,Amount,Confidence'];
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  for (const m of r.matches)
    lines.push(['Matched', fmtDate(m.bank.date), q(m.bank.desc), fmtDate(m.ledger.date), q(m.ledger.desc), m.bank.amount.toFixed(2), Math.round(m.score * 100) + '%'].join(','));
  for (const t of r.unmatchedBank)
    lines.push(['Unmatched (bank only)', fmtDate(t.date), q(t.desc), '', '', t.amount.toFixed(2), ''].join(','));
  for (const t of r.unmatchedLedger)
    lines.push(['Unmatched (ledger only)', '', '', fmtDate(t.date), q(t.desc), t.amount.toFixed(2), ''].join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reconciliation-report.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

setupDropzone('bank-zone', 'bank-input', (t, name) => loadSide('bank', t, name));
setupDropzone('ledger-zone', 'ledger-input', (t, name) => loadSide('ledger', t, name));
$('window').addEventListener('input', maybeRun);
$('export').addEventListener('click', exportReport);
$('sample').addEventListener('click', () => {
  loadSide('bank', SAMPLE_BANK, 'sample-bank-statement.csv');
  loadSide('ledger', SAMPLE_LEDGER, 'sample-ledger.csv');
});
