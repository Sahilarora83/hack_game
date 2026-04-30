# hack_game

WinGo public history statistical analyzer for Node.js and Vercel.

This project reads public API response data only. It does not hack, bypass security, or guarantee predictions.

## Local run

```powershell
npm install
$env:WINGO_API_URL="https://api.jaiclubapi.com/WinGo/WinGo_30S/GetHistoryIssuePage.json"
npm start
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
