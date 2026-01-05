# Receipegram - AWS Lightsail Deployment Guide

This guide explains how to deploy the Receipegram application to AWS Lightsail using GitHub Actions.

## Prerequisites

- AWS Account with Lightsail access
- GitHub repository with admin access
- AWS CLI installed locally (for initial setup)

## Architecture Overview

The deployment uses:
- **AWS Lightsail Container Service** - Hosts the containerized Node.js application
- **Amazon ECR Public** - Stores Docker images
- **GitHub Actions** - Automated CI/CD pipeline
- **AWS OIDC** - Secure authentication without long-term credentials

## Step 1: AWS Setup

### 1.1 Create IAM Role for GitHub OIDC

Run these commands in your terminal (make sure AWS CLI is configured):

```bash
# Create trust policy for GitHub OIDC
cat > github-oidc-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:naveenraj44125-creator/receipegram:*"
        }
      }
    }
  ]
}
EOF

# Create the IAM role
aws iam create-role \
  --role-name GitHubActions-ReceipegramDeploy \
  --assume-role-policy-document file://github-oidc-trust-policy.json

# Create and attach policy for Lightsail and ECR permissions
cat > deployment-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lightsail:*",
        "ecr-public:*",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name GitHubActions-ReceipegramDeploy \
  --policy-name DeploymentPolicy \
  --policy-document file://deployment-policy.json

# Get the role ARN (save this for GitHub secrets)
aws iam get-role \
  --role-name GitHubActions-ReceipegramDeploy \
  --query 'Role.Arn' \
  --output text
```

### 1.2 Create OIDC Provider (if not exists)

```bash
# Check if OIDC provider exists
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):oidc-provider/token.actions.githubusercontent.com \
  2>/dev/null || \
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  --thumbprint-list 1c58a3a8518e8759bf075b76b750d4f2df264fcd
```

## Step 2: GitHub Repository Setup

### 2.1 Configure Repository Secrets

Go to your GitHub repository settings and add these secrets:

1. **Settings** → **Secrets and variables** → **Actions**
2. Add the following **Repository Secret**:

| Secret Name | Value | Description |
|------------|-------|-------------|
| `AWS_ROLE_ARN` | `arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActions-ReceipegramDeploy` | IAM role ARN from Step 1.1 |

Replace `YOUR_ACCOUNT_ID` with your actual AWS account ID.

### 2.2 Environment Variables

The following environment variables are configured in the GitHub Action workflow:

- `AWS_REGION`: us-east-1 (configurable)
- `LIGHTSAIL_SERVICE_NAME`: receipegram
- `LIGHTSAIL_CONTAINER_NAME`: receipegram-container

## Step 3: Application Configuration

### 3.1 Update app.js (Root Server)

Ensure your root `app.js` serves both the API and static files:

```javascript
const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3001;

// Import and use server routes
const server = require('./server/server.js');

// Serve static files from client build
app.use(express.static(path.join(__dirname, 'public')));

// API routes (proxy to server)
app.use('/api', (req, res, next) => {
  // Forward to server
  req.url = '/api' + req.url;
  server(req, res, next);
});

// Handle React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Receipegram server running on port ${PORT}`);
});
```

### 3.2 Environment Variables for Production

The deployment automatically sets:
- `NODE_ENV=production`
- `PORT=3001`

Add any additional environment variables needed for your application to the GitHub Action workflow.

## Step 4: Deployment Process

### 4.1 Automatic Deployment

The deployment is triggered automatically when:
- Code is pushed to `main` or `master` branch
- A pull request is opened/updated
- Manual trigger via GitHub Actions tab

### 4.2 Manual Deployment

To trigger a manual deployment:
1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Deploy to AWS Lightsail** workflow
4. Click **Run workflow**

## Step 5: Monitoring and Management

### 5.1 Check Deployment Status

Monitor deployment progress:
- GitHub Actions logs
- AWS Lightsail Console → Container services → receipegram

### 5.2 Access Your Application

After successful deployment:
- The application URL will be displayed in GitHub Actions logs
- Format: `https://receipegram.service.us-east-1.amazonaws.com`

### 5.3 Logs and Debugging

View application logs:
```bash
# Using AWS CLI
aws lightsail get-container-log \
  --service-name receipegram \
  --container-name receipegram-container \
  --region us-east-1
```

## Step 6: Cost Management

### Expected Costs (Monthly)
- **Lightsail Container Service (Small)**: ~$7-15
- **ECR Public**: Free tier (500MB)
- **Data Transfer**: Minimal for small apps

### Cost Optimization
- Monitor usage in AWS Console
- Scale down if needed: `power: nano` for development
- Use GitHub Environments for staging/production separation

## Troubleshooting

### Common Issues

1. **OIDC Authentication Failed**
   - Verify IAM role ARN in GitHub secrets
   - Check trust policy includes correct repository

2. **Container Build Failed**
   - Check package.json scripts
   - Verify all dependencies are listed

3. **Health Check Failed**
   - Ensure `/api/health` endpoint returns 200
   - Check application starts on correct port (3001)

4. **Deployment Timeout**
   - Check container logs in Lightsail console
   - Verify Docker image builds successfully

### Debug Commands

```bash
# Check container service status
aws lightsail get-container-services --service-name receipegram --region us-east-1

# View container logs
aws lightsail get-container-log --service-name receipegram --container-name receipegram-container --region us-east-1

# Check deployments
aws lightsail get-container-service-deployments --service-name receipegram --region us-east-1
```

## Security Best Practices

1. **IAM Permissions**: Use least privilege principle
2. **Secrets Management**: Never commit secrets to repository
3. **HTTPS**: Lightsail provides HTTPS automatically
4. **Environment Variables**: Use GitHub secrets for sensitive data

## Next Steps

1. Set up custom domain (optional)
2. Configure SSL certificate (Lightsail provides free certs)
3. Set up monitoring and alerts
4. Implement database backup strategy (if using external DB)

## Support

For issues related to:
- **GitHub Actions**: Check workflow logs and GitHub documentation
- **AWS Lightsail**: AWS Support or documentation
- **Application Issues**: Check application logs via Lightsail console
