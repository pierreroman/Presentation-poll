<#
.SYNOPSIS
  Provisions Debunkers' Static Web App, shared Table Storage, and API settings,
  then wires the deployment token into the GitHub repo as an Actions secret.

.REQUIREMENTS
  Azure CLI (az login done) and GitHub CLI (gh auth login done).

.EXAMPLE
  ./infra/deploy.ps1 -ResourceGroup rg-presentation-poll
#>
[CmdletBinding()]
param(
    [string] $ResourceGroup = 'RG-Presentation-Poll',
    [string] $TenantId = '26f29274-e3a0-4e49-bc81-5fde2f2996b2',
    [string] $SubscriptionId = 'dfcf7181-677b-4513-932b-75a4642ab752',
    [string] $Location = 'eastus2',
    [string] $Name = 'presentation-poll',
    [string] $Repo = 'pierreroman/Presentation-poll',
    [string] $SecretName = 'AZURE_STATIC_WEB_APPS_API_TOKEN'
)

$ErrorActionPreference = 'Stop'

$account = az account show --subscription $SubscriptionId --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the Azure subscription. Run az login first.' }
if ($account.tenantId -ne $TenantId) { throw 'The subscription does not belong to the expected tenant.' }

$groupExists = az group exists --name $ResourceGroup --subscription $SubscriptionId --output tsv
if ($LASTEXITCODE -ne 0) { throw 'Unable to check the resource group.' }
if ($groupExists -eq 'false') {
    Write-Host "Creating resource group $ResourceGroup in $Location..."
    az group create --name $ResourceGroup --location $Location --subscription $SubscriptionId --output none
    if ($LASTEXITCODE -ne 0) { throw 'Resource group creation failed.' }
}

Write-Host "Deploying Static Web App $Name..."
$result = az deployment group create `
    --resource-group $ResourceGroup `
    --subscription $SubscriptionId `
    --template-file "$PSScriptRoot/main.bicep" `
    --parameters name=$Name location=$Location `
    --query properties.outputs --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Static Web App deployment failed.' }

Write-Host "Fetching deployment token..."
$token = az staticwebapp secrets list --name $Name --resource-group $ResourceGroup `
    --subscription $SubscriptionId `
    --query properties.apiKey --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
    throw 'Unable to retrieve the Static Web App deployment token.'
}

Write-Host "Storing token as GitHub secret $SecretName on $Repo..."
$token | gh secret set $SecretName --repo $Repo
if ($LASTEXITCODE -ne 0) { throw 'Unable to store the GitHub deployment secret.' }

Write-Host ""
Write-Host "Done. Site URL: $($result.url.value)"
Write-Host "Push to main (or run the workflow manually) to publish the app."
Write-Host "Before presenting, invite the approved Microsoft accounts with the presenter role"
Write-Host "in the Static Web App's Role management page. Sign-in alone does not grant access."
