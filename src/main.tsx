// src/main.tsx - Entry Point اصلی اپلیکیشن رونیا
import './index.css';
import './fintech-ui.css';
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
const searchParams = new URLSearchParams(window.location.search);
const paymentStatus = searchParams.get('payment');
const isPaymentReturn = ['success', 'failed', 'cancelled', 'pending'].includes(paymentStatus || '');

// The root path normally renders the public landing page. A payment gateway,
// however, returns to the root with payment query parameters. That return must
// render the authenticated App so the existing session can be restored.
const isPublicLandingPage =
  (normalizedPath === '/' || normalizedPath === '/about') && !isPaymentReturn;

// Do not clear an authenticated session during a payment-gateway callback.
// The callback is a full-page navigation to the root URL, and the App needs
// the persisted token/currentUser to restore the session.
if (!isPublicLandingPage && !isPaymentReturn) {
  try {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  } catch {
    // در محیط‌هایی که localStorage در دسترس نیست، App بدون نشست اجرا می‌شود.
  }
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {isPublicLandingPage ? (
      <>
        <style>{`.roniya-public-page .public-brand img { display: none !important; } .roniya-public-page .public-brand { gap: 0 !important; }`}</style>
        <PublicLandingPage />
      </>
    ) : (
      <NotificationProvider>
        <App />
      </NotificationProvider>
    )}
  </React.StrictMode>
);
