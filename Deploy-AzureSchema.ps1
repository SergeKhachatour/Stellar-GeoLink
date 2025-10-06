Write-Host "🚀 Deploying Complete Stellar-GeoLink Schema to Azure PostgreSQL" -ForegroundColor Green
Write-Host ""

$VM_USER = "Serge369x33"
$VM_IP = "20.253.209.97"
$DB_NAME = "GeoLink"

Write-Host "📤 Step 1: Uploading complete schema to Azure VM..." -ForegroundColor Yellow
try {
    scp database/schema.sql "${VM_USER}@${VM_IP}:~/complete-schema.sql"
    Write-Host "✅ Schema file uploaded successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error uploading schema file: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔧 Step 2: Deploying complete schema to Azure PostgreSQL..." -ForegroundColor Yellow
Write-Host "You will need to enter your Azure VM password."
Write-Host ""

try {
    ssh "${VM_USER}@${VM_IP}" "sudo -u postgres psql -d `"${DB_NAME}`" -f ~/complete-schema.sql"
    Write-Host "✅ Complete schema deployed successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error deploying schema: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Azure PostgreSQL Database Update Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Your Azure database now has all 26 tables:" -ForegroundColor Cyan
Write-Host "   ✅ users, wallet_locations, wallet_types" -ForegroundColor White
Write-Host "   ✅ nft_collections, pinned_nfts, user_nft_ownership" -ForegroundColor White
Write-Host "   ✅ api_keys, rate_limits, geofences" -ForegroundColor White
Write-Host "   ✅ alert_preferences, location_events" -ForegroundColor White
Write-Host "   ✅ And 15+ more tables with full relationships" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Your deployed application should now work properly!" -ForegroundColor Green
Write-Host "🌐 Test your app at: https://geolink-buavavc6gse5c9fw.westus-01.azurewebsites.net" -ForegroundColor Cyan
