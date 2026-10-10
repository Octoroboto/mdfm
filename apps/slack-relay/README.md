# MDFM Radio Slack sign-in helper

A tiny Cloudflare Worker that lets people click **Connect Slack** in MDFM Radio. It holds the Slack app's secret (which can't live in the public repo),
swaps Slack's one-time code for the person's read-only token, and hands it straight to their app on `127.0.0.1`. It stores nothing.

Scopes (user token, read-only): `channels:history`, `channels:read`, `users:read`. It only works for the RentVision Slack (`TEAM_ID`).

## One-time setup (Rob): the easy way

Run either app from source and use the wizard; it does everything below in app windows:
```
cd ~/RentVision/mdfm/apps/radio && npm start
```
Then go to Settings → Company news from Slack → **Set up Slack for everyone** (or Help → Set up Slack for MDFM…). At the end it writes `config/slack.json` in the repo. Push that file, and Connect Slack works in everyone's apps without an app update.

## One-time setup (Rob): by hand

1. Create the Slack app: https://api.slack.com/apps → Create New App → From a manifest → RentVision → paste `slack-app-manifest.json`
   (put your real workers.dev subdomain in the redirect URL; you'll see it after step 2, then edit the app's Redirect URLs).
2. Deploy the helper:
   ```
   cd ~/RentVision/mdfm/apps/slack-relay
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put SLACK_CLIENT_ID        # Slack app → Basic Information
   npx wrangler secret put SLACK_CLIENT_SECRET    # Slack app → Basic Information
   npx wrangler secret put STATE_KEY              # paste the output of: openssl rand -base64 32
   npx wrangler secret put TEAM_ID                # RentVision's team id (starts with T)
   ```
3. Put the helper's address in `config/slack.json` at the repo root (`{ "relay": "https://mdfm-slack.YOUR-SUBDOMAIN.workers.dev" }`), then commit and push. Installed apps pick it up within a few hours, or at their next launch. (`mdfm.slackRelay` in an app's package.json still works too, but needs an app release.)
4. If Slack asks for admin approval of the app, approve it (or ask a Slack admin).

Test: `npm test` (no Cloudflare account needed).
