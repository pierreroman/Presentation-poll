# Sovereignty poll deployment plan

Status: Deployed

## Goal
Create an Azure-hosted audience poll for six sovereignty myths, styled from slide 1 of the supplied presentation, with Busted, Plausible, and Confirmed answers.

## Requirements
- Mobile-friendly audience voting.
- Individual square, live results views without titles or unrelated information, suitable for a PowerPoint web viewer.
- Persistent shared results across audience devices.

## Project and requirements
- New, self-contained Node.js web application; existing repository contains only README and license.
- Event/demo workload, cost-optimized, assumed fewer than 1,000 audience members.
- Anonymous, self-paced voting on all six myths; one answer per browser per question per round.
- Presenter page offers QR code, results links, voting open/closed controls, and new-round reset.
- User supplied a readable replacement `ignite.pptx` and requested its theme: slide 1 Segoe UI, white text, light-blue accent, and navy/neon background. This supersedes the initial neutral theme decision.
- Live PowerPoint embedding requires a compatible web-viewer add-in, not native image insertion.
- Each question has a results-only square view and downloadable square SVG/PNG snapshots.
- No attendee names, email addresses, or sign-in; browser identifiers are not identity verification.

## Recipe and architecture
- Recipe: AZD with Bicep.
- Node.js 24 LTS, Express, browser JavaScript and CSS, no frontend build framework.
- Single Linux Azure App Service B1 for frontend and API, always on during the event.
- Azure Table Storage with managed-identity access for durable shared votes.
- Local atomic JSON persistence for development only; production refuses local storage.
- Key Vault for presenter and cookie secrets; Application Insights and Log Analytics for diagnostics.
- A short-lived in-process results cache limits repeated storage scans.
- HTTPS, same-origin mutations, signed HttpOnly voter cookies, request validation and rate limiting.
- Node.js 24 LTS and Linux B1 availability checked; Bicep compiles locally.
- Native Bicep resources are used: Azure MCP/AVM catalog tools are not available in this environment. Resource schemas are checked with Bicep and ARM preflight validation.

## Azure context
- Confirmed subscription: VisualStudio-subscription (`dfcf7181-677b-4513-932b-75a4642ab752`).
- Confirmed region: Canada Central (`canadacentral`).
- AZD's conflicting defaults will be overridden explicitly.
- Azure Retail Prices API: Canada Central Linux B1 is USD 0.018/hour, approximately USD 13.14 per 730-hour month, before tax and subscription-specific discounts.
- Additional Table Storage, Key Vault, and monitoring charges are usage-based. Workspace ingestion is capped at 1 GB/day but this is not an overall spending cap.
- Price source: https://prices.azure.com/api/retail/prices (Azure App Service, canadacentral, B1, Consumption).

## Resource inventory and provisioning gate
| Resource | Quantity | Current / after | Capacity validation |
| --- | --- | --- | --- |
| Resource group | 1 | 1 / 2 | Below documented 980 groups/subscription |
| Microsoft.Web/serverfarms (B1 Linux) | 1 | 0 / 1 | Quota API reports regional VMs 0/30 (isQuotaApplicable=false); Canada Central B1 advertised; ARM preflight required |
| Microsoft.Web/sites | 1 | 0 / 1 | One site on one B1 plan; below generic 800 resources/type/group |
| Microsoft.Storage/storageAccounts (Standard_LRS) | 1 | 0 / 1 | az quota: 250 accounts, current usage 0 |
| Microsoft.KeyVault/vaults | 1 | 0 / 1 | Quota API BadRequest; ARG count 0; no vault-count cap in service-specific limits, below generic 800/type/group |
| Microsoft.OperationalInsights/workspaces | 1 | 0 / 1 | Quota API BadRequest; ARG count 0; published non-Free tier workspace count has no limit |
| Microsoft.Insights/components | 1 | 0 / 1 | Quota API BadRequest; ARG count 0; below generic 800 resources/type/group |

Sources: azure-quotas via Azure CLI, Azure Resource Graph, https://learn.microsoft.com/azure/azure-resource-manager/management/azure-subscription-service-limits, https://learn.microsoft.com/azure/key-vault/general/service-limits, https://learn.microsoft.com/azure/azure-monitor/fundamentals/service-limits.
Capacity checks are preliminary; ARM preflight validation remains required before deployment.

## Policy constraints
One subscription assignment detected: ASC Default. No separate allowed-region, naming, or required-tag assignments appeared. ARM preflight validation will check effective policy compliance.

## Execution
- [x] Inspect repository and gather available requirements.
- [x] Select neutral theme with explicit user approval.
- [x] Proceed with reasonable implementation assumptions under autonomous continuation.
- [x] Confirm subscription and region explicitly with user.
- [x] Check resource inventory, quotas, policy assignments, runtime support and retail B1 price.
- [x] Implement app and Azure infrastructure.
- [x] Approve deployment plan and cost (user chose "Approve the plan and deploy").
- [x] Verify functionality and validate deployment configuration.
- [x] Deploy after Azure context and cost approval.
- [x] Verify public health, voting, duplicate prevention, close/open, live updates, and iframe embedding.
- [x] Start a clean audience round with voting open and zero displayed votes.

### All validation checks pass
- [x] AZD installation.
- [x] Schema validation: azure.yaml accepted by AZD packaging and preview.
- [x] Environment setup.
- [x] Authentication check.
- [x] Subscription/location check.
- [x] Aspire pre-provisioning checks: not applicable.
- [x] Provision preview.
- [x] Build verification.
- [x] Docker build context validation: not applicable.
- [x] Package validation.
- [x] Azure policy validation: preview successful with effective subscription policies.
- [x] Aspire post-provisioning checks: not applicable.

## 7. Validation Proof

Validation date: 2026-10-16.
| Check | Command | Result |
| --- | --- | --- |
| JavaScript syntax | npm run check | Passed |
| API and persistence | npm test | 6 integration tests passed |
| Infrastructure compilation | az bicep build --file infra/main.bicep | Passed |
| Browser check | Playwright mobile voting, reload, presenter, export | Passed: six questions, 18 answers, six charts, 390x390 results, no title or controls, no JS errors |
| PNG dimensions | Node PNG header read | Passed: 1200x1200 |
| Provision preview | azd provision --preview --no-prompt | Passed, 2026-10-16; seven primary resources, Canada Central |
| Package | azd package --no-prompt | Passed, 2026-10-16 |
| Policy | az policy assignment list; AZD provision preview | ASC default assignment only; preview passed |
| Provision | azd provision --no-prompt | Passed; resource group rg-poll-f4yiiqlof45yo |
| Remote deployment | az webapp log deployment list | Active=true, complete=true, status=4; completed 2026-10-16T14:31:35Z |
| Public health | HTTPS GET /health | 200, status ok |
| Real Azure data access | HTTPS API smoke test, two independent browser sessions | 12 accepted votes across six questions, shared counts correct, duplicate 409, closed vote 403 |
| Live browser integration | Playwright on public Azure URL | Mobile vote updated results; 600x600 square, no headings/buttons; all six results routes 200 |
| Embedding | Playwright iframe, public Azure URL | 500x500 dark chart loaded without JS errors |
| Clean round | Authenticated reset after checking only smoke-test votes existed | Six questions, zero votes, voting open |
| Ignite theme syntax and regression, 2026-10-16 | npm run check; npm test | Passed, 9 tests including theme defaults/overrides, JPEG serving, and aggregate deadline/error propagation |
| Ignite browser/export, 2026-10-16 | Playwright desktop/mobile/presenter/results/downloads | 6 myths, 18 choices, 600x600 results only, no JS errors; PNG 1200x1200 and portable SVG 640x640 with exact embedded deck image |
| Theme update Azure preflight, 2026-10-16 | azd version; azd auth login --check-status; azd env get-value AZURE_SUBSCRIPTION_ID; azd env get-value AZURE_LOCATION | Approved subscription and Canada Central unchanged; authenticated |
| Theme update preview/package, 2026-10-16 | azd provision --preview --no-prompt; azd package --no-prompt | Passed; no infrastructure changes will be applied |
| Theme update target/policy, 2026-10-16 | az resource list --resource-group rg-poll-f4yiiqlof45yo; az policy assignment list | Exactly one web-tagged App Service target; ASC Default only; preview successful |
| Theme update RBAC, 2026-10-16 | Static review of infra/modules/resources.bicep roleAssignments | Table Contributor scoped to table and Secrets User scoped to vault unchanged; appropriate for existing data operations |

Validated by: azure-validate skill.

## Role assignment verification
- Status: Verified (static).
- Web app system-assigned identity: Storage Table Data Contributor scoped to the poll table (create/read votes and configuration).
- Web app system-assigned identity: Key Vault Secrets User scoped to the event vault (resolve app-setting references).
- No local cloud data permissions required for file-based integration tests.
- AZD originally used an account without this subscription. Resolved using an isolated session AZD_CONFIG_DIR with auth.useAzCliAuth=true; no global user settings changed.

## Live role verification
- Status: Passed, 2026-10-16.
- `az role assignment list --assignee-object-id <web-identity> --all` confirmed Storage Table Data Contributor on the poll table and Key Vault Secrets User on the event vault.
- App Service config-reference API confirmed both secret references have status Resolved.
- Production votes and results successfully read/wrote Table Storage using the managed identity.

## Deployment result
- Audience: https://app-poll-f4yiiqlof45yo.azurewebsites.net/
- Presenter: https://app-poll-f4yiiqlof45yo.azurewebsites.net/presenter
- Square results: https://app-poll-f4yiiqlof45yo.azurewebsites.net/results/1 through /results/6.
- Resource group: rg-poll-f4yiiqlof45yo, Canada Central.
- App Service state: Running. Remote deployment ID c5f07aa7-0d3e-4b06-8fff-5b9edb090c3c succeeded.
- AZD's local runtime-status monitor continued reporting startup after Azure's deployment record showed success and the full public app worked. Stopped only that local monitoring process after checking Kudu success and public end-to-end behavior; did not cancel the remote deployment or stop the app.
- Presenter key remains in the ignored local AZD environment and Key Vault; no secrets are recorded here.

## Files to generate
- `src/web/`: standalone web server, persistence adapter, audience/presenter/results UI and tests.
- `infra/`: subscription-scope Bicep entry point and resource-group resources.
- `azure.yaml`: AZD App Service deployment configuration.
- `README.md`: local run, Azure deployment, poll operations and PowerPoint embedding instructions.

## Ignite theme update
- Scope: application styling only; reuse the approved subscription, Canada Central resources, AZD environment, presenter/cookie secrets, round, and existing votes.
- Slide 1 background extracted from `ppt/media/image2.jpg` in the user-supplied `ignite.pptx` (182,784 bytes; SHA-256 `4b50cabeecb0eb12970b0893bf2062e7db5458ef81c7821ab5cf7d925786653a`).
- Default theme is Ignite regardless of OS preference; explicit light/dark links remain compatible.
- Live squares crop and darken the deck artwork; exports embed the exact image as a data URI. No titles, controls, QR codes, logos, or speaker details are added.
- Validation, 2026-10-16: `npm run check` passed; `npm test` passed all 8 tests, including theme defaults/overrides and serving the JPEG.
- Playwright: desktop and 390px mobile, 6 myths/18 answers, no horizontal overflow; default Ignite presenter and theme switching; 600x600 results with no headings/buttons; no JavaScript errors.
- Downloads: SVG 640x640, PNG 1200x1200; SVG embedded image byte-for-byte identical to deck background. Both inspected visually for contrast and layout.
- AZD installation/auth/environment rechecked; `azd provision --preview --no-prompt` and `azd package --no-prompt` passed. Preview shows only service-default drift; **no provisioning will run** for this application-only update.
- First theme deployment `60c745ff-30fb-4cfa-bddd-26f3d9d59a55` succeeded, but post-cutover aggregate requests stalled while point reads and health remained responsive. Storage metrics show successful query traffic followed by no queries while the shared pending result request is stuck. Process restart did not resolve it.
- Added a 10-second SDK abort deadline to aggregate scans so a stalled query fails explicitly, clears the pending-results cache, and permits subsequent refresh attempts. No stored data is modified by this change. `npm run check` and all 9 tests passed.
- Recovery deployment `72104f62-1616-4abb-bc7b-488a15838cef` succeeded (Azure status 4, active and complete); `azd deploy --no-prompt` completed successfully in 4m12s.
- Post-cutover verification: three uncached API reads preserved the original round, open state, and all six counts. Subsequent browser API read returned HTTP 200 in 65ms. No production votes or resets were submitted.
- Public browser verification after cutover: all six results are 600x600, use Ignite, contain no headings/buttons, and show no errors; mobile audience renders all six myths and 18 answers without horizontal overflow or JavaScript errors.
- Public JPEG SHA-256 matches the deck image. Existing managed identity roles were rechecked: exact-table Storage Table Data Contributor and event-vault Key Vault Secrets User.
- Endpoint confirmed with `azd show`: https://app-poll-f4yiiqlof45yo.azurewebsites.net/.
