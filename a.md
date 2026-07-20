# MVOE Public Scale Blueprint (Millions of Users)

Date: April 22, 2026  
Scope: product, platform, security, AI operations, and deployment plan for public launch at scale

## April 24, 2026 Production-Readiness Status

### Implemented in the app now
- Email/password signup now issues long-lived app sessions with access + refresh tokens.
- Google ID-token login support is wired in the Node API and ready once Google OAuth client IDs are configured.
- Node JWTs now include `sub` and `tenant_id` so the Python volunteer/agent API can enforce tenant-scoped data access.
- Python volunteer roster, tags, broadcasts, and QR signup-share endpoints require auth for management actions.
- Python volunteer agent endpoints now require auth instead of falling through to the shared public tenant.
- Volunteer QR links are signed tenant-specific links; scanned volunteers are inserted into the correct tenant roster.
- Anonymous volunteer roster access is blocked.
- Redis-backed Python rate limiting is configured for shared multi-instance limits.
- Production boot/readiness gates now fail closed when local databases, local Redis, localhost frontend URLs, weak secrets, or guest writes are configured.
- Safety moderation routes and audit-style moderation records exist for reports/review workflow.
- Local web build and live service readiness checks pass in development.

### Verified locally
- `npm run build:web` completes and exports `frontend/dist`.
- Node `/ready` returns healthy local database/Redis checks and flags only expected production config failures.
- Python `/ready` returns healthy local database/Redis checks and flags only expected production config failures.
- New user signup returns an authenticated session.
- `/volunteers/signup-share` rejects anonymous requests.
- Authenticated `/volunteers/signup-share` returns a signed QR signup URL.
- The signed QR signup page loads.
- Public QR signup creates a volunteer under the signed tenant.
- The signed-in tenant sees its volunteer.
- A second tenant cannot see the first tenant's volunteer.
- Anonymous volunteer agent summary is blocked.
- Authenticated volunteer agent summary uses the signed-in tenant and sees the tenant's QR-created volunteers.

### Still manual before public launch
- Create managed production Postgres and Redis, then set production URLs in Render.
- Set public domains for web, Node API, Python agent API, and WebSocket URL.
- Generate and set production secrets: `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, Python `JWT_SECRET`, Python `NODE_JWT_SECRET`, and `FERNET_KEY`.
- Configure Google OAuth client IDs for web/iOS/Android and set `GOOGLE_CLIENT_IDS`.
- Configure Stripe Identity, Persona, or another identity-verification provider before enabling verified-posting badges.
- Configure object storage and image moderation before allowing public beacon/event photos at scale.
- Configure Twilio production messaging numbers, compliance profile, opt-in copy, and webhook URLs.
- Deploy from a clean production database or baseline migrations before `prisma migrate deploy`.
- Staff a human moderation review path before advertising the app publicly.

### Current readiness verdict
The codebase is materially closer to a real multi-user app, and the most dangerous volunteer QR leakage path is fixed. It is ready for local pilot testing with multiple real users. It is not ready for open public traffic until the manual production services, secrets, domains, identity verification, media storage, and moderation operations above are completed.

## 1) Current Code Reality (from this repo audit)

### What is already strong
- `frontend` is Expo + React Native Web and already has a map-first UX, compact beacon/event widgets, and agent surfaces.
- `backend` (Fastify + Prisma) already supports map feed, beacons, events, grants, pricing index, and Composio Google Drive flows.
- `python_backend` (FastAPI) already supports volunteer workflows, SMS (Twilio), and agent chat with tenant-scoped context.
- `render.yaml` already deploys three app surfaces (`mvoe-web`, `mvoe-api`, `mvoe-agent-api`) plus Redis + Postgres.

### What will block true public scale unless changed
- Auth and tenancy are split across Node and Python, with guest/demo bypass paths still present in critical routes.
- Python rate limiting is in-memory (`rate_limit.py`), which is not safe for multi-instance production.
- Map view reset risk exists because `FoodBankMap` rebuilds iframe `srcDoc` when marker data changes.
- Abuse moderation, trust scoring, and evidence/audit pipelines are not yet first-class.
- No hardened media pipeline yet (upload scanning, moderation, signed URLs, retention policy).
- No explicit production SLO/error-budget/incident runbook.

## 2) Product Decisions to Lock Before Scaling

### Identity and trust model (recommended)
1. Anyone can browse the map anonymously.
2. Posting beacon/event/volunteer broadcasts requires account sign-in.
3. Sign-in options: Google SSO + email (passwordless magic link or OTP).
4. “Verified poster” badge requires government-ID verification (driver’s license flow).
5. High-risk actions (broadcasts, repeated posts, high-volume posting) require stronger trust tier.

### Safety model
- AI is a co-pilot for moderation, not the final judge for account suspension.
- Use layered controls:
  - rule-based gates,
  - model moderation for text/image,
  - trust score,
  - human review queue for severe or ambiguous cases.

### Camera/Wi-Fi concept (hard recommendation)
- Do **not** launch with user-installed camera monitoring hardware as a core requirement.
- Launch with: posted photo evidence, timestamped check-ins, optional follow-up photo, and report/appeal flow.
- If camera integrations are explored later, run legal/privacy review first and require explicit informed consent + strict retention limits.

## 3) Target Architecture for Millions

## Client layer
- Keep Expo app as the single UI codebase:
  - Web (PWA) for browser,
  - iOS/Android builds via EAS.
- Keep map-centric workflow and compact glass/liquid widget overlays.

## API and service layer
- Consolidate into clear bounded services:
  - `api-core` (accounts, map feed, beacons, events, volunteers, auth/session),
  - `api-agents` (grant writer, meal planner, volunteer AI assistant),
  - `worker-jobs` (index refreshes, moderation queues, notification fanout),
  - `realtime-gateway` (WebSocket/SSE updates for map + chat).
- Keep background jobs off web request threads.

## Data layer
- Postgres as source of truth (multi-tenant schema + RLS where applicable).
- Redis for:
  - distributed rate limits,
  - socket fanout,
  - job queues,
  - short-lived cache.
- Object storage (S3/R2/GCS) for beacon/event images with signed upload/download URLs.

## Observability and security
- Centralized logs + traces + metrics + audit log table.
- Secrets in managed secret store; no secrets in client bundles.
- WAF/bot challenge at edge for posting routes.

## 4) Clear Full Tech Stack (recommended)

- Frontend: Expo SDK 52, React Native 0.76, React Query, RN Web.
- Map UI: Leaflet (or Mapbox GL long-term) with persistent viewport state.
- Auth: managed provider (Auth0 or Clerk) for Google + email login.
- Identity verification: Stripe Identity (driver’s license / document checks).
- Backend APIs: Fastify (primary) + FastAPI (agent/ops, if kept separate).
- DB: Postgres (Render managed, production plan with backups/PITR, upgrade path to read replica).
- Cache/queues/realtime: Redis + BullMQ + Socket.IO Redis adapter.
- Messaging: Twilio Verify + SMS messaging.
- File/media: object storage + image moderation + signed URLs.
- AI orchestration:
  - structured tools and policies in backend,
  - moderation model for text/image,
  - planner/writer agents with strict tool permissions and audit logging.
- Deploy: Render Blueprint (`render.yaml`) with autoscaling and private service boundaries.

## 5) Required UX/Map Behavior Fixes (from your requests)

### A) Prevent map reset when toggles change
- Refactor map rendering so layer toggles update markers on the same map instance.
- Do not rebuild iframe `srcDoc` for normal filter toggles.
- Persist map state: `{center, zoom, bearing?, bounds}` in component state and restore after data refresh.

### B) Web zoom and map zoom behavior
- Add explicit `+` / `-` map zoom buttons (always visible).
- Keep touch pinch-zoom for tablet/mobile map gestures.
- Scope wheel/touch handling to the map container so page zooming does not hijack map interactions.
- Keep accessibility options available; avoid globally disabling browser zoom for the entire app.

### C) Beacon publish flow
- Keep manual “Publish beacon” action (already aligned with your request).
- On publish:
  - validate fields,
  - geocode/normalize address,
  - write beacon,
  - keep current map context,
  - animate marker pulse + auto-focus near current viewport (not world zoom-out).

### D) Hover/click card with photo + directions
- Beacon popup shows:
  - food title/category,
  - latest photo thumbnail,
  - amount level,
  - full copyable address,
  - one-tap Google Maps directions URL.

## 6) Volunteer System Fix Plan

- Keep volunteer ops as compact widget/overlay, not a long standalone workflow.
- Add QR onboarding:
  - QR -> lightweight signup form,
  - collect name/phone/email/tags,
  - store metadata automatically,
  - create roster entry instantly.
- Add “Request volunteers” one-click broadcast:
  - choose event + tag group,
  - AI drafts message,
  - send via SMS/email,
  - capture replies (`YES/NO`) and auto-update status.
- Add anti-spam and consent enforcement (opt-in status, quiet hours, STOP handling).

## 7) AI Agent Strategy That Scales

### Agent roles
- `Map Safety Agent`: beacon/event risk screening, content moderation triage.
- `Meal Planner Agent`: cost-optimized plans using indexed pricing + live refresh on demand.
- `Grant Writer Agent`: opportunity fit, draft generation, review states, Drive export.
- `Volunteer Ops Agent`: staffing suggestions, follow-up drafts, routing by tags.

### AI guardrails
- Tool access by role only (principle of least privilege).
- Every agent action writes immutable audit events.
- High-risk actions (mass outreach, external posting, deletion) require explicit user confirmation.
- Abuse and policy decisions are explainable and reviewable.

## 8) Data Leakage and Privacy Controls (must-do)

- Data classification policy: public map data vs sensitive user data vs regulated identifiers.
- Encrypt sensitive columns and media metadata.
- Signed URL expiry for private assets.
- PII redaction in logs by default.
- Retention schedule:
  - keep only necessary audit evidence window,
  - auto-delete stale drafts and temporary files,
  - hard-delete identity artifacts if provider allows post-verification tokenization.
- Add DSAR/export/delete workflows before broad public launch.

## 9) Too Good To Go Integration Plan

- Treat Too Good To Go integration as **experimental** until an official partner API agreement exists.
- Implement as an adapter behind a feature flag:
  - `tgtg_source` table,
  - ingestion worker,
  - dedup + TTL expiration,
  - separate map icon color and hover card.
- If only unofficial API wrappers are available, isolate into non-critical pipeline and expect breakage.

## 10) Render Deployment Topology (production)

### Services
- `mvoe-web` (static web)
- `mvoe-api-core` (Fastify)
- `mvoe-api-agents` (FastAPI or merged worker API)
- `mvoe-worker-jobs` (BullMQ workers, no public ingress)
- `mvoe-realtime` (Socket gateway, private network with Redis)
- `mvoe-redis` (managed key-value)
- `mvoe-postgres` (managed DB, production plan)

### Deployment controls
- Blueprints for repeatable infra.
- Health checks on each service.
- Autoscaling enabled where applicable.
- Staged environments: `dev`, `staging`, `prod`.
- Zero-downtime migration policy:
  1. additive DB migrations,
  2. code deploy,
  3. cleanup migration.

## 11) Implementation Phases

### Phase 0 (1-2 weeks): stabilize foundation
- Unify auth/session path across Node/Python.
- Move all rate limiters to Redis.
- Fix map viewport persistence and zoom controls.
- Harden beacon publish/remove path with deterministic state transitions.

### Phase 1 (2-4 weeks): trust + moderation
- Add Google/email auth provider.
- Add Stripe Identity verification workflow and badges.
- Add text/image moderation queue + review dashboard.
- Add structured audit logging everywhere.

### Phase 2 (3-5 weeks): volunteer + ops quality
- Complete QR onboarding + tagged broadcast flows.
- Consolidate chat and action widgets into map-first overlay.
- Add delivery/reply tracking and approval queues.

### Phase 3 (4-8 weeks): scale + resilience
- Split worker/realtime services and load test.
- Add canary deploy + incident runbooks + synthetic monitoring.
- Add data retention automation and privacy ops tooling.

### Phase 4 (optional): external ecosystem feeds
- Add Too Good To Go adapter under feature flag.
- Add partner feed contracts and source reliability scoring.

## 12) Team-of-Agents Execution Split

1. Platform Agent: infra, Render blueprint, autoscaling, CI/CD, observability.
2. Identity Agent: auth provider + Stripe Identity + trust tiers.
3. Map Agent: persistent viewport, toggle behavior, zoom UX, overlay widgets.
4. Beacon/Event Agent: publish/edit/remove lifecycle + media attachments.
5. Volunteer Agent: QR intake, roster tags, broadcast + inbound reply automation.
6. AI Safety Agent: moderation policy engine + review queue + abuse score.
7. Data Agent: schema migrations, RLS, retention, PII redaction, audit trails.
8. QA/Load Agent: e2e tests, contract tests, load profile, chaos drills.

## 13) Launch Readiness Gates (do not skip)

- P95 API latency and error budgets defined and met.
- Moderation escalation path staffed and tested.
- Incident response runbook tested in staging.
- Data retention + privacy deletion flows verified.
- Abuse simulations run (spam beacons, fake events, toxic content, bot signups).
- Legal policy pack complete (terms, privacy, community safety standards).

---

## Sources

- Render autoscaling: https://render.com/autoscaling  
- Render blueprints: https://render.com/docs/blueprint-spec  
- Render background workers: https://render.com/docs/background-workers  
- Render cron jobs: https://render.com/docs/cronjobs  
- Render Postgres: https://render.com/docs/postgresql  
- Render key value (Redis): https://render.com/docs/key-value  
- Render health checks: https://render.com/docs/health-checks  
- Render private services: https://render.com/docs/private-services  
- Expo web workflow: https://docs.expo.dev/workflow/web/  
- Leaflet reference (zoom/options/events): https://leafletjs.com/reference.html  
- MDN Geolocation API (secure context + permissions): https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API  
- MDN `touch-action` behavior: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action  
- Google Identity Services overview: https://developers.google.com/identity/gsi/web/guides/overview  
- Verify Google ID tokens: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token  
- Stripe Identity document verification: https://docs.stripe.com/identity/verify-identity-documents  
- Twilio Verify API: https://www.twilio.com/docs/verify/api  
- OWASP API Security Top 10 (2023): https://owasp.org/API-Security/editions/2023/en/0x00-header/  
- OWASP Logging Cheat Sheet: https://owasp.org/www-project-cheat-sheets/cheatsheets/Logging_Cheat_Sheet.html  
- Socket.IO Redis adapter (horizontal scale): https://socket.io/docs/v4/redis-adapter/  
- BullMQ docs: https://docs.bullmq.io/  
- NIST identity proofing guidance (SP 800-63A): https://pages.nist.gov/800-63-4/sp800-63a.html  
- Too Good To Go unofficial client (risk reference): https://github.com/Azzeccagarbugli/tgtg_client
