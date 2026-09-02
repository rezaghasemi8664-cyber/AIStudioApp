import React, { useState } from 'react';
import type { StoredUser } from '../types';
import * as authService from '../services/authService';
import * as guestUserService from '../services/guestUserService';
import { APP_BACKEND_URL } from '../api/config';
import {
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  XMarkIcon,
  CheckCircleIcon,
  UserPlusIcon,
  KeyIcon,
  ArrowUturnLeftIcon,
} from './Icons';
import { useNotification } from './NotificationSystem';

interface LoginProps {
  onLogin: (user: StoredUser) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [viewMode, setViewMode] = useState<'login' | 'signup' | 'forgot' | 'guest'>('login');
  const { addNotification } = useNotification();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [guestEmail, setGuestEmail] = useState('');
  const [guestSuccess, setGuestSuccess] = useState<{ email: string; password: string } | null>(null);

  const [forgotEmail, setForgotEmail] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  const [signupForm, setSignupForm] = useState({
    firstName: '',
    lastName: '',
    mobile: '',
    email: '',
  });
  const [signupSuccess, setSignupSuccess] = useState(false);

  const resetForms = () => {
    setError(null);
    setLoading(false);
    setUsername('');
    setPassword('');
    setRememberMe(false);
    setGuestEmail('');
    setGuestSuccess(null);
    setForgotEmail('');
    setRecoverySuccess(false);
    setSignupForm({
      firstName: '',
      lastName: '',
      mobile: '',
      email: '',
    });
    setSignupSuccess(false);
  };

  const handleViewChange = (newView: typeof viewMode) => {
    resetForms();
    setViewMode(newView);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await authService.login(username, password, rememberMe);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'خطای ناشناخته در هنگام ورود.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await guestUserService.createGuestAccount(guestEmail);
      setGuestSuccess({ email: result.email, password: result.password });
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت نام کاربر میهمان.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.recoverPassword(forgotEmail);
      setRecoverySuccess(true);
    } catch (err: any) {
      setError(err.message || 'خطای ناشناخته.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.registerUser(signupForm);
      setSignupSuccess(true);
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت‌نام.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification('کلمه عبور کپی شد!', 'success');
  };

  const renderContent = () => {
    switch (viewMode) {
      case 'signup':
        return signupSuccess ? (
          <div className="p-6 text-center space-y-4">
            <CheckCircleIcon className="mx-auto" />
            <h4 className="text-lg font-bold">کلمه عبور به ایمیل شما ارسال گردید</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">لطفا جهت مشاهده کلمه عبور ایمیل خود را بررسی نمایید.</p>
            <div className="pt-2">
              <button
                onClick={() => handleViewChange('login')}
                className="w-full sm:w-auto font-bold py-2 px-8 rounded-md transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)' }}
              >
                <ArrowUturnLeftIcon />
                بازگشت به صفحه ورود
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSignupSubmit} className="p-8 space-y-4">
            <h3 className="text-xl font-bold text-center mb-4">ایجاد حساب کاربری</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input type="text" value={signupForm.firstName} onChange={(e) => setSignupForm((f) => ({ ...f, firstName: e.target.value }))} required placeholder="نام" className="w-full border rounded-md px-4 py-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }} />
              <input type="text" value={signupForm.lastName} onChange={(e) => setSignupForm((f) => ({ ...f, lastName: e.target.value }))} required placeholder="نام خانوادگی" className="w-full border rounded-md px-4 py-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }} />
            </div>
            <input type="text" value={signupForm.mobile} onChange={(e) => setSignupForm((f) => ({ ...f, mobile: e.target.value }))} required placeholder="شماره موبایل" className="w-full border rounded-md px-4 py-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }} />
            <input type="email" value={signupForm.email} onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))} required placeholder="ایمیل (نام کاربری شما)" className="w-full border rounded-md px-4 py-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }} />
            {error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 font-bold py-2 px-6 rounded-md" style={{ backgroundColor: 'var(--login-button-bg)', color: 'var(--login-button-color)' }}>
              {loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : <><UserPlusIcon /><span>ثبت‌نام</span></>}
            </button>
            <button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">بازگشت به صفحه ورود</button>
          </form>
        );

      case 'guest':
        return guestSuccess ? (
          <div className="p-6 text-center space-y-4">
            <CheckCircleIcon className="mx-auto" />
            <h4 className="text-lg font-bold">حساب میهمان ایجاد شد!</h4>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-2 text-sm">
              <p><strong>ایمیل:</strong> {guestSuccess.email}</p>
              <div className="flex items-center justify-center gap-2">
                <strong>کلمه عبور:</strong>
                <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{guestSuccess.password}</code>
                <button onClick={() => handleCopyToClipboard(guestSuccess.password)} className="text-cyan-600 hover:text-cyan-800">
                  <ClipboardDocumentIcon />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">لطفاً این اطلاعات را ذخیره کنید.</p>
            <button
              onClick={() => handleViewChange('login')}
              className="w-full font-bold py-2 px-8 rounded-md"
              style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)' }}
            >
              <ArrowUturnLeftIcon /> رفتن به صفحه ورود
            </button>
          </div>
        ) : (
          <form onSubmit={handleGuestSubmit} className="p-8 space-y-4">
            <h3 className="text-xl font-bold text-center mb-4">ورود میهمان</h3>
            <p className="text-sm text-center text-gray-500">ایمیل خود را وارد کنید تا حساب میهمان برای شما ایجاد شود.</p>
            <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required placeholder="ایمیل شما" className="w-full border rounded-md px-4 py-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }} />
            {error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full font-bold py-2 px-6 rounded-md" style={{ backgroundColor: 'var(--login-button-bg)', color: 'var(--login-button-color)' }}>
              {loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : 'ایجاد حساب میهمان'}
            </button>
            <button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">بازگشت به صفحه ورود</button>
          </form>
        );

      case 'forgot':
        return recoverySuccess ? (
          <div className="p-6 text-center space-y-4">
            <CheckCircleIcon className="mx-auto" />
            <h4 className="text-lg font-bold">کلمه عبور به ایمیل شما ارسال گردید</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">لطفا جهت مشاهده کلمه عبور ایمیل خود را بررسی نمایید.</p>
            <button
              onClick={() => handleViewChange('login')}
              className="w-full font-bold py-2 px-8 rounded-md"
              style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)' }}
            >
              <ArrowUturnLeftIcon /> بازگشت به صفحه ورود
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="p-8 space-y-4">
            <h3 className="text-xl font-bold text-center mb-4">بازیابی کلمه عبور</h3>
            <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required placeholder="ایمیل ثبت‌شده" className="w-full border rounded-md px-4 py-2" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }} />
            {error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full font-bold py-2 px-6 rounded-md" style={{ backgroundColor: 'var(--login-button-bg)', color: 'var(--login-button-color)' }}>
              {loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : 'بازیابی'}
            </button>
            <button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">بازگشت به صفحه ورود</button>
          </form>
        );

      default:
        return (
          <form onSubmit={handleLoginSubmit} className="p-8 space-y-6" dir="rtl">
            <div className="text-center mb-6">
              <img
                src="/1.png"
                alt="سامانه تحلیلگر هوشمند بورس رونیا"
                className="mx-auto mb-4 w-70 max-w-[440px] h-70 object-contain"
              />
              <h2 className="text-2xl font-extrabold" style={{ color: 'var(--login-title-color)' }}>
                ورود به سامانه
              </h2>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1" style={{ color: 'var(--login-label-color)' }}>
                نام کاربری (ایمیل)
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="example@email.com"
                style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1" style={{ color: 'var(--login-label-color)' }}>
                کلمه عبور
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="••••••••"
                  style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span style={{ color: 'var(--login-label-color)' }}>مرا به خاطر بسپار</span>
              </label>
              <button
                type="button"
                onClick={() => handleViewChange('forgot')}
                className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold"
              >
                فراموشی کلمه عبور
              </button>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-600 rounded-lg p-3 flex items-start gap-2 text-sm">
                <XMarkIcon className="text-red-500 mt-0.5 flex-shrink-0 cursor-pointer" onClick={() => setError(null)} />
                <span className="text-red-600 dark:text-red-400">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold py-2.5 px-6 rounded-md transition-all duration-200 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--login-button-bg)', color: 'var(--login-button-color)' }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <LockClosedIcon />
                  <span>ورود</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-4 text-sm justify-center pt-2">
              <button type="button" onClick={() => handleViewChange('signup')} className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1">
                <UserPlusIcon /> ثبت‌نام
              </button>
              <span className="text-gray-400">|</span>
              <button type="button" onClick={() => handleViewChange('guest')} className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
                ورود میهمان
              </button>
            </div>
          </form>
        );
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'var(--login-bg, linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%))',
      }}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--login-card-bg, var(--card-bg))',
          color: 'var(--login-card-color, var(--card-color))',
          borderColor: 'var(--login-card-border-color, transparent)',
          fontFamily: 'var(--login-card-font-family)',
          fontSize: 'var(--login-card-font-size)',
          borderWidth: 'var(--login-card-border-width)',
          borderStyle: 'solid',
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
};

export default Login;
