# Security policy

## Supported versions

Only the latest release on `main` gets security fixes.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Report it privately through GitHub instead: open the repository's **Security** tab, choose **Report a vulnerability**, and describe:

- what the problem is and where it is (a file, route or page),
- how to reproduce it, and
- what an attacker could do with it.

You'll get an acknowledgement within a week. Once a fix is ready, it's released and the report is credited to you if you'd like.

## What counts

Whatstir runs on its owner's own server, with their own keys. These are in scope:

- getting past the password gate (`proxy.ts`), or reaching data without it;
- calling `/api/cron/refresh` or the admin endpoints without authorisation;
- leaking a server-side secret (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `DATABASE_URL`, `APP_PASSWORD`, `CRON_SECRET`) to the browser or the logs;
- SQL injection, cross-site scripting (for example through rendered Markdown answers), or reading another deployment's data;
- reaching the database through Supabase's public Data API despite the lockdown migration.

Problems in a deployment's own configuration, such as a weak `APP_PASSWORD` or a leaked key, are the operator's to fix. Rotate the key with its provider.
