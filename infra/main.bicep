targetScope = 'subscription'

@minLength(1)
@maxLength(40)
param environmentName string
param location string

@secure()
@minLength(24)
param adminToken string

@secure()
@minLength(32)
param cookieSecret string

var suffix = uniqueString(subscription().id, environmentName, location)
var tags = {
  'azd-env-name': environmentName
  application: 'sovereignty-poll'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-poll-${suffix}'
  location: location
  tags: tags
}

module resources './modules/resources.bicep' = {
  name: 'poll-resources'
  scope: resourceGroup
  params: {
    name: suffix
    location: location
    tags: tags
    adminToken: adminToken
    cookieSecret: cookieSecret
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
output AZURE_LOG_ANALYTICS_WORKSPACE_ID string = resources.outputs.workspaceId
output WEB_URL string = resources.outputs.webUrl
output PRESENTER_URL string = '${resources.outputs.webUrl}/presenter'
