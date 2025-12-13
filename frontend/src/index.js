import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/stellar-brand.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// CRITICAL: Version check - runs immediately after imports
// BUILD_TIMESTAMP: 2025-01-13T18:20:00Z - Force new hash - DO NOT REMOVE THIS COMMENT
const APP_VERSION = 'v2.0.9-2025-01-13-18:20-FORCE-REBUILD-1736791200000';
if (typeof window !== 'undefined') {
    window.APP_VERSION = APP_VERSION;
    console.log(`%c🚀 APP STARTING - Version: ${APP_VERSION}`, 'color: #00ff00; font-size: 20px; font-weight: bold; background: #000; padding: 15px; border: 3px solid #00ff00;');
    console.log(`%c✅ If you see this message, the NEW code is running!`, 'color: #00ff00; font-size: 16px; font-weight: bold;');
    
    // Check if old code is trying to run - intercept console.log to detect old messages
    const originalConsoleLog = console.log;
    console.log = function(...args) {
        const message = args.join(' ');
        // Detect old log message
        if (message.includes('🔧 API Base URL configured as') || message.includes('API Base URL configured as: http://localhost:4000')) {
            console.error('%c❌ OLD CACHED CODE DETECTED!', 'color: #ff0000; font-size: 24px; font-weight: bold; background: #000; padding: 20px; border: 5px solid #ff0000;');
            console.error('%cThe browser is loading an OLD cached JavaScript bundle!', 'color: #ff0000; font-size: 18px; font-weight: bold;');
            console.error('%cPlease: 1) Clear browser cache completely 2) Use incognito window 3) Check Network tab for which JS file is loading', 'color: #ff0000; font-size: 16px;');
            // Try to force reload with cache bust
            if (!sessionStorage.getItem('cache-bust-attempted')) {
                sessionStorage.setItem('cache-bust-attempted', 'true');
                console.warn('Attempting to force reload with cache bust...');
                window.location.reload(true);
            }
        }
        originalConsoleLog.apply(console, args);
    };
    
    // Check if old code is trying to run
    if (window.location && window.location.hostname && window.location.hostname.includes('stellargeolink.com')) {
        console.log(`%c🌐 Production domain detected: ${window.location.hostname}`, 'color: #00ff00; font-size: 14px;');
    }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

reportWebVitals(); 