#!/bin/bash

# Receipegram AWS Lightsail Deployment Setup Script
# This script sets up the necessary AWS resources for GitHub Actions deployment

set -e

echo "🚀 Setting up AWS resources for Receipegram Lightsail deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ROLE_NAME="GitHubActions-ReceipegramDeploy"
GITHUB_REPO="naveenraj44125-creator/receipegram"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed. Please install it first.${NC}"
    echo "Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not configured. Please run 'aws configure' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS CLI is properly configured${NC}"

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${YELLOW}📋 AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"

# Step 1: Create OIDC Provider (if it doesn't exist)
echo -e "\n${YELLOW}🔧 Step 1: Setting up GitHub OIDC Provider...${NC}"

OIDC_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" &> /dev/null; then
    echo -e "${GREEN}✅ GitHub OIDC Provider already exists${NC}"
else
    echo "Creating GitHub OIDC Provider..."
    aws iam create-open-id-connect-provider \
        --url https://token.actions.githubusercontent.com \
        --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
        --thumbprint-list 1c58a3a8518e8759bf075b76b750d4f2df264fcd
    echo -e "${GREEN}✅ GitHub OIDC Provider created${NC}"
fi

# Step 2: Create trust policy
echo -e "\n${YELLOW}🔧 Step 2: Creating IAM trust policy...${NC}"

cat > /tmp/github-oidc-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF

# Step 3: Create or update IAM role
echo -e "\n${YELLOW}🔧 Step 3: Creating IAM role...${NC}"

if aws iam get-role --role-name "$ROLE_NAME" &> /dev/null; then
    echo "Updating existing IAM role..."
    aws iam update-assume-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-document file:///tmp/github-oidc-trust-policy.json
    echo -e "${GREEN}✅ IAM role updated${NC}"
else
    echo "Creating new IAM role..."
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file:///tmp/github-oidc-trust-policy.json \
        --description "Role for GitHub Actions to deploy Receipegram to Lightsail"
    echo -e "${GREEN}✅ IAM role created${NC}"
fi

# Step 4: Create and attach deployment policy
echo -e "\n${YELLOW}🔧 Step 4: Attaching deployment permissions...${NC}"

cat > /tmp/deployment-policy.json << EOF
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
    --role-name "$ROLE_NAME" \
    --policy-name "DeploymentPolicy" \
    --policy-document file:///tmp/deployment-policy.json

echo -e "${GREEN}✅ Deployment policy attached${NC}"

# Step 5: Get role ARN
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

# Clean up temp files
rm -f /tmp/github-oidc-trust-policy.json /tmp/deployment-policy.json

# Final instructions
echo -e "\n${GREEN}🎉 AWS setup complete!${NC}"
echo -e "\n${YELLOW}📋 Next Steps:${NC}"
echo "1. Add the following secret to your GitHub repository:"
echo "   - Go to: https://github.com/${GITHUB_REPO}/settings/secrets/actions"
echo "   - Click 'New repository secret'"
echo "   - Name: AWS_ROLE_ARN"
echo -e "   - Value: ${GREEN}${ROLE_ARN}${NC}"
echo ""
echo "2. Push your code to trigger the deployment workflow"
echo "3. Monitor the deployment in GitHub Actions"
echo ""
echo -e "${YELLOW}📊 Expected monthly costs:${NC}"
echo "   - Lightsail Container Service (Small): ~$7-15"
echo "   - ECR Public: Free (500MB included)"
echo ""
echo -e "${GREEN}🔗 Useful links:${NC}"
echo "   - GitHub Repository: https://github.com/${GITHUB_REPO}"
echo "   - GitHub Actions: https://github.com/${GITHUB_REPO}/actions"
echo "   - AWS Lightsail Console: https://lightsail.aws.amazon.com/ls/webapp/home/containers"
echo ""
echo -e "${GREEN}✨ Happy deploying!${NC}"
