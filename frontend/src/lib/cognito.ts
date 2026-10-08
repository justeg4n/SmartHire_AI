import { Amplify } from 'aws-amplify'

const appSyncGraphqlUrl = import.meta.env.VITE_APPSYNC_GRAPHQL_URL
const s3Bucket = import.meta.env.VITE_AWS_S3_BUCKET || 'smarthire-raw-assets-dev'
const awsRegion = import.meta.env.VITE_AWS_REGION || 'ap-southeast-1'

if (!appSyncGraphqlUrl) {
  throw new Error('Missing required env var: VITE_APPSYNC_GRAPHQL_URL')
}

// Configure Amplify for Cognito, AppSync, and S3
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_AWS_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID || '',
      identityPoolId: import.meta.env.VITE_AWS_IDENTITY_POOL_ID || '',
      loginWith: {
        oauth: {
          domain:
            import.meta.env.VITE_COGNITO_DOMAIN ||
            'smarthire-auth-dev.auth.ap-southeast-1.amazoncognito.com',
          scopes: ['email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
          redirectSignIn: [window.location.origin + '/'],
          redirectSignOut: [window.location.origin + '/login'],
          responseType: 'code',
        },
      },
    },
  },
  API: {
    GraphQL: {
      endpoint: appSyncGraphqlUrl,
      region: awsRegion,
      defaultAuthMode: 'userPool',
    },
  },
  Storage: {
    S3: {
      bucket: s3Bucket,
      region: awsRegion,
    },
  },
})
