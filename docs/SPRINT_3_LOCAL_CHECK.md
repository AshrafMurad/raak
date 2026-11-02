# Check Sprint 3 locally in Chrome

All demo identities and records are synthetic. Dependencies and Chrome are
already installed in the current workspace; the steps below download nothing.
Use Node 24 and Docker Desktop. If setting up a fresh machine, install the locked
npm dependencies and Chrome separately before these steps (large downloads are
owner-run).

## Fastest: interactive two-window demo, no email provider

This reuses the real API/PostgreSQL browser harness. It creates an isolated
temporary agency, submits a synthetic request through the UI, captures its email,
verifies the one-time link, and opens authenticated customer/coordinator windows.
It then pauses so **you** can operate both windows. No separately running API,
worker, or frontend development server is needed.

1. Open PowerShell in `E:\projects\MERN stack\raak\backend`:

   ```powershell
   docker compose up -d --pull never postgres redis
   npm run migrate
   ```

   The existing `backend/.env` must point to your local DB/Redis. This workspace
   exposes PostgreSQL on **5433** and Redis on **6380**; fresh `.env.example`
   defaults use 5432/6379. Keep `DATABASE_URL` / `REDIS_URL` aligned with
   `RAAK_PG_HOST_PORT` / `RAAK_REDIS_HOST_PORT` and `docker compose ps`.

2. In `E:\projects\MERN stack\raak\frontend`:

   ```powershell
   npm run build:browser
   ```

   This builds the same-origin test app without changing `.env.local`.

3. Back in `E:\projects\MERN stack\raak\backend`:

   ```powershell
   npm run test:browser:sprint3 -- --manual
   ```

   Installed Chrome opens two windows and Playwright Inspector. **Keep the
   terminal and Inspector open.** The customer is on `/ar/track`; the coordinator
   is on `/ar/workspace/requests`, on a temporary `browser-s3-….localhost:3110`
   hostname. Use those existing windows; their cookies are separate. The terminal
   prints both safe page URLs and the synthetic request reference.

4. Try the checklist below. Refresh the other window after an action. You can
   replace `/ar/` with `/en/` on the same hostname to test English.
5. When finished, click **Resume** in Playwright Inspector. The harness closes
   its servers/windows and removes only its temporary agency fixtures. If the
   session exceeds 30 minutes, start a fresh demo because guest verification expires.

Ports **3110** and **3111** must be free. If Chrome is missing, install it through
your normal browser installer; this harness uses the installed `chrome` channel.

### Manual acceptance checklist

| Window | Action | Expected |
|---|---|---|
| Coordinator | Open request detail → Start review → Manage request | UNDER_REVIEW, versioned decisions and quote editor |
| Coordinator | Request more information, with a short synthetic note | AWAITING_CUSTOMER |
| Customer | Refresh Track | Note is visible in the timeline; response field appears |
| Customer | Send response | UNDER_REVIEW; coordinator can refresh to see it |
| Coordinator | Fill description, quantity, unit price and terms → Create quote draft | DRAFT; not yet customer-visible |
| Coordinator | Send quote (confirm freeze) | SENT v1; expiry and server-computed total |
| Customer | Refresh → Request revision, with >=10 characters | Pending revision; Accept/Reject disabled, also after refresh |
| Coordinator | Refresh → adjust the quote editor → Issue replacement → confirm with the second Issue replacement button | SENT v2; v1 SUPERSEDED; revision RESOLVED |
| Customer | Refresh → Accept this version on v2 | ACCEPTED; no payment or booking is created |
| Coordinator | Refresh → confirm operational assessment → Approve request | APPROVED; quote editor no longer available |

Example money input: quantity `8`, unit price `15000` minor units means
**SAR 1,200.00 total**. The server computes and validates the total.

Also try rejecting a quote, declining a revision, and withdrawing an open request
in fresh demo runs. Those are different outcomes, so don't combine them with the
successful acceptance journey on the same request.

## Automated browser check

After the same browser build, from `backend/`:

```powershell
npm run test:browser:sprint3
```

This runs E03 in AR/EN, I10 superseded-acceptance denial, I11 idempotent acceptance,
information-response visibility, pending-revision disabled controls, and the
390/1440px light/dark workspace matrix. To watch it run:

```powershell
npm run test:browser:sprint3 -- --headed
```

## Normal persistent development app

Use this when developing or keeping your own synthetic records between sessions.

In `backend/`, after migrations:

```powershell
npm run seed
npm run dev
```

In a second terminal in `frontend/`:

```powershell
npm run dev
```

Configuration: `frontend/.env.local` should use
`NEXT_PUBLIC_API_BASE_URL="http://platform.localhost:3001"`. The API client
preserves port 3001 while choosing the current tenant hostname. Backend
`BASE_DOMAIN=localhost` and `API_CORS_ORIGINS` must include
`http://afiya.localhost:3000`. Restart development servers after environment edits.

| Page | URL |
|---|---|
| Agency staff sign-in | http://afiya.localhost:3000/ar/login |
| Service setup | http://afiya.localhost:3000/ar/workspace/services |
| Request queue | http://afiya.localhost:3000/ar/workspace/requests |
| Customer catalog | http://afiya.localhost:3000/ar/services |
| Customer tracking | http://afiya.localhost:3000/ar/track |
| API DB readiness | http://afiya.localhost:3001/v1/health/ready |

Seeded staff credentials (development only):

- Owner: `owner.afiya@example.invalid`
- Coordinator: `shared.person@example.invalid`
- Password for either: `Synthetic-Dev-Only-1!`

The seed creates a platform service template, not a published agency offering.
Sign in as Owner and import/configure/publish a service first. Requests appear
only after submission. Use a separate browser profile/incognito window for the
customer. `localhost:3000` alone is not the Afiya agency hostname.

The normal app requires a configured verified email sender and
`npm run dev:worker` to deliver guest verification mail. Without
`EMAIL_API_KEY` / `EMAIL_FROM`, events stay pending; there is no fake delivery.
Use the interactive demo above for a complete local synthetic journey without
email credentials. Quote/request business-event email rendering remains Sprint 7;
refresh the verified tracking page to see offers and changes.
