# Sovereign Cloud Mythbusters poll

A mobile-friendly audience poll for the six sovereignty myths. Each myth offers **Busted**, **Plausible**, and **Confirmed**. Attendees answer at their own pace. Results are shared across devices and update every two seconds.

The default Ignite theme comes from slide 1 of the supplied `ignite.pptx`: Segoe UI typography, white text, light-blue accents, and its navy/neon background artwork. The image is extracted from the replacement deck, not from the original rights-protected presentation. No speaker details, QR codes, slide titles, or logos are copied into the results.

## Live deployment

Deployed to Canada Central:

- **Audience:** https://app-poll-f4yiiqlof45yo.azurewebsites.net/
- **Presenter:** https://app-poll-f4yiiqlof45yo.azurewebsites.net/presenter
- **Square results:** https://app-poll-f4yiiqlof45yo.azurewebsites.net/results/1 (replace `1` with `2` through `6`).

On the deployment machine, retrieve the presenter key from the repository root with `azd env get-value ADMIN_TOKEN`. Keep it private. The presenter dashboard provides the audience QR code, all six embed URLs, and PNG/SVG exports.

## Run locally

Requires Node.js 24 or newer. From PowerShell in this repository:

```powershell
Set-Location src\web
npm ci
# Generate two independent secrets. Save the presenter key securely if you need it again.
$env:ADMIN_TOKEN = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$env:COOKIE_SECRET = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
# Display only the presenter key when needed; do not share it with attendees.
$env:ADMIN_TOKEN
npm start
```

Open `http://localhost:3000` to vote and `http://localhost:3000/presenter` to manage the poll. Enter `ADMIN_TOKEN` on the presenter page. Do not put the key in a URL. The dashboard keeps it only in page memory; reload or lock the page to remove it.

Local development saves votes atomically in `src\web\data\poll.json`. Keep the same `COOKIE_SECRET` across restarts to preserve browser vote recognition. Run only one local server against a data file. Production **requires Azure Table Storage** and will not silently fall back to local files.

```powershell
npm run check
npm test
```

## Presenter workflow

1. Open `/presenter`, sign in, and show the QR code or share the audience link.
2. Attendees vote once on each myth. Submitted answers are final for that round.
3. Open or close voting from the dashboard. Closing voting does not hide results.
4. Use **Start new round** to clear the displayed results and allow everyone to vote again. This requires a confirmation dialog. Previous Azure rows remain stored but are excluded from the new round; local reset removes previous votes.

No attendee accounts, names, or email addresses are collected. A signed HttpOnly cookie recognizes a browser. This is a presentation poll, **not an election-grade voting system**: another browser, device, or cleared cookie can vote again. Rate limits are per browser for votes, so attendees sharing venue Wi-Fi are not limited to a shared quota. Presenter sign-in attempts are IP-rate-limited. In-process rate limits are intended for the single-instance event deployment.

## Square results for PowerPoint

Each live view has only the three answer labels, percentages, and counts: no question title, navigation, branding, or total-vote banner.

| Myth | Live view |
| --- | --- |
| 1 | `/results/1` |
| 2 | `/results/2` |
| 3 | `/results/3` |
| 4 | `/results/4` |
| 5 | `/results/5` |
| 6 | `/results/6` |

The default is `scoutTheme=ignite`, matching slide 1 regardless of the device's light/dark preference. Existing `scoutTheme=light` and `scoutTheme=dark` links retain their neutral themes. The dashboard theme selector updates the copied URLs and exports. Ignite PNG/SVG exports include the background image inside the file, so there is no external image dependency in PowerPoint. Charts crop the artwork to a square and darken it behind the results for readable text. Set the PowerPoint web object to equal width and height (for example 4 x 4 inches); non-square host frames letterbox the square instead of stretching it.

**Live:** PowerPoint does not natively embed an arbitrary web page as a live slide object. Use an organization-approved PowerPoint web-viewer add-in that accepts HTTPS URLs and supports your presentation platform. Paste the full Azure `/results/N` URL into the add-in. Results pages allow iframe embedding; the audience and presenter pages intentionally do not. No presenter key is needed for read-only results. Test the add-in in slideshow mode on the presenting machine before the event. Add-in availability, authentication behavior, and organizational policies vary; this repository does not install a PowerPoint add-in.

**Snapshot:** Click **PNG** (1200 x 1200) or **SVG** (640 x 640) on the presenter dashboard, then use **Insert > Pictures** in PowerPoint. Snapshots are square and contain only the results, but do not refresh automatically. An interrupted live connection displays an explicit error rather than silently presenting stale results as current. Percentages are independently rounded and can sum to 99% or 101%.

## Azure architecture and deployment

The deployment files prepare:

- One Linux App Service B1, Node.js 24, HTTPS-only and always on.
- Azure Table Storage using managed identity with data access scoped to the poll table; shared-key access disabled.
- Key Vault for presenter and cookie secrets, with managed-identity secret access.
- Application Insights and Log Analytics with a daily workspace ingestion cap.

`azure.yaml` uses Azure Developer CLI (AZD) with Bicep under `infra`. This is a small, single-region event deployment, not a load-tested high-availability service. Rough budget: low tens of USD/month for the App Service plan, plus storage, Key Vault and monitoring usage. Verify current regional prices before provisioning. Closing voting or stopping the web app **does not stop App Service plan charges**.

Before any new deployment, confirm the subscription, region, regional Node.js 24 availability, subscription policies, quotas, and budget. Do not rely on CLI defaults implicitly. The account provisioning this infrastructure needs resource creation and role-assignment permission.

After those checks and approval, use PowerShell:

```powershell
azd auth login
az login
azd env new sovereignty-poll --no-prompt
azd env set AZURE_SUBSCRIPTION_ID "<confirmed-subscription-id>"
azd env set AZURE_LOCATION "<confirmed-region>"
# Generate these once, store securely, and preserve them on redeploy.
$env:ADMIN_TOKEN = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$env:COOKIE_SECRET = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
azd env set ADMIN_TOKEN $env:ADMIN_TOKEN
azd env set COOKIE_SECRET $env:COOKIE_SECRET
azd up
```

AZD's ignored local environment file contains these secrets; do not commit or share it. Bicep receives them as secure parameters and stores them in Key Vault. App Service resolves Key Vault references; storage access uses `ManagedIdentityCredential` in production. Initial RBAC propagation can briefly delay readiness. Once deployed, confirm `/health` returns 200 and run a real audience/presenter/results rehearsal. AZD outputs `WEB_URL` and `PRESENTER_URL`; append the results paths above to `WEB_URL`.

If AZD is signed into a different account from Azure CLI, use `auth.useAzCliAuth` in an isolated configuration directory instead of changing global settings:

```powershell
$env:AZD_CONFIG_DIR = Join-Path $env:TEMP "sovereignty-poll-azd"
azd config set auth.useAzCliAuth true
# Reuse this AZD_CONFIG_DIR for subsequent provision/deploy/show commands.
```

To retrieve the existing presenter key on the machine that created the AZD environment, run `azd env get-value ADMIN_TOKEN` from the repository root. Treat its output as a password. Do not regenerate either secret on a routine redeployment.

For a custom domain, update `PUBLIC_URL` in App Service to the canonical HTTPS audience URL so QR codes use it. Protect presenter keys, keep browser TLS warnings out of your workflow, and rotate secrets through Key Vault and App Service references as needed. Changing the cookie secret invalidates existing voter cookies and can allow repeat votes.

### Data retention and operations

Votes contain a random browser identifier, question, answer, and round. Azure automatically records row timestamps; infrastructure diagnostics can also record request metadata such as IP addresses and URLs. Results APIs expose aggregate counts only. Configure access and retention to match the event's privacy requirements.

Azure Table Storage has no automatic row TTL. After the event, remove obsolete round partitions through an authorized storage-management process, or delete the event resources after explicitly approving the resulting data loss. Key Vault uses soft delete and purge protection. Keep a backup if results must be retained.

The results cache is two seconds per process. Azure aggregate scans have a 10-second abort deadline so a stalled storage request cannot indefinitely block subsequent refresh attempts. Failures are reported explicitly rather than replaced with zero counts. Vote writes are create-only and duplicate-safe across instances; counts are eventually refreshed. Votes already being accepted when a presenter closes voting can finish; votes in flight during reset remain associated with the old round and cannot affect the new round's results.
