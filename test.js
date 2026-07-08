/* Minimal engine tests — run with: node test.js */
const { parseCSV, normalize, reconcile, parseAmount } = require('./engine.js');
const fs = require('fs');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { failures++; console.error('  ✗', msg); }
}

console.log('parseAmount');
assert(parseAmount('$1,234.56') === 1234.56, 'strips $ and commas');
assert(parseAmount('(500.00)') === -500, 'bracketed accounting negative');
assert(isNaN(parseAmount('')), 'empty is NaN');

console.log('parseCSV');
const rows = parseCSV('a,b\n"x, y","he said ""hi"""\r\n1,2\n');
assert(rows.length === 3, 'three rows');
assert(rows[1][0] === 'x, y' && rows[1][1] === 'he said "hi"', 'quotes and escapes');

console.log('normalize');
const debitCredit = normalize(parseCSV('Date,Payee,Debit,Credit\n2026-06-01,Rent,1800.00,\n2026-06-02,Sale,,950.00'));
assert(debitCredit.length === 2, 'parses debit/credit layout');
assert(debitCredit[0].amount === -1800 && debitCredit[1].amount === 950, 'debit negative, credit positive');

console.log('reconcile — sample data end-to-end');
// load browser sample data by evaluating the file
eval(fs.readFileSync('./sample-data.js', 'utf8').replace(/^const /gm, 'var '));
const bank = normalize(parseCSV(SAMPLE_BANK));
const ledger = normalize(parseCSV(SAMPLE_LEDGER));
const r = reconcile(bank, ledger, 5);
assert(r.stats.matchedCount === 17, `17 matched pairs (got ${r.stats.matchedCount})`);
assert(r.unmatchedBank.length === 5, `5 bank-only items (got ${r.unmatchedBank.length})`);
assert(r.unmatchedLedger.length === 2, `2 ledger-only items (got ${r.unmatchedLedger.length})`);
const rent = r.matches.find((m) => m.bank.desc.includes('RENT'));
assert(rent && rent.ledger.desc.includes('Rent'), 'rent matched to rent');
const offByOneDay = r.matches.find((m) => m.bank.desc.includes('STAPLES'));
assert(offByOneDay && offByOneDay.ledger.desc.includes('Staples'), 'matches across a 1-day date gap');
assert(r.matches.every((m) => m.bank.amount === m.ledger.amount), 'all matches are to-the-cent');

console.log(failures ? `\n${failures} FAILED` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
