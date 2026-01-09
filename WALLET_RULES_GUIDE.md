# Wallet-Based Contract Execution Rules Guide

## Overview

GeoLink allows you to set **contract execution rules** that automatically execute smart contract functions when wallets (including your own) enter, exit, or are within specific locations or geofences.

## Key Features

✅ **Update Pinned NFTs**: Change custom contract for existing pinned NFTs  
✅ **Set Rules for Your Wallet**: Create rules that trigger when YOUR connected wallet enters specific areas  
✅ **Set Rules for Any Wallet**: Create rules that trigger when ANY wallet enters specific areas  
✅ **Location-Based Triggers**: Set rules based on coordinates and radius  
✅ **Geofence-Based Triggers**: Set rules based on existing geofences  
✅ **Proximity Triggers**: Set rules based on proximity to a location  

---

## Use Cases

### 1. Your Wallet Triggers Contract Execution
**Example**: When your wallet enters a store location, automatically execute a payment contract.

```json
{
  "contract_id": 1,
  "rule_name": "Auto-pay at Coffee Shop",
  "rule_type": "location",
  "center_latitude": 34.0522,
  "center_longitude": -118.2437,
  "radius_meters": 50,
  "function_name": "execute_payment",
  "function_parameters": {
    "amount": "10",
    "recipient": "GCOFFEESHOP..."
  },
  "trigger_on": "enter",
  "target_wallet_public_key": "YOUR_WALLET_ADDRESS", // Your wallet
  "requires_confirmation": true
}
```

### 2. Any Wallet Triggers Contract Execution
**Example**: When any wallet enters a park, execute a reward contract.

```json
{
  "contract_id": 2,
  "rule_name": "Park Visit Reward",
  "rule_type": "geofence",
  "geofence_id": 5,
  "function_name": "mint_reward",
  "function_parameters": {
    "reward_type": "park_visit",
    "amount": "5"
  },
  "trigger_on": "enter",
  "target_wallet_public_key": null, // NULL = any wallet
  "auto_execute": true
}
```

### 3. Update Pinned NFT Contract
**Example**: Change the custom contract used by an existing pinned NFT.

```bash
PUT /api/nft/pinned/123
{
  "custom_contract_id": 5  // New contract to use
}
```

---

## API Endpoints

### Create Rule
```
POST /api/contracts/rules
```

**Body Parameters:**
- `contract_id` (required) - ID of the custom contract
- `rule_name` (required) - Friendly name for the rule
- `rule_type` (required) - `"location"`, `"geofence"`, or `"proximity"`
- `function_name` (required) - Contract function to execute
- `function_parameters` (optional) - JSON object with function parameters
- `trigger_on` (optional) - `"enter"`, `"exit"`, `"within"`, or `"proximity"` (default: `"enter"`)
- `target_wallet_public_key` (optional) - Your wallet address or NULL for any wallet
- `auto_execute` (optional) - Auto-execute without confirmation (default: `false`)
- `requires_confirmation` (optional) - Require user confirmation (default: `true`)

**For Location/Proximity Rules:**
- `center_latitude` (required)
- `center_longitude` (required)
- `radius_meters` (required)

**For Geofence Rules:**
- `geofence_id` (required)

**Optional Smart Wallet Settings:**
- `use_smart_wallet` (optional) - Use smart wallet for execution
- `payment_amount` (optional) - Payment amount in XLM
- `payment_asset_address` (optional) - Custom asset address

**Example Request:**
```bash
POST /api/contracts/rules
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "contract_id": 1,
  "rule_name": "My Wallet Auto-Payment",
  "rule_type": "location",
  "center_latitude": 34.0522,
  "center_longitude": -118.2437,
  "radius_meters": 50,
  "function_name": "execute_payment",
  "function_parameters": {
    "amount": "10",
    "recipient": "GSTORE..."
  },
  "trigger_on": "enter",
  "target_wallet_public_key": "YOUR_WALLET_ADDRESS",
  "requires_confirmation": true
}
```

### Get All Rules
```
GET /api/contracts/rules
GET /api/contracts/rules?contract_id=1&is_active=true
```

**Query Parameters:**
- `contract_id` (optional) - Filter by contract ID
- `is_active` (optional) - Filter by active status (`true`/`false`)

### Get Specific Rule
```
GET /api/contracts/rules/:id
```

### Update Rule
```
PUT /api/contracts/rules/:id
```

**Body Parameters:** (All optional - only include fields to update)
- `rule_name`
- `rule_type`
- `center_latitude`, `center_longitude`, `radius_meters`
- `geofence_id`
- `function_name`
- `function_parameters`
- `trigger_on`
- `auto_execute`
- `requires_confirmation`
- `target_wallet_public_key` - Update to target different wallet or NULL
- `use_smart_wallet`
- `payment_amount`
- `payment_asset_address`
- `is_active`

### Delete Rule
```
DELETE /api/contracts/rules/:id
```
(Soft delete - sets `is_active = false`)

---

## Update Pinned NFT Contract

You can update an existing pinned NFT to use a different custom contract:

```
PUT /api/nft/pinned/:id
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "custom_contract_id": 5  // New contract ID
}
```

**Note:** The contract must belong to you and be active.

---

## Rule Types

### 1. Location Rule
Triggers when wallet enters/exits/is within a circular area.

**Required Fields:**
- `rule_type`: `"location"`
- `center_latitude`
- `center_longitude`
- `radius_meters`

### 2. Geofence Rule
Triggers when wallet enters/exits/is within a geofence.

**Required Fields:**
- `rule_type`: `"geofence"`
- `geofence_id`

### 3. Proximity Rule
Triggers when wallet is within proximity of a location.

**Required Fields:**
- `rule_type`: `"proximity"`
- `center_latitude`
- `center_longitude`
- `radius_meters`

---

## Trigger Types

- `"enter"` - Triggers when wallet enters the area (default)
- `"exit"` - Triggers when wallet exits the area
- `"within"` - Triggers when wallet is within the area (continuous)
- `"proximity"` - Triggers when wallet is within proximity range

---

## Target Wallet Options

### Target Your Connected Wallet
Set `target_wallet_public_key` to your wallet address:
```json
{
  "target_wallet_public_key": "GDPMUX3X4AXOFWMWW74IOAM4ZM4VHOPJS6ZVXYNENSE447MQSXKJ5OGA"
}
```

### Target Any Wallet
Set `target_wallet_public_key` to `null`:
```json
{
  "target_wallet_public_key": null
}
```

---

## Security & Permissions

- ✅ All rules are user-specific (you can only see/manage your own rules)
- ✅ Contracts must belong to you
- ✅ Geofences must exist in the system
- ✅ Rules can be activated/deactivated without deletion
- ✅ Confirmation required by default (unless `auto_execute = true`)

---

## Example Workflow

1. **Create a Custom Contract**
   ```bash
   POST /api/contracts
   {
     "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q",
     "contract_name": "Payment Contract"
   }
   ```

2. **Discover Contract Functions**
   ```bash
   POST /api/contracts/discover
   {
     "contract_address": "CCU33UEBVE6EVQ5HPAGF55FYNFO3NILVUSLLG74QDJSCO5UTSKYC7P7Q"
   }
   ```

3. **Create Execution Rule for Your Wallet**
   ```bash
   POST /api/contracts/rules
   {
     "contract_id": 1,
     "rule_name": "Coffee Shop Auto-Pay",
     "rule_type": "location",
     "center_latitude": 34.0522,
     "center_longitude": -118.2437,
     "radius_meters": 50,
     "function_name": "execute_payment",
     "function_parameters": {"amount": "10"},
     "target_wallet_public_key": "YOUR_WALLET_ADDRESS",
     "requires_confirmation": true
   }
   ```

4. **Monitor Rule Execution**
   - Rule will trigger when your wallet location updates indicate entry into the area
   - If `requires_confirmation = true`, you'll be prompted to confirm
   - If `auto_execute = true`, execution happens automatically

---

## Dashboard Integration

Each role's dashboard should include:

1. **Contract Rules Section**
   - List of all rules
   - Create new rule button
   - Edit/Delete actions
   - Filter by contract, active status

2. **Rule Creation Dialog**
   - Contract selector
   - Rule type selector (location/geofence/proximity)
   - Location/geofence picker
   - Function name and parameters
   - Target wallet selector (your wallet or any wallet)
   - Confirmation settings

3. **Pinned NFT Management**
   - Update custom contract for existing NFTs
   - Contract selector in NFT edit dialog

---

**Ready to use!** 🚀

