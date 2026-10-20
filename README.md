# Debunkers

A presenter console for running Busted / Plausible / Confirmed votes during a talk.
React app (Vite + TypeScript + Tailwind CSS v4) with a managed Azure Functions API,
shared Azure Table Storage, and invitation-only Microsoft presenter sign-in.

Preloaded with the six questions from the *Digital sovereignty* session. Edit them in the
**Questions** view or in [`src/pages/poll-data.ts`](src/pages/poll-data.ts).

## What it does

- **Reference-inspired design:** dark navy grid and neon accents, a responsive two-column
  statement-card landing page, and a light/dark theme switch. Background artwork is CSS,
  not a screenshot containing duplicated text.
- **Vote view:** see every statement and add votes to the question opened in Presenter.
  Each click adds one vote; this is not one-response-per-person voting.
- **Presenter / Questions / Results:** only invited Microsoft accounts with the `presenter` role
  can access these views or their APIs. Attendees see voting only.
- **One results page per question:** `/results-1` shows only question 1, `/results-2`
  only question 2, and so on. Each page shows the statement, status, answer counts,
  percentages, and question total, with Previous/Next links. `/results` is an index
  linking to these individual pages. URLs follow the current question order; reordering
  questions changes which statement appears at each number. Invalid or removed question
  numbers show "Question not found", not another question's results.
  Pages refresh every three seconds and are read-only. Presenters see the actual
  counts here even when results are hidden from attendees.
- **Run of show:** every question with its status (Not started / Voting open / Closed) and vote count.
- **Present view:** big question, A/B/C answers with live bars, percentages and counts.
- **Controls:** Open / Close voting (one question open at a time), Hide / Show results,
  Undo last vote, Reset, Previous / Next.
- **Questions view:** add, edit, reorder, delete questions; 2–6 answers each and at most
  20 questions. Use **Save and present** to persist edits. Switching views without
  saving does not publish the draft. Concurrent edits by another presenter are rejected
  rather than silently overwriting them.

Votes and presenter changes are persisted on the server and shared across devices.
Browsers refresh state every three seconds. Hidden results are removed from public API
responses, not just hidden in CSS. Undo and reset operate on shared votes.

> **Limitations:** anonymous voting does not enforce one vote per person or provide
> bot/abuse protection. Each click adds a vote. This is a small-session demo, not an
> election system. A session approaching the Table entity size limit fails explicitly;
> reset old votes to free capacity. No email addresses or account IDs are stored with
> attendee votes. Presenter role assignments live in Azure Static Web Apps, not in the browser.

## Run locally

Requires Node.js 22.12+, Azure Functions Core Tools v4, the Azure Static Web Apps CLI,
and Azurite (including its Table service). Install those development tools first.
Do not expose the local Functions host publicly: production trusts authentication headers
only because the API is behind the Static Web Apps managed gateway.

```powershell
npm ci
npm ci --prefix api
npm run build:api
Copy-Item api\local.settings.example.json api\local.settings.json
# Start Azurite in another terminal before creating the development table.
az storage table create --name PollSessions --connection-string "UseDevelopmentStorage=true"
npm run dev
# In another terminal:
swa start http://localhost:5173 --api-location api --swa-config-location public
```

Use the emulator URL (normally `http://localhost:4280`), not Vite directly, so `/.auth`
and `/api` routes work. Local sign-in uses the emulator's fake identity dialog; choose
provider `aad` and add the `presenter` role to test presenter behavior. This is local
emulation only and does not grant any access to the deployed app.

```powershell
npm run build       # Frontend type-check and production bundle
npm run test:api    # API build, authorization, HTTP, state and concurrency tests
```

Missing API/authentication services produce an explicit connection error, never a
browser-only fallback that pretends a vote was saved.

## Deploy to Azure Static Web Apps

One-time setup (Azure CLI + GitHub CLI signed in):

```powershell
.\infra\deploy.ps1
```

The script:

1. Verifies tenant `26f29274-e3a0-4e49-bc81-5fde2f2996b2` and subscription
   `dfcf7181-677b-4513-932b-75a4642ab752`, then reuses `RG-Presentation-Poll`
   (or creates it if missing). Parameters can override these defaults.
2. Deploys [`infra/main.bicep`](infra/main.bicep): Free-tier Static Web App, a
   Standard LRS storage account and the `PollSessions` table. Storage has usage-based
   charges. The storage connection string goes directly into the app's server-side
   settings; it is not returned as an output or bundled into the frontend.
3. Reads the SWA deployment token and stores it as the `AZURE_STATIC_WEB_APPS_API_TOKEN`
   Actions secret on this repo. Deployment tokens identify the target app, so the
   workflow does not need an Azure client secret or subscription login.

The Static Web App defaults to `eastus2`; its location can differ from the resource
group's location. Dependencies are installed with `npm ci` from `package-lock.json`
so Linux runners do not reuse Windows binaries committed in `node_modules`.
Do not commit generated `node_modules/` or `dist/` directories.

After that, every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
install → type-check → build frontend → test/build API → upload `dist/` and the API.
Same-repository pull
requests get a staging environment that is torn down when the PR closes. Fork pull
requests are built and type-checked, but do not receive deployment secrets or previews.
Preview environments require their own `POLL_STORAGE_CONNECTION_STRING` app setting
pointing to a separate test account/table; do not share production polling storage
with previews. Production role assignments must also not be assumed to carry over.

You can also run **Deploy to Azure Static Web Apps** from GitHub's **Actions** tab using
**Run workflow**. Select `main` to deploy to production; other branches deploy to preview
environments. Push the workflow to GitHub before trying to run it.

For an existing Static Web App, add its deployment token in this repository's
**Settings → Secrets and variables → Actions → New repository secret**, named
`AZURE_STATIC_WEB_APPS_API_TOKEN`. Obtain the token from the Azure portal's Static Web
App **Manage deployment token** page. The workflow fails explicitly if the secret is
missing. Never commit or paste the token into the workflow.

Manual alternative without the script:

```bash
az account set --subscription dfcf7181-677b-4513-932b-75a4642ab752
az deployment group create -g RG-Presentation-Poll -f infra/main.bicep
az staticwebapp secrets list -n presentation-poll -g RG-Presentation-Poll --query properties.apiKey -o tsv
# paste the token into GitHub → Settings → Secrets and variables → Actions
```

Managed Functions do not support managed identity, so the connection string is held
in Azure app settings. Restrict access to those settings and rotate storage keys when
needed. A separate, paid Functions hosting model would be needed to use managed identity.

### Grant presenter access

Signing in does **not** automatically grant the `presenter` role. After deployment:

1. Open the `presentation-poll` Static Web App in Azure Portal.
2. Go to **Role management -> Invite**.
3. Select **Microsoft Entra ID** (`aad`), enter the account email, select the site's
   production domain, and enter the custom role **`presenter`**.
4. Create separate invitations for the approved accounts:
   - `pierrer@microsoft.com`
   - `proman_2007@hotmail.com`
5. Send each invitation link privately to that account. Each presenter must redeem
   their invitation while signed in with that exact Microsoft account.
6. Open **Presenter sign-in** on the site. Invited users see **Presenter** and
   **Questions** and **Results**; everyone else remains in the voting view. If a role was changed,
   sign out and sign in again to refresh the role.

The built-in provider accepts work and personal Microsoft accounts. The tenant used
to provision Azure resources is not a sign-in allowlist. Access is granted only by the
invitation role, not by matching an email string, a URL flag, local storage, or a PIN.
To revoke access, remove the user's `presenter` role in Role management.

[`public/staticwebapp.config.json`](public/staticwebapp.config.json) protects
`/presenter`, `/questions`, `/results`, `/results-*`, and `/api/presenter/*`. The API independently verifies the
trusted Microsoft identity and `presenter` role for every private read and mutation.
Unknown API routes are restricted by default, and public votes cannot alter questions,
status, results visibility, or role assignments. GitHub sign-in is disabled.

Never host this API as a standalone, anonymously reachable Function App without adding
independent token validation. The trusted `x-ms-client-principal` header is supplied
and sanitized by Static Web Apps, not trusted from arbitrary external callers.

## Project layout

```
.github/workflows/deploy.yml   CI/CD to Azure Static Web Apps
infra/main.bicep               Static Web App, Table Storage, server-side settings
infra/main.bicepparam          Default parameters
infra/deploy.ps1               Provision + set GitHub secret
public/staticwebapp.config.json
api/
  src/index.ts                 Managed HTTP Functions registration
  src/http.ts                  Request authorization and explicit errors
  src/poll.ts                  Validated presenter commands and public voting
  src/store.ts                 Shared session with optimistic ETag concurrency
  test/                        Authorization, HTTP, state and storage tests
src/
  App.tsx                      Shell (header, skip link, toaster)
  main.tsx                     Entry point
  index.css                    Tailwind v4 + theme tokens (light/dark)
  pages/home.tsx               Present view, results board, question editor
  pages/poll-data.ts           Data model + session questions
  components/ui/               shadcn/ui primitives (button, input, label, textarea, sonner)
  lib/utils.ts                 cn() helper
  lib/use-poll-session.ts       Authenticated API client and three-second refresh
```
