// Static Web Apps manages the HTTP Functions API and built-in Microsoft sign-in.

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

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'poll${uniqueString(resourceGroup().id, name)}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    // SWA managed Functions do not support managed identity.
    allowSharedKeyAccess: true
  }
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource sessions 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tables
  name: 'PollSessions'
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

resource settings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    POLL_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
  }
}

output name string = swa.name
output url string = 'https://${swa.properties.defaultHostname}'
output storageAccountName string = storage.name
