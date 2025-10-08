# 🛡️ GitHub Branch Protection Rules Setup

## Overview
This guide will help you set up branch protection rules for your `main` branch to prevent accidental changes and ensure code quality.

## Step-by-Step Setup

### 1. Go to Repository Settings
1. Navigate to: https://github.com/SergeKhachatour/Stellar-GeoLink
2. Click **"Settings"** (top menu bar)
3. Click **"Branches"** (left sidebar)

### 2. Add Branch Protection Rule
1. Click **"Add rule"** or **"Add branch protection rule"**
2. In **"Branch name pattern"**, enter: `main`
3. Configure the following settings:

### 3. Recommended Settings

#### ✅ **Require a pull request before merging**
- **Require approvals**: 1
- **Dismiss stale PR approvals when new commits are pushed**: ✅
- **Require review from code owners**: ✅ (if you have CODEOWNERS file)

#### ✅ **Require status checks to pass before merging**
- **Require branches to be up to date before merging**: ✅
- **Status checks that are required**: 
  - `build-and-deploy` (your GitHub Actions workflow)

#### ✅ **Require conversation resolution before merging**
- **Require conversation resolution before merging**: ✅

#### ✅ **Require signed commits**
- **Require signed commits**: ✅ (optional, but recommended)

#### ✅ **Require linear history**
- **Require linear history**: ✅ (prevents merge commits)

#### ✅ **Restrict pushes that create files**
- **Restrict pushes that create files**: ✅ (prevents large file uploads)

#### ✅ **Include administrators**
- **Include administrators**: ✅ (applies to you too!)

#### ✅ **Allow force pushes**
- **Allow force pushes**: ❌ (NEVER allow this on main)

#### ✅ **Allow deletions**
- **Allow deletions**: ❌ (NEVER allow this on main)

## Benefits for Your Project

### 🚀 **Deployment Safety**
- **Prevents broken deployments**: No code can be merged if GitHub Actions fail
- **Ensures working builds**: All changes must pass CI/CD checks
- **Protects production**: Main branch is always deployable

### 🔒 **Security**
- **Prevents accidental commits**: All changes must go through PRs
- **Requires review**: Someone else must approve your changes
- **Blocks force pushes**: No one can rewrite history

### 📈 **Code Quality**
- **Enforces testing**: All tests must pass before merging
- **Requires review**: Code is reviewed before going to production
- **Maintains history**: Linear history is easier to debug

### 👥 **Team Collaboration**
- **Prevents conflicts**: No direct pushes to main
- **Enables discussion**: PRs allow for code discussion
- **Tracks changes**: All changes are tracked through PRs

## What This Means for You

### ✅ **What You Can Still Do**
- Create feature branches
- Push to feature branches
- Create Pull Requests
- Merge approved PRs
- Deploy from main branch

### ❌ **What You Can't Do Anymore**
- Push directly to main
- Force push to main
- Delete the main branch
- Merge without approval
- Merge if tests fail

## Emergency Override

If you ever need to bypass these rules in an emergency:

1. **Temporarily disable the rule**:
   - Go to Settings → Branches
   - Edit the rule
   - Uncheck "Include administrators"
   - Make your emergency changes
   - Re-enable the rule

2. **Or use GitHub CLI** (if you have admin access):
   ```bash
   gh api repos/SergeKhachatour/Stellar-GeoLink/branches/main/protection --method DELETE
   ```

## Best Practices

### 🌿 **Workflow**
1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Make changes**: Develop your feature
3. **Push branch**: `git push origin feature/your-feature`
4. **Create PR**: Use GitHub web interface
5. **Get review**: Wait for approval
6. **Merge**: Once approved and tests pass

### 📝 **PR Guidelines**
- **Clear titles**: Describe what the PR does
- **Detailed descriptions**: Explain changes and why
- **Link issues**: Reference related issues
- **Test thoroughly**: Ensure all tests pass

## Monitoring

### 📊 **Check Protection Status**
- Go to your repository → Settings → Branches
- View the protection rule status
- See if any rules are being violated

### 🔍 **View Protection History**
- Go to repository → Insights → Network
- See the commit history and branch structure
- Identify any protection rule violations

## Troubleshooting

### ❌ **If You Can't Push**
- Check if you're trying to push directly to main
- Create a feature branch instead
- Use Pull Requests for all changes

### ❌ **If PR Can't Be Merged**
- Check if all required checks are passing
- Ensure you have the required number of approvals
- Make sure there are no merge conflicts

### ❌ **If Tests Are Failing**
- Fix the failing tests locally
- Push the fixes to your branch
- Wait for the checks to pass

## Summary

Branch protection rules will:
- ✅ **Protect your production code**
- ✅ **Ensure code quality**
- ✅ **Prevent accidental changes**
- ✅ **Require proper review process**
- ✅ **Maintain deployment safety**

This is especially important for a production application like yours that's deployed to Azure!
