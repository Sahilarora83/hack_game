# Security Policy

## Supported Scope

This project only supports statistical analysis of public WinGo history data.

Not supported:

- Hacking or bypassing third-party systems.
- Private API abuse.
- Credential scraping.
- Real-money betting automation.

## Secrets

Use server-side environment variables for:

- `GROQ_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

Never put service-role keys in browser JavaScript.

If a key is accidentally shared publicly, rotate it immediately in the provider dashboard.

## Reporting

Open a private security advisory if available, or contact the maintainer directly. Do not publish working exploit details in a public issue.
