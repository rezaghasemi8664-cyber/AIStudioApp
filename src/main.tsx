// src/main.tsx - Entry Point اصلی اپلیکیشن رونیا
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PublicLandingPage from './components/PublicLandingPage';
import { NotificationProvider } from './components/NotificationSystem';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element with id "root" not found in the DOM. ' +
    'Make sure index.html contains <div id="root"></div>'
  );
}

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isPublicLandingPage = normalizedPath === '/' || normalizedPath === '/about';

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {isPublicLandingPage ? (
      <PublicLandingPage />
    ) : (
      <NotificationProvider>
        <App />
      </NotificationProvider>
    )}
  </React.StrictMode>
);
