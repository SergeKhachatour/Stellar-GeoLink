# AI Integration Guide - Stellar GeoLink

## Overview

This document describes the Azure OpenAI integration with Stellar blockchain operations in the GeoLink application. The AI assistant (TML - TextMeLater) can now perform Stellar operations through natural language conversations.

## What Was Implemented

### Backend Changes

1. **Stellar Operations Service** (`backend/services/stellarOperations.js`)
   - All Stellar operations from Stellar-NodeJS-Backend copied and integrated
   - Functions: createAccount, issueAsset, createTrustline, transferAsset, showBalance, etc.
   - Soroban smart contract support

2. **Azure OpenAI Service** (`backend/services/azureOpenAIService.js`)
   - Azure OpenAI client initialization
   - Function calling/tools definition for all Stellar operations
   - Tool execution handler
   - Chat completion processing

3. **Stellar API Routes** (`backend/routes/stellar.js`)
   - Added all Stellar operation endpoints:
     - POST `/api/stellar/create-account`
     - POST `/api/stellar/issue-asset`
     - POST `/api/stellar/create-trustline`
     - POST `/api/stellar/transfer-asset`
     - POST `/api/stellar/show-balance`
     - POST `/api/stellar/show-trustlines`
     - POST `/api/stellar/show-issued-assets`
     - POST `/api/stellar/setup-asset`
     - POST `/api/stellar/test-asset-creation`
     - POST `/api/stellar/call-contract-method`

4. **AI Chat Routes** (`backend/routes/ai.js`)
   - POST `/api/ai/chat` - Authenticated chat (for logged-in users)
   - POST `/api/ai/chat/public` - Public chat (for home page visitors)

### Frontend Changes

1. **AI Chat Component** (`frontend/src/components/AI/AIChat.js`)
   - Reusable chat interface component
   - Supports both public and authenticated modes
   - Collapsible chat window
   - Message history
   - Loading states

2. **Home Page Integration** (`frontend/src/pages/Home.js`)
   - Added AI chat component for public access

### Dependencies Added

- `@stellar/stellar-sdk`: ^14.4.2
- `openai`: ^4.20.0

## Environment Variables Required

Add these to your `.env` file in the backend directory:

```bash
# Azure OpenAI Configuration
AZURE_OPENAI_RESOURCE=8063b3a2-c0f6-4e47-b1ae-fc051018de2e
AZURE_OPENAI_MODEL=TextMelater
AZURE_OPENAI_KEY=your_azure_openai_key_here
AZURE_OPENAI_MODEL_NAME=gpt-4o
AZURE_OPENAI_TEMPERATURE=0
AZURE_OPENAI_TOP_P=1.0
AZURE_OPENAI_MAX_TOKENS=1000
AZURE_OPENAI_STOP_SEQUENCE=
AZURE_OPENAI_PREVIEW_API_VERSION=2024-08-01-preview
AZURE_OPENAI_ENDPOINT=https://tml.openai.azure.com
AZURE_OPENAI_SYSTEM_MESSAGE=You are an AI assistant developed by Serge Khachatour that helps people find information and perform Stellar blockchain operations. Your personal name is TML. It stands for TextMeLater. Before you start, please ask me any questions that you need answered to help me best solve my problem.
AZURE_OPENAI_TOOL_CHOICE=auto

# Stellar Network Configuration
STELLAR_SERVER_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK=TESTNET
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org:443
```

## Installation Steps

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Set Environment Variables**
   - Copy the environment variables above to your `.env` file
   - Update values as needed

3. **Restart Backend Server**
   ```bash
   npm run dev
   ```

4. **Frontend (if needed)**
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Usage

### Public Access (Home Page)
- Visit the home page
- Click the AI chat icon in the bottom right
- Start chatting with TML about Stellar operations

### Authenticated Access (Dashboards)
- Log in to your account
- AI chat is available in all dashboards
- Full access to all Stellar operations

## Available AI Functions

The AI can perform these Stellar operations:

1. **Create Account** - Generate new Stellar accounts
2. **Issue Asset** - Create and issue new assets
3. **Create Trustline** - Set up trustlines for assets
4. **Show Balance** - Check account balances
5. **Transfer Asset** - Send assets between accounts
6. **Setup Asset** - Complete asset setup and issuance
7. **Test Asset Creation** - Test asset creation functionality
8. **Show Trustlines** - List all trustlines for an account
9. **Show Issued Assets** - List assets issued by an account
10. **Call Contract Method** - Execute Soroban smart contract methods

## Example Conversations

**User:** "Create a new Stellar account"
**AI:** *Creates account and returns public key and secret*

**User:** "Show the balance for account GABC123..."
**AI:** *Calls showBalance function and displays all balances*

**User:** "Help me issue an asset called MYTOKEN"
**AI:** *Guides through asset issuance process*

## Security Notes

- All Stellar operation endpoints require authentication (`authenticateUser` middleware)
- Public chat endpoint (`/api/ai/chat/public`) is available but has limited functionality
- Secret keys should never be logged or exposed
- All operations use Stellar testnet by default

## Troubleshooting

### AI Not Responding
- Check Azure OpenAI credentials in `.env`
- Verify `AZURE_OPENAI_ENDPOINT` is correct
- Check backend logs for errors

### Stellar Operations Failing
- Verify `STELLAR_SERVER_URL` is accessible
- Check network configuration (TESTNET vs MAINNET)
- Ensure account has sufficient XLM for transactions

### Frontend Chat Not Loading
- Check browser console for errors
- Verify API endpoint is correct
- Check CORS configuration

## Next Steps

To add AI chat to dashboards:

1. Import the component:
   ```javascript
   import AIChat from '../components/AI/AIChat';
   ```

2. Add to dashboard:
   ```javascript
   <AIChat isPublic={false} initialOpen={false} />
   ```

## Support

For issues or questions, check:
- Backend logs: `backend/logs/`
- Browser console for frontend errors
- Azure OpenAI service status

