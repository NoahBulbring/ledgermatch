# LedgerMatch

Drop in a bank statement CSV and a ledger CSV and it reconciles them: transactions are matched by exact amount, date proximity, and description similarity, discrepancies are flagged in both directions, and the result exports as a reconciliation report.

Live demo: https://noahbulbring.github.io/ledgermatch/ — click "Try with sample data" to see it work without uploading anything.

![LedgerMatch screenshot](screenshot.png)

## Why

Month-end bank reconciliation is one of the most repetitive jobs in bookkeeping: two lists of the same money, written down differently. `PAYROLL DEPOSIT ACME CORP` on the statement is `Payroll — Acme Corp contract` in the books, posted a day later. LedgerMatch automates the line-by-line comparison so you only look at the exceptions.

## What it does

- Matches by amount first, then scores candidates on date proximity (configurable window) and token-overlap description similarity, pairing greedily best-score-first so each transaction matches at most once
- Shows a confidence score on every matched pair
- Lists exceptions separately: on the statement but not in the books (bank fees, interest) and in the books but not on the statement (outstanding deposits, uncleared cheques)
- Auto-detects date / description / amount (or debit / credit) columns from CSV headers; handles `$1,234.56`, negatives, and `(bracketed)` accounting negatives
- Exports a reconciliation report as CSV

Everything runs in the browser — no upload, no dependencies.

## Run it

```bash
git clone https://github.com/NoahBulbring/ledgermatch.git
cd ledgermatch
open index.html
```

Run the engine tests with Node:

```bash
node test.js
```

## How the matching works

1. Parse both CSVs (RFC-4180-style parser: quotes, escaped quotes, CRLF) and normalize each row to `{date, description, amount}`
2. Index ledger entries by amount; for each bank transaction, score every same-amount ledger candidate:
   - `0.5` for the exact amount match
   - up to `0.3` for date proximity within the window
   - up to `0.2` for Jaccard similarity of description tokens
3. Sort all candidate pairs by score and accept greedily — each bank line and ledger line is used at most once
4. Whatever's left on either side is an exception for human review

## License

MIT © Noah Bulbring
