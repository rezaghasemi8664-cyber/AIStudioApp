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

// امنیت نشست: بازشدن/رفرش صفحه نباید به‌تنهایی باعث ورود کاربر شود.
// نشست قبلی فقط در همان اجرای فعلی برنامه معتبر است و کاربر باید دوباره
// با فرم ورود و کلیک روی دکمه «ورود» احراز هویت شود.
if (!isPublicLandingPage) {
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
