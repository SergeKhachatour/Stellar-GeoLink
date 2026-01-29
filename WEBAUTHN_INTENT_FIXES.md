# WebAuthn/Intent System Fixes

## Issues Identified

1. ✅ **Fixed**: React DOM nesting warning in PasskeyManager
2. ✅ **Fixed**: Intent vs AuthProof separation - Intent no longer includes `signature_payload` or `webauthn_*` fields
3. ✅ **Fixed**: Placeholders removed from Intent - destination is resolved before computing intentBytes
4. ✅ **Fixed**: WebAuthn fields filtered from Intent args - they're now part of AuthProof only
5. ✅ **Fixed**: Introspection types preserved - args use actual contract types (Address/I128/Bytes/String)
6. ✅ **Fixed**: ruleBinding included in intentBytes - it's part of canonical Intent
7. ✅ **Fixed**: Execution flow - updated to use Intent bytes for WebAuthn challenge instead of JSON signaturePayload
8. ✅ **Verified**: Backend execute_payment correctly builds callArgs as (action args) + (signature_payload, sig, authData, clientData)
9. ⚠️ **Remaining**: WebAuthn fields mapping - need to verify `webauthn_authenticator_data` is actual bytes (not Stellar address) in all UI/data flows

## Implementation Plan

### Phase 1: Fix Intent Structure
- Remove `signature_payload` and `webauthn_*` fields from Intent object
- Ensure Intent only contains: `{v, network, contractId, function, signer, args(final), ruleBinding, nonce, iat, exp}`
- Create separate AuthProof object: `{signature_payload, webauthn_signature, webauthn_client_data_json, webauthn_authenticator_data}`

### Phase 2: Fix WebAuthn Fields Mapping
- Audit all UI bindings and data plumbing
- Ensure `webauthn_authenticator_data` is always base64/base64url encoded bytes
- Never use `signer_address` as `webauthn_authenticator_data`

### Phase 3: Fix Placeholder Resolution
- Resolve destination before creating Intent
- Remove all "[Will be system-generated later]" fields from Intent
- Finalize all args before encoding intentBytes

### Phase 4: Fix Type Encoding
- Use introspection types (Address/I128/Bytes/String) for deterministic encoding
- Ensure same typed values used in intentBytes are used for ScVal args

### Phase 5: Fix Contract Execution
- Build callArgs correctly: (action args) + (proof fields)
- Only sign intentBytes, never "sign the proof fields"
