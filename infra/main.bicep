// Azure Static Web App that hosts the Live Session Poll front end.
// Free tier: no backend, no custom auth — the app is a single static page.

@description('Name of the Static Web App.')
param name string = 'presentation-poll'

@description('Static Web Apps is only offered in a few regions.')
@allowed([
  'eastus2'
  'centralus'
  'westus2'
  'westeurope'
  'eastasia'
])
param location string = 'eastus2'

@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

param tags object = {
  workload: 'presentation-poll'
}

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    // Deployments come from the GitHub Actions workflow using the deployment token,
    // so no repository link is configured here.
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

output name string = swa.name
output url string = 'https://${swa.properties.defaultHostname}'
