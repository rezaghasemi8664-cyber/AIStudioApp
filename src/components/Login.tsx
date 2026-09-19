import React, { useEffect, useState } from 'react';
import type { StoredUser } from '../types';
import * as authService from '../services/authService';
import * as guestUserService from '../services/guestUserService';
import { LockClosedIcon, EyeIcon, EyeSlashIcon, XMarkIcon, CheckCircleIcon, UserPlusIcon, ArrowUturnLeftIcon } from './Icons';
import { useNotification } from './NotificationSystem';

interface LoginProps { onLogin: (user: StoredUser) => void; }

type ForgotStep = 'mobile' | 'otp' | 'password';

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
  const [forgotStep, setForgotStep] = useState<ForgotStep>('mobile');
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [signupForm, setSignupForm] = useState({ firstName: '', lastName: '', mobile: '', email: '' });
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = window.setInterval(() => setOtpCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [otpCountdown]);

  const resetForms = () => {
    setError(null); setLoading(false); setUsername(''); setPassword(''); setRememberMe(false); setShowPassword(false);
    setGuestEmail(''); setGuestSuccess(null); setForgotStep('mobile'); setForgotMobile(''); setForgotOtp(''); setResetToken('');
    setNewPassword(''); setConfirmPassword(''); setOtpCountdown(0);
    setSignupForm({ firstName: '', lastName: '', mobile: '', email: '' }); setSignupSuccess(false);
  };

  const handleViewChange = (newView: typeof viewMode) => { resetForms(); setViewMode(newView); };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    try { const user = await authService.login(username, password, rememberMe); onLogin(user); }
    catch (err: any) { setError(err.message || 'خطای ناشناخته در هنگام ورود.'); }
    finally { setLoading(false); }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    try { const result = await guestUserService.createGuestAccount(guestEmail); setGuestSuccess({ email: result.email, password: result.password }); }
    catch (err: any) { setError(err.message || 'خطا در ثبت نام کاربر میهمان.'); }
    finally { setLoading(false); }
  };

  const handleSendResetOtp = async (e?: React.FormEvent) => {
    e?.preventDefault(); setError(null); setLoading(true);
    try { await authService.sendPasswordResetOtp(forgotMobile); setForgotStep('otp'); setOtpCountdown(120); addNotification('کد تأیید به شماره موبایل شما ارسال شد.', 'success'); }
    catch (err: any) { setError(err.message || 'ارسال کد تأیید ناموفق بود.'); }
    finally { setLoading(false); }
  };

  const handleVerifyResetOtp = async (e?: React.FormEvent) => {
    e?.preventDefault(); setError(null); setLoading(true);
    try { const result = await authService.verifyPasswordResetOtp(forgotMobile, forgotOtp); setResetToken(result.resetToken); setForgotStep('password'); }
    catch (err: any) { setError(err.message || 'کد تأیید نامعتبر است.'); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async (e?: React.FormEvent) => {
    e?.preventDefault(); setError(null);
    if (newPassword.length < 6) { setError('رمز جدید باید حداقل ۶ کاراکتر باشد.'); return; }
    if (newPassword !== confirmPassword) { setError('تکرار رمز عبور با رمز جدید مطابقت ندارد.'); return; }
    if (!resetToken) { setError('توکن بازیابی معتبر نیست. لطفاً دوباره کد پیامکی را دریافت کنید.'); return; }
    setLoading(true);
    try { await authService.resetPasswordWithOtp(forgotMobile, resetToken, newPassword); addNotification('رمز عبور با موفقیت تغییر کرد.', 'success'); setForgotStep('mobile'); setForgotMobile(''); setForgotOtp(''); setResetToken(''); setNewPassword(''); setConfirmPassword(''); setOtpCountdown(0); setViewMode('login'); }
    catch (err: any) { setError(err.message || 'تغییر کلمه عبور ناموفق بود.'); }
    finally { setLoading(false); }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    try { await authService.registerUser(signupForm); setSignupSuccess(true); }
    catch (err: any) { setError(err.message || 'خطا در ثبت‌نام.'); }
    finally { setLoading(false); }
  };

  const handleCopyToClipboard = (text: string) => { navigator.clipboard.writeText(text); addNotification('کلمه عبور کپی شد!', 'success'); };

  const inputStyle = { backgroundColor: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border)' };
  const buttonStyle = { backgroundColor: 'var(--login-button-bg)', color: 'var(--login-button-color)' };

  const renderForgot = () => {
    if (forgotStep === 'mobile') return (
      <form onSubmit={handleSendResetOtp} className="p-8 space-y-4" dir="rtl">
        <h3 className="text-xl font-bold text-center mb-2">بازیابی کلمه عبور</h3>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400">شماره موبایل ثبت‌شده خود را وارد کنید تا کد تأیید پیامکی ارسال شود.</p>
        <input type="tel" inputMode="numeric" value={forgotMobile} onChange={(e) => setForgotMobile(e.target.value)} required placeholder="شماره موبایل" className="w-full border rounded-md px-4 py-2" style={inputStyle} />
        {error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}
        <button type="submit" disabled={loading} className="w-full font-bold py-2 px-6 rounded-md" style={buttonStyle}>{loading ? <div className="mx-auto w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : 'ارسال کد پیامکی'}</button>
        <button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">بازگشت به صفحه ورود</button>
      </form>
    );
    if (forgotStep === 'otp') return (
      <form onSubmit={handleVerifyResetOtp} className="p-8 space-y-4" dir="rtl">
        <h3 className="text-xl font-bold text-center mb-2">تأیید شماره موبایل</h3>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400">کد ۶ رقمی ارسال‌شده به {forgotMobile} را وارد کنید.</p>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={forgotOtp} onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required placeholder="کد ۶ رقمی" className="w-full border rounded-md px-4 py-2 text-center tracking-[0.4em]" style={inputStyle} />
        {error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}
        <button type="submit" disabled={loading || forgotOtp.length !== 6} className="w-full font-bold py-2 px-6 rounded-md disabled:opacity-50" style={buttonStyle}>{loading ? <div className="mx-auto w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : 'تأیید کد'}</button>
        <div className="text-center text-sm text-gray-500">{otpCountdown > 0 ? `ارسال مجدد کد تا ${otpCountdown} ثانیه` : <button type="button" onClick={() => handleSendResetOtp()} className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline">ارسال مجدد کد</button>}</div>
        <button type="button" onClick={() => { setForgotStep('mobile'); setForgotOtp(''); setError(null); }} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">تغییر شماره موبایل</button>
      </form>
    );
    return (
      <form onSubmit={handleResetPassword} className="p-8 space-y-4" dir="rtl">
        <h3 className="text-xl font-bold text-center mb-2">تعیین رمز عبور جدید</h3>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400">رمز جدید خود را وارد و برای تأیید دوباره تکرار کنید.</p>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} placeholder="رمز عبور جدید" className="w-full border rounded-md px-4 py-2" style={inputStyle} />
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder="تکرار رمز عبور جدید" className="w-full border rounded-md px-4 py-2" style={inputStyle} />
        {error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}
        <button type="submit" disabled={loading} className="w-full font-bold py-2 px-6 rounded-md" style={buttonStyle}>{loading ? <div className="mx-auto w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : 'تغییر رمز عبور'}</button>
        <button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">انصراف و بازگشت به ورود</button>
      </form>
    );
  };

  const renderContent = () => {
    if (viewMode === 'signup') return signupSuccess ? (
      <div className="p-6 text-center space-y-4" dir="rtl"><CheckCircleIcon className="mx-auto" /><h4 className="text-lg font-bold">ثبت‌نام با موفقیت انجام شد</h4><p className="text-sm text-gray-600 dark:text-gray-400">رمز عبور اولیه حساب شما از طریق پیامک به شماره موبایل ثبت‌شده ارسال شد.</p><button onClick={() => handleViewChange('login')} className="w-full font-bold py-2 px-8 rounded-md flex items-center justify-center gap-2" style={buttonStyle}><ArrowUturnLeftIcon />بازگشت به صفحه ورود</button></div>
    ) : (
      <form onSubmit={handleSignupSubmit} className="p-8 space-y-4" dir="rtl"><h3 className="text-xl font-bold text-center mb-4">ایجاد حساب کاربری</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><input type="text" value={signupForm.firstName} onChange={(e) => setSignupForm((f) => ({ ...f, firstName: e.target.value }))} required placeholder="نام" className="w-full border rounded-md px-4 py-2" style={inputStyle} /><input type="text" value={signupForm.lastName} onChange={(e) => setSignupForm((f) => ({ ...f, lastName: e.target.value }))} required placeholder="نام خانوادگی" className="w-full border rounded-md px-4 py-2" style={inputStyle} /></div><input type="tel" inputMode="numeric" value={signupForm.mobile} onChange={(e) => setSignupForm((f) => ({ ...f, mobile: e.target.value }))} required placeholder="شماره موبایل" className="w-full border rounded-md px-4 py-2" style={inputStyle} /><input type="email" value={signupForm.email} onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))} required placeholder="ایمیل (نام کاربری شما)" className="w-full border rounded-md px-4 py-2" style={inputStyle} />{error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}<button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 font-bold py-2 px-6 rounded-md" style={buttonStyle}>{loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : <><UserPlusIcon /><span>ثبت‌نام</span></>}</button><button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">بازگشت به صفحه ورود</button></form>
    );

    if (viewMode === 'guest') return guestSuccess ? (
      <div className="p-6 text-center space-y-4" dir="rtl"><CheckCircleIcon className="mx-auto" /><h4 className="text-lg font-bold">حساب میهمان ایجاد شد!</h4><div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-2 text-sm"><p><strong>ایمیل:</strong> {guestSuccess.email}</p><div className="flex items-center justify-center gap-2"><strong>کلمه عبور:</strong><code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{guestSuccess.password}</code><button onClick={() => handleCopyToClipboard(guestSuccess.password)} className="text-cyan-600 hover:text-cyan-800">📋</button></div></div><p className="text-xs text-gray-500">لطفاً این اطلاعات را ذخیره کنید.</p><button onClick={() => handleViewChange('login')} className="w-full font-bold py-2 px-8 rounded-md" style={buttonStyle}><ArrowUturnLeftIcon /> رفتن به صفحه ورود</button></div>
    ) : (
      <form onSubmit={handleGuestSubmit} className="p-8 space-y-4" dir="rtl"><h3 className="text-xl font-bold text-center mb-4">ورود میهمان</h3><p className="text-sm text-center text-gray-500">ایمیل خود را وارد کنید تا حساب میهمان برای شما ایجاد شود.</p><input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required placeholder="ایمیل شما" className="w-full border rounded-md px-4 py-2" style={inputStyle} />{error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}<button type="submit" disabled={loading} className="w-full font-bold py-2 px-6 rounded-md" style={buttonStyle}>{loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : 'ایجاد حساب میهمان'}</button><button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">بازگشت به صفحه ورود</button></form>
    );

    if (viewMode === 'forgot') return renderForgot();

    return <form onSubmit={handleLoginSubmit} className="p-8 space-y-6" dir="rtl"><div className="text-center mb-6"><img src="/1.png" alt="سامانه تحلیلگر هوشمند بورس رونیا" className="mx-auto mb-4 w-70 max-w-[440px] h-70 object-contain" /><h2 className="text-2xl font-extrabold" style={{ color: 'var(--login-title-color)' }}>ورود به سامانه</h2></div><div><label htmlFor="username" className="block text-sm font-medium mb-1" style={{ color: 'var(--login-label-color)' }}>نام کاربری (ایمیل)</label><input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="example@email.com" style={inputStyle} /></div><div><label htmlFor="password" className="block text-sm font-medium mb-1" style={{ color: 'var(--login-label-color)' }}>کلمه عبور</label><div className="relative"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="••••••••" style={inputStyle} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" tabIndex={-1}>{showPassword ? <EyeSlashIcon /> : <EyeIcon />}</button></div></div><div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-gray-300" /><span style={{ color: 'var(--login-label-color)' }}>مرا به خاطر بسپار</span></label><button type="button" onClick={() => handleViewChange('forgot')} className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold">فراموشی کلمه عبور</button></div>{error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-600 rounded-lg p-3 flex items-start gap-2 text-sm"><XMarkIcon className="text-red-500 mt-0.5 flex-shrink-0 cursor-pointer" onClick={() => setError(null)} /><span className="text-red-600 dark:text-red-400">{error}</span></div>}<button type="submit" disabled={loading} className="w-full font-bold py-2.5 px-6 rounded-md transition-all duration-200 flex items-center justify-center gap-2" style={buttonStyle}>{loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : <><LockClosedIcon /><span>ورود</span></>}</button><div className="flex items-center gap-4 text-sm justify-center pt-2"><button type="button" onClick={() => handleViewChange('signup')} className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1"><UserPlusIcon /> ثبت‌نام</button><span className="text-gray-400">|</span><button type="button" onClick={() => handleViewChange('guest')} className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">ورود میهمان</button></div></form>;
  };

  return <div className="login-workstation min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--login-bg, linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%))' }}><div className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--login-card-bg, var(--card-bg))', color: 'var(--login-card-color, var(--card-color))', borderColor: 'var(--login-card-border-color, transparent)', fontFamily: 'var(--login-card-font-family)', fontSize: 'var(--login-card-font-size)', borderWidth: 'var(--login-card-border-width)', borderStyle: 'solid' }}>{renderContent()}</div></div>;
};

export default Login;
