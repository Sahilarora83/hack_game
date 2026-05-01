# WinGo Analyzer

Open-source WinGo 30S public-history analyzer for Node.js and Vercel.

This project is built for statistical analysis of public response data from the WinGo 30S game page:

https://www.jaiclub48.com/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo

It does not hack, bypass security, scrape private data, or guarantee predictions. Treat every signal as experimental. Do not use this project as financial or betting advice.

## Features

- Live public-history polling for WinGo 30S.
- Stores up to 500 recent results locally and can sync to Supabase.
- Frequency, Big/Small, streak, transition, and strategy backtest analysis.
- Next issue prediction lock with a 30-second countdown.
- Strategy Lab with 30/60/120/all-window comparison.
- Groq AI verification with rate-limit and cost controls.
- Prediction history with range and exact-number accuracy tracking.

## Open Source Rules

Contributions are welcome, but this repo should stay safe and reviewable:

- Use pull requests for all code changes.
- Do not commit API keys, service-role keys, tokens, `.env`, or generated secrets.
- Do not add code that hacks, bypasses security, automates betting, or encourages real-money decisions.
- Keep predictions clearly labeled as statistical signals, not guarantees.
- UI changes should be responsive on mobile and desktop before merge.

## Local run

```powershell
npm install
$env:WINGO_API_URL="https://api.jaiclubapi.com/WinGo/WinGo_30S/GetHistoryIssuePage.json"
npm start
```

Open the dashboard at:

```text
http://localhost:3000
```

## Vercel deploy

```powershell
npm install -g vercel
vercel login
vercel
vercel env add WINGO_API_URL
vercel --prod
```

Dashboard:

```text
/
```

API:

```text
/api/prediction
```

If the dashboard shows sample data, set `WINGO_API_URL` in Vercel to the working public history JSON endpoint. The default endpoint can fail with `404` if the provider changes paths or blocks that route.

For JaiClub-style public draw endpoints, this value can be used:

```text
WINGO_API_URL=https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json
```

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor, then set these Vercel environment variables:

```text
SUPABASE_URL=https://aavxdoeerbnntmvtzaqh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

Use the service role key only in Vercel/server-side env vars. Do not put it in browser JavaScript.

## GitHub Settings Recommended

In GitHub repo settings, enable these before accepting external contributors:

- Require pull request before merging into `main`.
- Require at least 1 approving review.
- Dismiss stale approvals when new commits are pushed.
- Require status checks to pass.
- Block force pushes and branch deletion on `main`.
- Enable secret scanning and Dependabot alerts.

## License

MIT. See `LICENSE`.
