# SafeSpend

**What's already promised before payday — and can I say yes to this purchase?**

SafeSpend is a private, multi-user personal finance tracker. Each person signs in to their own encrypted space and imports bank, card, payslip and receipt files. It keeps transactions up to date without duplicates, tracks spending month by month, and answers the question bank apps can't: how much of my money is already needed for bills before payday, and how much can I safely spend?

Home shows three numbers — **Already committed**, **Lowest point**, **Safe to spend** — plus a **Can I afford it?** check that returns *Comfortable / Tight / Not without savings* and the exact day things get tight.

---

## Quick start

Requirements: **Node.js 18.18 or newer** (tested on Node 24). No database, no external services.

```bash
npm install
node -e "console.log('APP_SECRET='+require('crypto').randomBytes(32).toString('hex'))" >> .env.local
npm run dev
```

Open <http://localhost:3000> and sign in with the demo account:

| Email | Password |
|---|---|
| `aisha@demo.com` | `demo1234` |

The demo user and its data are created automatically on first start if there are no users yet. Any new account you sign up starts empty; use **Load demo data** on its home page to try it with sample files.

> **On this machine:** the system Node is v14, which is too old for Next.js 15. A portable Node 24 is in `C:\Hackthon\.node`. In PowerShell, run `$env:Path = "C:\Hackthon\.node;$env:Path"` first, then use `npm` as normal.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | 54 unit, golden and security tests (vitest) |
| `npm run gen:demo` | Regenerate `public/demo/*` (deterministic, seed 42, amounts in ₹) |
| `npm run reset` | Delete all stored data (`.data/`). The demo user is re-seeded on the next start |

### Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `APP_SECRET` | yes | — | At least 32 characters. The server refuses to start without it. It derives the vault encryption key. |
| `DATA_DIR` | no | `.data` | Where users, sessions and encrypted vaults are stored |

### Deploy (Render, free)

The repo includes a  blueprint.

1. Sign in at <https://render.com> with GitHub.
2. Click **New → Blueprint** and pick the  repo.
3. Click **Apply**. Render builds and starts the app, and generates  for you.

The site goes live at  in about 3–5 minutes. The free plan sleeps after 15 minutes without visitors, so the first visit after that takes about a minute. Its disk is temporary: stored data resets on each deploy or restart, and the demo user is re-created automatically.

---

## 5-minute demo

Amounts are in Indian rupees (₹). The demo data is generated at an Indian scale (salary ₹1,21,250 a month).

1. **Sign in** as `aisha@demo.com`. It's Thursday 24 Sep, and her bank shows **₹1,26,386**.
2. **The truth:** **₹88,114 of bills to pay before payday** (30 Sep). Almost all of it is the credit card bill due 28 Sep, which her bank balance doesn't show yet. Her **lowest balance is ₹24,995 on 30 Oct**, just before the next salary, so she is **safe to spend ₹12,495** and still keep her ₹12,500 minimum balance.
3. **Decide:** in *Can I buy this?*, try **₹15,000 on 2 Oct → Yes, but money will be tight**. **₹7,500 → Yes, you can buy it**. **₹50,000 → Only if you use savings**, with the amount to move from savings.
4. **Trust:** click the blue text on any upcoming payment. Rent was paid 13 times before. The HomeShield renewal on 3 Oct was found in an email, not in any statement. The card bill lists every purchase. *Things you should know* shows Spotify's price rise and that Hulu stopped.
5. **Track:** on **Spending**, pick August for categories vs July, where you spent most, and a 6-month trend.
6. **No double entries:** on **Upload**, click the *Same bank statement again* sample: **0 new, 47 already added**. The *File with different columns* sample opens the column matcher.
7. **Correct:** in the ⋯ menu on Netflix, choose **I cancelled this**. The total drops, and an Undo toast appears.
8. **Multi-user:** sign up a new user. The account is empty, with none of Aisha's data.

A client presentation with screenshots is in `C:\Hackthon\presentation\SafeSpend_Client_Presentation.pptx` (outside this repo).

---

## How it works

```
Browser (React client components)
   │  fetch /api/*  (httpOnly session cookie)
   ▼
Next.js route handlers (runtime: nodejs)
   │  requireUser(req) → userId              lib/server/auth.ts
   │  user-scoped services                   lib/server/services/*.ts
   ▼
Repository — the only code touching disk     lib/server/repo.ts
   │  .data/users.json       id, email, name, scrypt hash + salt
   │  .data/sessions.json    sha256(token), userId, expiry
   │  .data/vault/<id>.enc   AES-256-GCM encrypted JSON of one user's data
   ▼
Pure finance core (no React, no fs, no window)  lib/core/*.ts
```

### The pipeline (`lib/core/`)

1. **Parse** (`csv.ts`): a hand-written CSV parser that handles quotes, escaped quotes, CRLF, BOMs and blank lines. It never throws; bad rows are reported, not fatal.
2. **Detect format** (`formats.ts`) from the header signature: A (debit/credit/balance, `DD/MM/YYYY`), B (signed amount, `YYYY-MM-DD`) or C (card, `MM/DD/YYYY` + DR/CR). Anything else goes to the column mapper, and the mapping is remembered per header signature.
3. **Normalise** to integer cents, signed from the account's point of view. Dates stay `YYYY-MM-DD` strings with UTC helpers.
4. **Fingerprint and dedupe** (`fingerprint.ts`): `sha256(account | date | cents | description | k)`, where `k` numbers identical rows within one file. Re-importing or overlapping files adds nothing, while two identical coffees on one day are both kept.
5. **Merchants and categories** (`merchants.ts`, `categories.ts`): strip processor prefixes, cut at `*`/`#`, drop digit tokens and state codes, then apply the alias table and keyword rules. Users' overrides and merchant rules win.
6. **Transfer and card-payment matching** (`transfers.ts`) runs before anything else, so autopay and savings transfers are never counted as spending or as bills.
7. **Recurring detection** (`recurring.ts`): cadence from the median interval (weekly to yearly, with at least 70% of intervals in range), amount stability (fixed within ±2%, one clean price step, or CV ≤ 0.25), a frequency guard against coffee and groceries, stopped detection, and a confidence score.
8. **Receipts** (`receipts.ts`): regex extraction of amounts and renewal dates. A renewal merges with a predicted charge within ±5 days, so it's never counted twice.
9. **Income** (`income.ts`): payday is the last working day of the month; the amount is payslip net pay, checked against bank credits.
10. **Card bill** (`cardBill.ts`): last closed cycle, then the open cycle (posted purchases + predicted recurring card charges + everyday estimate). Card charges only ever reach checking through the bill.
11. **Forecast and afford** (`forecast.ts`, `afford.ts`): daily checking balance to the payday after next. Within a day, outflows apply before income (conservative). Safe to spend = lowest − buffer.
12. **Spending** (`monthly.ts`) and **insights** (`insights.ts`, at most 4, ranked by money impact).

**Facts vs estimates:** *Bills to pay before payday* counts only facts: bills, renewals, subscriptions, savings transfers and posted card spending. The everyday spending estimate (last 90 days, top 5% trimmed) is used in the forecast, but it is always labelled and shown hatched, never as a bill to pay.

---

## Security model

- **Passwords:** scrypt (N=16384, r=8, p=1, 64-byte key, 16-byte salt), compared with `timingSafeEqual`. Minimum 8 characters.
- **Sessions:** a random 32-byte token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), valid for 7 days. Only `sha256(token)` is stored. Logout deletes the session, and changing the password signs out other sessions.
- **Encryption at rest:** each user's vault is AES-256-GCM with a fresh 12-byte IV per write. The key is `scrypt(APP_SECRET, 'committed-vault-v1')`, and tampering is detected by the auth tag.
- **Authorisation:** every API route calls `requireUser`. Services only take the user id from the session, never from the body or URL, and resource ids are looked up inside that user's vault, so another user's id returns 404.
- **CSRF:** non-GET requests with a foreign `Origin` are rejected with 403, backed by `SameSite=Lax`.
- **Rate limiting:** 5 failed logins per email per 10 minutes, then 429. The login error message is identical for an unknown email and a wrong password, and scrypt runs either way so timing doesn't leak which one it was.
- **Input limits:** 5 MB per file, 20,000 rows, and every body field is validated by hand. Errors are always JSON `{ error }` with a proper status code.
- **Integrity:** a per-user write lock plus atomic writes (temp file, then rename). A corrupted vault gives a clear error, not a crash.
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, a restrictive `Permissions-Policy`.

## Privacy model

- Nothing leaves the server: no bank logins, no AI APIs, no analytics, no third-party requests at run time.
- Only normalised transactions and the documents users import are stored, never the original files.
- Users can **export** everything as JSON, or **delete** their account, which removes the user record, all sessions and the vault file.
- The import screen says in plain words what is stored.

## Dependencies

| Type | Packages |
|---|---|
| dependencies | `next`, `react`, `react-dom` |
| devDependencies | `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `vitest` |

Everything else uses Node built-ins (`crypto`, `fs`, `path`): the CSV parser, the charts (hand-written SVG), the styling (plain CSS with variables and dark mode) and the date and money helpers.

## Tests (`npm test`)

- **Golden tests G1–G17** (`tests/core/golden.test.ts`) run on the demo data as of 2026-09-24. They cover format detection, per-format date parsing, every recurring series (and zero false subscriptions), transfer and card-payment linking, the receipt renewal appearing exactly once, the card bill equalling the exact cycle sum, paydays, the lowest point within $950–$1,050, the three afford verdicts, August spending, and analysis in under 1 s.
- **Security tests S1–S10** (`tests/server/`) call route handlers directly with `Request` objects against a temporary `DATA_DIR`. They cover password hashing, encryption (the vault file contains no plaintext), sessions and expiry, duplicate signup, isolation between users, dedupe, undo import, rate limiting, CSRF and account deletion.
- **Unit and hardening tests** cover the CSV parser, money, dates, merchants, fingerprints, transfers, recurring detection, receipts, the forecast, a corrupted vault, header-only files, oversized uploads and the column mapper.

## Design decisions

- **File store, not a database:** zero install for a reliable demo. `repo.ts` is the only persistence boundary, so it can be swapped for SQLite or Postgres. Serverless hosts (e.g. Vercel) have read-only filesystems, so run it with `npm start` on a laptop or VM.
- **No middleware auth:** middleware runs on the Edge runtime without `fs` and Node `crypto`. Pages are guarded in `app/(app)/layout.tsx`, and APIs by `requireUser`.
- **Lowest point on payday morning:** because outflows land before income within a day, the lowest point can fall on payday itself ("$1,000 on 30 Oct, just before pay lands"). That is the honest, conservative reading.
- **Savings transfers are commitments:** a planned monthly transfer to savings really leaves checking, so it's forecast as a *Savings transfer*. It is still never counted as spending or as a bill.
- **Card charges count once:** in *Already committed*, a card subscription is counted inside the card bill when that bill falls in the window, or on its own when its bill is due later. In the checking forecast, card charges only ever arrive through the bill.
- **Price steps:** a series like Spotify's $10.99 → $11.99 is treated as *fixed with a price change*. It's predicted at the new price and raises an insight.
- **Quarterly and yearly dates** step by calendar months (water on the 20th of Jan/Apr/Jul/Oct), not by a fixed number of days.

### Additions beyond the spec

- `lib/core/ingest.ts`: one pure import planner shared by preview, commit and demo loading.
- `lib/core/demoAccounts.ts`: maps the demo accounts onto a user's vault.
- `GET /api/imports`: import history, used by the Accounts and Import pages.
- `Account.openingBalanceCents`: for statements without a balance column (the demo savings account uses it).
- A transaction `kind` filter.
- One-click sample files on the Import page.

## Project structure

```
app/(auth)/        login, signup (split brand panel + form)
app/(app)/         home, transactions, spending, accounts, import, settings (server-guarded layout)
app/api/           route handlers — all JSON, all user-scoped
components/        UI (hand-written SVG charts, drawer, dialogs, toasts, import wizard, …)
lib/core/          pure finance engine (unit-tested)
lib/server/        config, crypto, repo, auth, http helpers, services
lib/client/        typed API client + formatting (the client never imports lib/server)
scripts/           deterministic demo-data generator
public/demo/       generated demo files
tests/             core (golden) + server (security/API) tests
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `APP_SECRET is missing or shorter than 32 characters` | Add it to `.env.local` (see Quick start) and restart |
| Decrypt error after changing `APP_SECRET` | Old vaults used the old key: run `npm run reset` (demo data re-seeds on start) |
| `next` fails with syntax errors | Your Node is too old. Use Node 18.18+ |
| Logged out after every restart | Sessions live in `.data/sessions.json`. Check `DATA_DIR` and that `.data/` isn't deleted |
