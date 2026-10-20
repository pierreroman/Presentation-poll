<#
.SYNOPSIS
  Provisions the Azure Static Web App for Live Session Poll and wires the
  deployment token into the GitHub repo as an Actions secret.

.REQUIREMENTS
  Azure CLI (az login done) and GitHub CLI (gh auth login done).

.EXAMPLE
  ./infra/deploy.ps1 -ResourceGroup rg-presentation-poll
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ResourceGroup,
    [string] $Location = 'eastus2',
    [string] $Name = 'presentation-poll',
    [string] $Repo = 'pierreroman/Presentation-poll',
    [string] $SecretName = 'AZURE_STATIC_WEB_APPS_API_TOKEN'
)

$ErrorActionPreference = 'Stop'

Write-Host "Creating resource group $ResourceGroup in $Location..."
az group create --name $ResourceGroup --location $Location --output none

Write-Host "Deploying Static Web App $Name..."
$result = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file "$PSScriptRoot/main.bicep" `
    --parameters name=$Name location=$Location `
    --query properties.outputs --output json | ConvertFrom-Json

Write-Host "Fetching deployment token..."
$token = az staticwebapp secrets list --name $Name --resource-group $ResourceGroup `
    --query properties.apiKey --output tsv

Write-Host "Storing token as GitHub secret $SecretName on $Repo..."
$token | gh secret set $SecretName --repo $Repo

Write-Host ""
Write-Host "Done. Site URL: $($result.url.value)"
Write-Host "Push to main (or run the workflow manually) to publish the app."
