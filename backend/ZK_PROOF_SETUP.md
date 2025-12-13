# ZK Proof Storage Setup Guide

## Overview

GeoLink provides temporary storage for Zero-Knowledge (ZK) proofs used by XYZ-Wallet for smart wallet transaction verification. Proofs are stored with a 5-minute TTL and automatically cleaned up.

## Database Setup

1. **Run the database migration**:
   ```bash
   psql -h <host> -U <user> -d <database> -f backend/scripts/create-zk-proofs-table.sql
   ```

   Or via pgAdmin:
   - Open the SQL script: `backend/scripts/create-zk-proofs-table.sql`
   - Execute it on your GeoLink database

2. **Verify table creation**:
   ```sql
   SELECT * FROM zk_proofs LIMIT 1;
   ```

## API Endpoints

### 1. Store ZK Proof
**POST** `/api/zk-proof/store`

Stores a ZK proof with 5-minute expiration.

**Request**:
```json
{
  "proofHash": "1da63a8322d4c60d3c8fda3fffc8c1caa83ab82d7d016f47c804ee913fbf2171",
  "publicKey": "GANOB3BOX23UYI5BBT4QAGY2D2BLB7INGMEVMZJ57O2QCEVQGJHBHDNO",
  "challenge": "7cf6f1ee0b6285ad...",
  "timestamp": 1764384896523,
  "nonce": "random-nonce-value"
}
```

**Response**:
```json
{
  "success": true,
  "message": "ZK proof stored successfully",
  "expiresAt": 1764385196523
}
```

### 2. Verify ZK Proof
**POST** `/api/zk-proof/verify`

Verifies a ZK proof and deletes it after successful verification (one-time use).

**Request**:
```json
{
  "proofHash": "1da63a8322d4c60d3c8fda3fffc8c1caa83ab82d7d016f47c804ee913fbf2171",
  "challenge": "7cf6f1ee0b6285ad...",
  "nonce": "random-nonce-value",
  "transactionData": "{\"source\":\"GANOB3BOX23UYI5BBT4QAGY2D2BLB7INGMEVMZJ57O2QCEVQGJHBHDNO\",\"destination\":\"GD2RR33QESEPOALSU3JGCMJ45FLFJJR5P2PIOVDIOMOKXFZ3VWJSP3VM\",\"amount\":\"11\",\"asset\":\"XLM\",\"memo\":\"xxx\",\"timestamp\":1764384896523}"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "verified": true,
  "message": "ZK proof verified successfully"
}
```

**Response (Failure)**:
```json
{
  "success": false,
  "verified": false,
  "error": "ZK proof not found or expired",
  "errorCode": "PROOF_NOT_FOUND"
}
```

### 3. Get Proof Status
**GET** `/api/zk-proof/status/:proofHash`

Check if a proof exists and its expiration status (without returning proof data).

**Response**:
```json
{
  "success": true,
  "exists": true,
  "expiresAt": 1764385196523,
  "isExpired": false
}
```

## Error Codes

- `PROOF_NOT_FOUND`: Proof hash doesn't exist
- `PROOF_EXPIRED`: Proof has expired
- `CHALLENGE_MISMATCH`: Challenge doesn't match stored value
- `NONCE_MISMATCH`: Nonce doesn't match stored value
- `PUBLIC_KEY_MISMATCH`: Public key doesn't match transaction source
- `MISSING_FIELDS`: Required fields are missing
- `INVALID_TRANSACTION_DATA`: Transaction data is not valid JSON

## Automatic Cleanup

- Expired proofs are automatically cleaned up:
  - On server startup
  - Every 2 minutes via scheduled cleanup
- Manual cleanup can be triggered by running:
  ```sql
  DELETE FROM zk_proofs WHERE expires_at < CURRENT_TIMESTAMP;
  ```

## Security Features

1. **5-minute TTL**: All proofs expire after 5 minutes
2. **One-time use**: Proofs are deleted immediately after verification
3. **Input validation**: All fields are validated before storage
4. **No sensitive data**: Only verification data is stored, never private keys
5. **Hash-based lookup**: Uses cryptographic hash as identifier

## Testing

### Test with cURL

**Store proof**:
```bash
curl -X POST http://localhost:4000/api/zk-proof/store \
  -H "Content-Type: application/json" \
  -d '{
    "proofHash": "test-hash-123",
    "publicKey": "GANOB3BOX23UYI5BBT4QAGY2D2BLB7INGMEVMZJ57O2QCEVQGJHBHDNO",
    "challenge": "test-challenge",
    "timestamp": 1764384896523,
    "nonce": "test-nonce"
  }'
```

**Verify proof**:
```bash
curl -X POST http://localhost:4000/api/zk-proof/verify \
  -H "Content-Type: application/json" \
  -d '{
    "proofHash": "test-hash-123",
    "challenge": "test-challenge",
    "nonce": "test-nonce",
    "transactionData": "{\"source\":\"GANOB3BOX23UYI5BBT4QAGY2D2BLB7INGMEVMZJ57O2QCEVQGJHBHDNO\",\"destination\":\"GD2RR33QESEPOALSU3JGCMJ45FLFJJR5P2PIOVDIOMOKXFZ3VWJSP3VM\",\"amount\":\"11\",\"asset\":\"XLM\"}"
  }'
```

**Check status**:
```bash
curl http://localhost:4000/api/zk-proof/status/test-hash-123
```

## Integration with XYZ-Wallet

XYZ-Wallet should configure the GeoLink base URL:

```bash
# .env file in XYZ-Wallet backend
GEOLINK_BASE_URL=http://localhost:4000  # Local development
# GEOLINK_BASE_URL=https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net  # Production
```

Then use the endpoints as shown in the XYZ-Wallet integration documentation.

## Monitoring

Check proof storage usage:
```sql
SELECT COUNT(*) as total_proofs, 
       COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) as active_proofs,
       COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired_proofs
FROM zk_proofs;
```

## Notes

- Proofs are stored globally (not per-wallet)
- No authentication required (proofs are identified by hash only)
- Rate limiting can be added if needed via the existing rate limiter middleware
- All timestamps are stored as Unix timestamps (milliseconds)

