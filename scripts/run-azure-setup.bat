@echo off
echo ========================================
echo Stellar-GeoLink Azure Database Setup
echo ========================================
echo.

echo Step 1: Uploading schema file to Azure VM...
scp scripts/azure-schema-setup.sql Serge369x33@20.253.209.97:~/
if %errorlevel% neq 0 (
    echo Error uploading schema file. Please check your connection.
    pause
    exit /b 1
)

echo.
echo Step 2: Connecting to Azure VM to run database setup...
echo You will need to enter your password for the Azure VM.
echo.

ssh Serge369x33@20.253.209.97 "sudo -u postgres psql -d \"GeoLink\" -f ~/azure-schema-setup.sql"

echo.
echo ========================================
echo Database setup completed!
echo ========================================
echo.
echo Next steps:
echo 1. Test the database connection from your local environment
echo 2. Set up your Azure Web App
echo 3. Configure environment variables for production
echo.
pause
