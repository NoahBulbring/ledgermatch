/* Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF) */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

/* Detect date / description / amount columns from the header row */
function detectColumns(header) {
  const h = header.map((x) => x.toLowerCase().trim());
  const find = (...names) => h.findIndex((c) => names.some((n) => c.includes(n)));
  let date = find('date', 'posted');
  let desc = find('description', 'memo', 'payee', 'detail', 'narration', 'particular', 'name');
  let amount = find('amount', 'value', 'total');
  const debit = find('debit', 'withdrawal', 'money out');
  const credit = find('credit', 'deposit', 'money in');
  // most bank exports put date/description first, so fall back to that
  if (date < 0) date = 0;
  if (desc < 0) desc = 1;
  return { date, desc, amount, debit, credit };
}

function parseAmount(s) {
  if (s == null) return NaN;
  s = String(s).trim().replace(/[$,\s]/g, '');
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const n = parseFloat(s);
  return neg ? -n : n;
}

function parseDate(s) {
  const t = Date.parse(String(s).trim());
  return isNaN(t) ? null : new Date(t);
}

/* Turn raw CSV rows into normalized transactions */
function normalize(rows) {
  if (!rows.length) return [];
  const cols = detectColumns(rows[0]);
  const txns = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    let amount = NaN;
    if (cols.amount >= 0) amount = parseAmount(r[cols.amount]);
    if (isNaN(amount) && cols.debit >= 0) {
      const d = parseAmount(r[cols.debit]);
      const c = cols.credit >= 0 ? parseAmount(r[cols.credit]) : NaN;
      amount = !isNaN(d) && d !== 0 ? -d : !isNaN(c) ? c : NaN;
    }
    if (isNaN(amount)) continue;
    txns.push({
      id: txns.length,
      date: parseDate(r[cols.date]),
      desc: String(r[cols.desc] || '').trim(),
      amount: Math.round(amount * 100) / 100,
      raw: r.join(', '),
    });
  }
  return txns;
}

/* Description similarity: token overlap (Jaccard) on cleaned words */
function tokens(s) {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w))
  );
}
function similarity(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const DAY = 86400000;
function dayDiff(a, b) {
  if (!a || !b) return null;
  return Math.abs(a - b) / DAY;
}

/* Score a candidate pair. Amounts must match to the cent.
   Confidence from date proximity + description similarity.
   Weights (0.5 / 0.3 / 0.2) were tuned by hand on the sample files. */
function scorePair(bank, ledger, windowDays) {
  if (bank.amount !== ledger.amount) return 0;
  const dd = dayDiff(bank.date, ledger.date);
  if (dd !== null && dd > windowDays) return 0;
  let score = 0.5; // amount match
  if (dd !== null) score += 0.3 * Math.max(0, 1 - dd / windowDays);
  score += 0.2 * similarity(bank.desc, ledger.desc);
  return score;
}

/* Greedy best-first matching: score all candidate pairs, take
   highest scores first, each transaction used at most once.
   TODO: allow a 1-cent tolerance for rounding instead of exact-to-the-cent. */
function reconcile(bankTxns, ledgerTxns, windowDays = 5) {
  const candidates = [];
  const byAmount = new Map();
  for (const l of ledgerTxns) {
    const k = l.amount.toFixed(2);
    if (!byAmount.has(k)) byAmount.set(k, []);
    byAmount.get(k).push(l);
  }
  for (const b of bankTxns) {
    for (const l of byAmount.get(b.amount.toFixed(2)) || []) {
      const s = scorePair(b, l, windowDays);
      if (s > 0) candidates.push({ b, l, s });
    }
  }
  candidates.sort((x, y) => y.s - x.s);

  const usedB = new Set(), usedL = new Set(), matches = [];
  for (const c of candidates) {
    if (usedB.has(c.b.id) || usedL.has(c.l.id)) continue;
    usedB.add(c.b.id); usedL.add(c.l.id);
    matches.push({ bank: c.b, ledger: c.l, score: c.s });
  }
  const unmatchedBank = bankTxns.filter((t) => !usedB.has(t.id));
  const unmatchedLedger = ledgerTxns.filter((t) => !usedL.has(t.id));

  const sum = (a) => Math.round(a.reduce((x, t) => x + t.amount, 0) * 100) / 100;
  return {
    matches, unmatchedBank, unmatchedLedger,
    stats: {
      bankCount: bankTxns.length,
      ledgerCount: ledgerTxns.length,
      matchedCount: matches.length,
      matchRate: bankTxns.length ? matches.length / bankTxns.length : 0,
      bankTotal: sum(bankTxns),
      ledgerTotal: sum(ledgerTxns),
      unmatchedBankTotal: sum(unmatchedBank),
      unmatchedLedgerTotal: sum(unmatchedLedger),
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { parseCSV, normalize, reconcile, similarity, parseAmount };
}
