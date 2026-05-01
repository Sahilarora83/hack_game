# Contributing

Thanks for helping improve WinGo Analyzer.

## Before You Start

- Open an issue first for non-trivial changes.
- Keep changes focused and easy to review.
- Never commit secrets, API keys, Supabase service-role keys, or `.env` files.
- Do not add hacking, bypass, private API abuse, or real-money betting automation.

## Pull Request Checklist

- The dashboard still loads locally.
- `node --check api/ai-prediction.js` passes.
- Inline browser script syntax passes.
- Mobile and desktop layouts are readable.
- Prediction text still says signals are statistical and not guaranteed.
- No secrets are included in commits.

## Review Policy

All code changes should go through a pull request. Maintainers should check:

- Security and privacy impact.
- Whether public APIs only are used.
- Prediction history and accuracy calculations.
- Supabase write paths and key exposure.
- Responsive UI behavior.

## Local Syntax Check

```powershell
node --check api\ai-prediction.js
@'
const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const match = html.match(/<script>([\s\S]*)<\/script>/);
new Function(match[1]);
console.log('inline script syntax ok');
'@ | node -
```
