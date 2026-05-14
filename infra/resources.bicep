param location string
param tags object
param resourceToken string
param imageName string

@secure()
param FOUNDRY_ENDPOINT string
param PROJECT_NAME string
param AGENT_APP_ORCHESTRATOR string
param AGENT_MODEL_ORCHESTRATOR string
param AGENT_APP_HR string
param AGENT_MODEL_HR string
param AGENT_APP_IT string
param AGENT_MODEL_IT string
param AGENT_APP_COMPLIANCE string
param AGENT_MODEL_COMPLIANCE string

@secure()
param AZURE_API_KEY string

@secure()
param AZURE_CLIENT_ID string
@secure()
param AZURE_CLIENT_SECRET string
param AZURE_TENANT_ID string

var acrName            = 'acr${resourceToken}'
var logAnalyticsName   = 'log-${resourceToken}'
var containerAppEnvName = 'cae-${resourceToken}'
var containerAppName   = 'ca-${resourceToken}'
var cosmosAccountName  = 'cosmos-${resourceToken}'

//  Container Registry 
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

//  Log Analytics 
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

//  Cosmos DB (serverless)  ticket storage 
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [
      { name: 'EnableServerless' }
    ]
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    enableFreeTier: false
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'ticketsdb'
  properties: {
    resource: { id: 'ticketsdb' }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'tickets'
  properties: {
    resource: {
      id: 'tickets'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
      }
    }
  }
}

//  Container Apps Environment 
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

//  Container App 
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.name
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password',          value: acr.listCredentials().passwords[0].value }
        { name: 'azure-client-secret',   value: AZURE_CLIENT_SECRET }
        { name: 'foundry-api-key',       value: AZURE_API_KEY }
        { name: 'cosmos-key',            value: cosmosAccount.listKeys().primaryMasterKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: imageName
          env: [
            { name: 'PORT',                     value: '3000' }
            { name: 'FOUNDRY_ENDPOINT',          value: FOUNDRY_ENDPOINT }
            { name: 'PROJECT_NAME',              value: PROJECT_NAME }
            { name: 'AGENT_APP_ORCHESTRATOR',    value: AGENT_APP_ORCHESTRATOR }
            { name: 'AGENT_MODEL_ORCHESTRATOR',  value: AGENT_MODEL_ORCHESTRATOR }
            { name: 'AGENT_APP_HR',              value: AGENT_APP_HR }
            { name: 'AGENT_MODEL_HR',            value: AGENT_MODEL_HR }
            { name: 'AGENT_APP_IT',              value: AGENT_APP_IT }
            { name: 'AGENT_MODEL_IT',            value: AGENT_MODEL_IT }
            { name: 'AGENT_APP_COMPLIANCE',      value: AGENT_APP_COMPLIANCE }
            { name: 'AGENT_MODEL_COMPLIANCE',    value: AGENT_MODEL_COMPLIANCE }
            { name: 'AZURE_CLIENT_ID',           value: AZURE_CLIENT_ID }
            { name: 'AZURE_TENANT_ID',           value: AZURE_TENANT_ID }
            { name: 'AZURE_CLIENT_SECRET',       secretRef: 'azure-client-secret' }
            { name: 'AZURE_API_KEY',             secretRef: 'foundry-api-key' }
            { name: 'COSMOS_ENDPOINT',           value: cosmosAccount.properties.documentEndpoint }
            { name: 'COSMOS_KEY',                secretRef: 'cosmos-key' }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
        }
      ]
    }
  }
}

// Cosmos DB Built-in Data Contributor role assignment for the Container App's
// managed identity. This grants read/write access via Entra ID in addition to
// the key-based auth already configured — ensures reads work even if key rotation occurs.
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002' // Built-in Data Contributor

resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, containerApp.id, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: containerApp.identity.principalId
    scope: cosmosAccount.id
  }
}

output acrLoginServer   string = acr.properties.loginServer
output acrName          string = acr.name
output cosmosEndpoint   string = cosmosAccount.properties.documentEndpoint
output cosmosAccountName string = cosmosAccount.name
output containerAppUrl  string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
