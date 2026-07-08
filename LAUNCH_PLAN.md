# Public Launch Plan

**Goal:** Take the kanban app public as an installable **PWA**, with **bring-your-own-AI**
agent access via a hosted **MCP server**, while satisfying **Google OAuth verification**
for the Google Tasks integration.

**Status:** Planned (created 2026-06-22). Not started.

---

## The two "acceptance" gates (important framing)

1. **PWA installability — no approval from anyone.** It's automatic: meet the technical
   criteria (HTTPS + manifest + service worker) and browsers show the "Install" button.
   PWAs are not reviewed by any store.
2. **Google OAuth verification — the real review.** Required because we use the Google
   Tasks scope. Until verified: ~100-user cap, "this app isn't verified" warning, and the
   7-day refresh-token expiry (the `invalid_grant` issue). This has weeks of lead time —
   **start it first** and let it bake while everything else is built.

**Linchpin:** everything needs a **custom domain you own**. A `*.up.railway.app` subdomain
can't be verified in Google Search Console, and a real domain is required for both the PWA
and Google verification.

**Key finding:** `https://www.googleapis.com/auth/tasks` is a **sensitive** scope, NOT
restricted. So we need standard sensitive-scope verification — **no paid third-party
security assessment (CASA)**, which is restricted-scope only.

---

## Phase 0 — Domain (do first, ~1 day)
- [ ] Buy a domain (~$12/yr); point it at Railway (custom domain + DNS). Railway issues TLS → HTTPS free.
- [ ] Lock CORS on the Express backend to that domain.

## Phase 1 — Google OAuth verification (start now; longest *wait*, ~weeks)
Sensitive-scope verification checklist:
- [ ] **Public homepage** on the domain that describes the app (not just a login page).
- [ ] **Privacy Policy** on the same domain, linked from homepage + OAuth consent screen.
      Must disclose how Google Tasks data is accessed/used/stored, comply with **Limited Use**,
      AND disclose that users may connect third-party AI agents that access their data at their direction.
- [ ] **Terms of Service** page.
- [ ] **Verify domain ownership** in Google Search Console (as GCP project owner/editor).
- [ ] **OAuth consent screen**: app name, support email, homepage, privacy/ToS links, logo, authorized domain.
- [ ] **Per-scope justification** for `auth/tasks` (two-way task sync; narrower won't do).
      (`userinfo.email` is non-sensitive — no justification needed.)
- [ ] **Demo video** (unlisted YouTube): full OAuth flow in English, consent screen with correct
      app name + exact scopes, address bar showing OAuth client ID, Tasks sync working.
- [ ] **Publishing status Testing → In production**, submit in the Verification Center.
- [ ] Timeline: brand verification ~2–3 business days; sensitive-scope review up to ~10 days
      (often longer — budget weeks). **No CASA.**

## Phase 2 — PWA (parallel, ~1–2 days, mostly me)
- [ ] Web app manifest: `name`, `short_name`, `start_url`, `display: standalone`,
      `background_color`, `theme_color`, icons (192, 512, + maskable).
- [ ] App icons + `apple-touch-icon`; iOS meta tags.
- [ ] Service worker at root (cache static assets + offline fallback). Use `vite-plugin-pwa`.
- [ ] Verify via Chrome DevTools → Application → Manifest + Lighthouse (no red errors).
- [ ] Mobile layout pass on the Kanban board (MUI is desktop-first).

## Phase 3 — AI agent access (BYO-AI via MCP) — **part of v1** ✅ BUILT 2026-07-07
Decision: users connect their *own* agent (Claude/OpenAI/Gemini) to a hosted MCP server.
We do not run or pay for any LLM. Build order matters: tokens → MCP → audit.

End-goal UX: user tells their Claude *"add a task for today to send that email to Jonah"* →
Claude calls the `create_task` MCP tool → task appears in the app + syncs to Google Tasks.

- [x] **Per-user API tokens** (foundation):
  - `api_tokens` table (hashed at rest, named, `last_used_at`, revocable); plaintext shown once.
  - Auth middleware accepts `Bearer <api_token>` in addition to JWT; resolves to the user and
    inherits that user's `project_members` access.
  - Account Settings UI: generate / name / copy-once / list / revoke.
- [x] **Remote MCP server**:
  - Hosted, authenticated MCP endpoint (Streamable-HTTP transport) mounted in the Express app
    (e.g. `/mcp`), built with the MCP TypeScript SDK. Works with Claude/OpenAI/Gemini.
  - v1 auth: user pastes their API token into their MCP client config. (Full MCP OAuth = later.)
  - Tools (thin wrappers over the REST API — API stays the source of truth):
    `list_projects`, `list_tasks`, `create_task`, `update_task`, `move_task`, `complete_task`,
    `delete_task`, `list_project_members`, `search_tasks`. Expose `due_date` + `assignee` on
    create/update so "for today" and assignment work.
- [x] **Default / "Inbox" project** for frictionless quick-capture, so "add a task…" with no
      project named lands somewhere sensible instead of forcing Claude to ask every time.
- [x] **Activity / audit log**: record mutations with an **actor** (human vs. which agent token),
      surfaced per project/task — so "what did the agent just change?" is answerable.
- [x] **Security (launch-blocking)**: per-token rate limiting (120 req/min/token), revocation,
      hashed tokens (SHA-256), destructive ops (delete project) still owner-gated; Inbox undeletable;
      token management is human-session-only.

Note: it creates the *task*, not the email — Claude only sends the email if the user also has an
email tool connected. Connecting Claude is a one-time setup per user (their client → our MCP server).

## Phase 4 — Public-launch hardening
- [ ] **Email verification on signup** (closes invite-impersonation hole; needed once public).
- [ ] **Postgres backups** on Railway + a restore test.
- [ ] **Error monitoring** (Sentry free tier).
- [ ] **Rate limiting** on auth endpoints (in addition to per-token limits above).

---

## Critical path
```
Phase 0 (domain)
   ├─► Phase 1 Google verification  ── mostly WAITING (weeks) ──┐
   └─► Phase 2 PWA + Phase 3 AI + Phase 4 hardening ── BUILDING ┘
                                                                 ▼
                          Launch when verification clears AND AI is done
```
Verification is the long *wait*; the AI track is the big *build* — they overlap, so the net
timeline impact of adding AI is small.

## Costs
Domain (~$12/yr) + time. No CASA, no app-store fees, no first-party LLM cost (BYO-AI).
Sentry/Railway free tiers.

## Division of labor
- **I can build:** PWA, full AI track (tokens, MCP server, Inbox default, audit log, token UI),
  landing page, Privacy Policy + ToS, email verification, CORS lockdown, rate limiting, Sentry.
- **Only you (account-level):** buy domain + DNS, verify in Search Console, fill the OAuth
  consent screen, record the demo video, submit for verification.

## Sources
- Sensitive scope verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Restricted scope verification (why CASA doesn't apply): https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Google Tasks API scopes: https://developers.google.com/workspace/tasks/auth
- Brand verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- OAuth verification requirements: https://support.google.com/cloud/answer/13464321
- PWA install criteria: https://web.dev/articles/install-criteria
- Making PWAs installable (MDN): https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
