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
