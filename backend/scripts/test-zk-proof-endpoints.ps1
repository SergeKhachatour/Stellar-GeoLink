# Test ZK Proof Endpoints
# This script tests all ZK proof endpoints

$baseUrl = "http://localhost:4000"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "🧪 Testing ZK Proof Endpoints" -ForegroundColor Cyan
Write-Host ""

# Test 1: Store ZK Proof
Write-Host "Test 1: Store ZK Proof" -ForegroundColor Yellow
$storeBody = @{
    proofHash = "test-hash-12345678901234567890123456789012"
    publicKey = "GANOB3BOX23UYI5BBT4QAGY2D2BLB7INGMEVMZJ57O2QCEVQGJHBHDNO"
    challenge = "test-challenge-123"
    timestamp = [int64]1735000000000
    nonce = "test-nonce-456"
} | ConvertTo-Json

try {
    $storeResponse = Invoke-RestMethod -Uri "$baseUrl/api/zk-proof/store" -Method Post -Headers $headers -Body $storeBody
    Write-Host "✅ Store successful:" -ForegroundColor Green
    $storeResponse | ConvertTo-Json
    $proofHash = "test-hash-12345678901234567890123456789012"
    $expiresAt = $storeResponse.expiresAt
} catch {
    Write-Host "❌ Store failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
    exit 1
}

Write-Host ""
Start-Sleep -Seconds 1

# Test 2: Check Proof Status
Write-Host "Test 2: Check Proof Status" -ForegroundColor Yellow
try {
    $statusResponse = Invoke-RestMethod -Uri "$baseUrl/api/zk-proof/status/$proofHash" -Method Get
    Write-Host "✅ Status check successful:" -ForegroundColor Green
    $statusResponse | ConvertTo-Json
} catch {
    Write-Host "❌ Status check failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

Write-Host ""
Start-Sleep -Seconds 1

# Test 3: Verify ZK Proof
Write-Host "Test 3: Verify ZK Proof" -ForegroundColor Yellow
$transactionData = @{
    source = "GANOB3BOX23UYI5BBT4QAGY2D2BLB7INGMEVMZJ57O2QCEVQGJHBHDNO"
    destination = "GD2RR33QESEPOALSU3JGCMJ45FLFJJR5P2PIOVDIOMOKXFZ3VWJSP3VM"
    amount = "11"
    asset = "XLM"
    memo = "xxx"
    timestamp = 1735000000000
} | ConvertTo-Json -Compress

$verifyBody = @{
    proofHash = $proofHash
    challenge = "test-challenge-123"
    nonce = "test-nonce-456"
    transactionData = $transactionData
} | ConvertTo-Json

try {
    $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/zk-proof/verify" -Method Post -Headers $headers -Body $verifyBody
    Write-Host "✅ Verify successful:" -ForegroundColor Green
    $verifyResponse | ConvertTo-Json
} catch {
    Write-Host "❌ Verify failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

Write-Host ""
Start-Sleep -Seconds 1

# Test 4: Check Status After Verification (should not exist)
Write-Host "Test 4: Check Status After Verification (should not exist)" -ForegroundColor Yellow
try {
    $statusResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/zk-proof/status/$proofHash" -Method Get
    Write-Host "✅ Status check successful:" -ForegroundColor Green
    $statusResponse2 | ConvertTo-Json
    if ($statusResponse2.exists -eq $false) {
        Write-Host "✅ Proof correctly deleted after verification" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Proof still exists after verification (should be deleted)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Status check failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

Write-Host ""
Write-Host "✅ All tests completed!" -ForegroundColor Green


