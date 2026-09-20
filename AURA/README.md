# AURA

AURA is a desktop browser MVP built on Electron and Chromium. It gives you normal and temporary-profile private tabs, navigation, local bookmarks, an AURA app launcher, and an opt-in AI sidebar that can summarize the current page or compare open tabs.

## Run it

1. Install Node.js 20+.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env`, then supply your Anthropic API key and a model ID available to your account.
4. Run `npm start`.

The browser runs without an AI key; only the Ask AURA actions require it.

## Privacy and security decisions

- Visited pages run in isolated, sandboxed `WebContentsView` instances with Node integration disabled.
- Browser UI is local and uses a narrow preload bridge; websites receive no Electron APIs.
- Permission requests are denied by default.
- Bookmarks stay in the local Electron user-data directory.
- Private tabs use temporary Electron sessions and cannot save bookmarks.
- A page's readable text is sent to the AI provider only after you explicitly ask a question or select Compare tabs.

AMail is a local AURA browser-profile flow in this MVP. Real email sign-in, inboxes, sending, and cloud sync require a separate AMail service and authenticated backend; this app does not request or store a mail password.

VMeet and VChat are branded launch surfaces in this MVP. Real video calls need a signaling service, TURN infrastructure, authenticated users, and media-permission handling; real chat needs identity, encrypted transport, and secure message storage. Neither feature presents itself as live before those services exist.

This is an MVP, not a production-ready replacement for a hardened consumer browser. Before distribution, add packaged-update signing, a dedicated security review, automated tests, a user-facing permissions model, and a human-reviewed release pipeline.
