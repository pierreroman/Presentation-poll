# Debunkers

A presenter console for running Busted / Plausible / Confirmed votes during a talk.
Single-page React app (Vite + TypeScript + Tailwind CSS v4), no backend.

Preloaded with the six questions from the *Digital sovereignty* session. Edit them in the
**Questions** view or in [`src/pages/poll-data.ts`](src/pages/poll-data.ts).

## What it does

- **Reference-inspired design:** dark navy grid and neon accents, a responsive two-column
  statement-card landing page, and a light/dark theme switch. Background artwork is CSS,
  not a screenshot containing duplicated text.
- **Vote view:** see every statement and add votes to the question opened in Presenter.
  Each click adds one vote; this is not one-response-per-person voting.
- **Presenter / Questions:** separate views preserve the controls and question editor.
- **Run of show:** every question with its status (Not started / Voting open / Closed) and vote count.
- **Present view:** big question, A/B/C answers with live bars, percentages and counts.
- **Controls:** Open / Close voting (one question open at a time), Hide / Show results,
  Undo last vote, Reset, Previous / Next.
- **Questions view:** add, edit, reorder, delete questions; 2–6 answers each.

> **Limitations:** votes are tallied on the device running the page (presenter clicks, or a
> shared kiosk screen). There is no phone voting via QR code, and state lives in memory only:
> a page reload resets questions and votes. For audience voting from phones, use
> Microsoft Forms in PowerPoint (Insert → Forms → *Present for interactive meetings*).

## Run locally

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/
```

Requires Node.js 20.19+ or 22.12+ (Vite 7).

## Deploy to Azure Static Web Apps

One-time setup (Azure CLI + GitHub CLI signed in):

```powershell
.\infra\deploy.ps1
```

The script:

1. Verifies tenant `26f29274-e3a0-4e49-bc81-5fde2f2996b2` and subscription
   `dfcf7181-677b-4513-932b-75a4642ab752`, then reuses `RG-Presentation-Poll`
   (or creates it if missing). Parameters can override these defaults.
2. Deploys [`infra/main.bicep`](infra/main.bicep) (Static Web App, Free tier).
3. Reads the SWA deployment token and stores it as the `AZURE_STATIC_WEB_APPS_API_TOKEN`
   Actions secret on this repo. Deployment tokens identify the target app, so the
   workflow does not need an Azure client secret or subscription login.

The Static Web App defaults to `eastus2`; its location can differ from the resource
group's location. Dependencies are installed with `npm ci` from `package-lock.json`
so Linux runners do not reuse Windows binaries committed in `node_modules`.
Do not commit generated `node_modules/` or `dist/` directories.

After that, every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
install → type-check → build → upload `dist/` to the Static Web App. Same-repository pull
requests get a staging environment that is torn down when the PR closes. Fork pull
requests are built and type-checked, but do not receive deployment secrets or previews.

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

[`public/staticwebapp.config.json`](public/staticwebapp.config.json) sets SPA fallback
routing and a strict Content-Security-Policy (no third-party scripts, fonts are bundled).

## Project layout

```
.github/workflows/deploy.yml   CI/CD to Azure Static Web Apps
infra/main.bicep               Static Web App resource
infra/main.bicepparam          Default parameters
infra/deploy.ps1               Provision + set GitHub secret
public/staticwebapp.config.json
src/
  App.tsx                      Shell (header, skip link, toaster)
  main.tsx                     Entry point
  index.css                    Tailwind v4 + theme tokens (light/dark)
  pages/home.tsx               Present view, results board, question editor
  pages/poll-data.ts           Data model + session questions
  components/ui/               shadcn/ui primitives (button, input, label, textarea, sonner)
  lib/utils.ts                 cn() helper
```
