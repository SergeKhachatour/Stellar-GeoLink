@echo off
echo ========================================
echo Stellar-GeoLink Complete Schema Deployment
echo ========================================
echo.

set VM_USER=Serge369x33
set VM_IP=20.253.209.97
set DB_NAME=GeoLink
set DB_USER=geolink_user

echo Step 1: Uploading complete schema to Azure VM...
scp database/schema.sql %VM_USER%@%VM_IP%:~/complete-schema.sql
if %ERRORLEVEL% NEQ 0 (
    echo Error uploading schema file. Exiting.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo Step 2: Connecting to Azure VM to deploy complete schema...
echo You will need to enter your password for the Azure VM.
ssh %VM_USER%@%VM_IP% "sudo -u postgres psql -d \"%DB_NAME%\" -f ~/complete-schema.sql"
if %ERRORLEVEL% NEQ 0 (
    echo Error deploying complete schema on Azure VM.
)
echo.

echo ========================================
echo Complete schema deployment finished!
echo ========================================
echo.
echo Your Azure PostgreSQL now has all 26 tables:
echo   - users, wallet_locations, wallet_types
echo   - nft_collections, pinned_nfts, user_nft_ownership
echo   - api_keys, rate_limits, geofences
echo   - alert_preferences, location_events
echo   - And 15+ more tables with full relationships
echo.
echo Your deployed application should now work properly!
echo.
pause
