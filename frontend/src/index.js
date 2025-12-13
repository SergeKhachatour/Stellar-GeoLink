import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/stellar-brand.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// CRITICAL: Version check - runs immediately after imports
const APP_VERSION = 'v2.0.7-2025-01-13-CACHE-BUST-FINAL';
if (typeof window !== 'undefined') {
    window.APP_VERSION = APP_VERSION;
    console.log(`%c🚀 APP STARTING - Version: ${APP_VERSION}`, 'color: #00ff00; font-size: 20px; font-weight: bold; background: #000; padding: 15px; border: 3px solid #00ff00;');
    console.log(`%c✅ If you see this message, the NEW code is running!`, 'color: #00ff00; font-size: 16px; font-weight: bold;');
    
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