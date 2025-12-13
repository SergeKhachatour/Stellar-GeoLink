import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/stellar-brand.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Version constant for build tracking
const APP_VERSION = 'v2.0.9-2025-01-13-18:20-FORCE-REBUILD-1736791200000';
if (typeof window !== 'undefined') {
    window.APP_VERSION = APP_VERSION;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

reportWebVitals(); 