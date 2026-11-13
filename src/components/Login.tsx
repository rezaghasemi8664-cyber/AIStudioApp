import React, { useEffect, useState } from 'react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { StoredUser } from '../types';
import * as authService from '../services/authService';
import { LockClosedIcon, EyeIcon, EyeSlashIcon, XMarkIcon, UserPlusIcon, CheckCircleIcon, ArrowUturnLeftIcon } from './Icons';
import { useNotification } from './NotificationSystem';
import { trackMarketingEvent } from '../services/marketingAttribution';

interface LoginProps { onLogin: (user: StoredUser) => void; }

type ForgotStep = 'mobile' | 'otp' | 'password';

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [viewMode, setViewMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>('mobile');
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [signupForm, setSignupForm] = useState({ firstName: '', lastName: '', mobile: '', email: '', referralCode: '' });
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    void trackMarketingEvent('login_page_view');
  }, []);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = window.setInterval(() => setOtpCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [otpCountdown]);

  const resetForms = () => {
    setError(null); setLoading(false); setUsername(''); setPassword(''); setRememberMe(false); setShowPassword(false);
setForgotStep('mobile'); setForgotMobile(''); setForgotOtp(''); setResetToken('');
    setNewPassword(''); setConfirmPassword(''); setOtpCountdown(0);
    setSignupForm({ firstName: '', lastName: '', mobile: '', email: '', referralCode: '' }); setSignupSuccess(false);
  };

  const handleViewChange = (newView: typeof viewMode) => { resetForms(); setViewMode(newView); };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    try { const user = await authService.login(username, password, rememberMe); onLogin(user); }
    catch (err: any) { setError(err.message || 'خطای ناشناخته در هنگام ورود.'); }
    finally { setLoading(false); }
  };

  const handlePasskeyLogin = async () => { setError(null); setLoading(true); try { const user = await authService.loginWithPasskey(); onLogin(user); } catch (err: any) { const message = String(err?.message || ''); const disabledMessage = 'برای این حساب هنوز کلید امنیتی قابل استفاده ثبت نشده است. ابتدا با رمز عبور وارد شوید و در تنظیمات، این دستگاه را دوباره ثبت کنید.'; setError(/ورود بیومتریک برای این حساب فعال نیست|برای این حساب ورود بیومتریک فعال نیست|ورود بیومتریک غیرفعال شده است|کلید امنیتی ثبت نشده است/i.test(message) ? disabledMessage : (message || 'ورود بیومتریک ناموفق بود.')); } finally { setLoading(false); } };

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
      <form onSubmit={handleSignupSubmit} className="p-8 space-y-4" dir="rtl"><h3 className="text-xl font-bold text-center mb-4">ایجاد حساب کاربری</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><input type="text" value={signupForm.firstName} onChange={(e) => setSignupForm((f) => ({ ...f, firstName: e.target.value }))} required placeholder="نام" className="w-full border rounded-md px-4 py-2" style={inputStyle} /><input type="text" value={signupForm.lastName} onChange={(e) => setSignupForm((f) => ({ ...f, lastName: e.target.value }))} required placeholder="نام خانوادگی" className="w-full border rounded-md px-4 py-2" style={inputStyle} /></div><input type="tel" inputMode="numeric" value={signupForm.mobile} onChange={(e) => setSignupForm((f) => ({ ...f, mobile: e.target.value }))} required placeholder="شماره موبایل" className="w-full border rounded-md px-4 py-2" style={inputStyle} /><input type="email" value={signupForm.email} onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))} required placeholder="ایمیل (نام کاربری شما)" className="w-full border rounded-md px-4 py-2" style={inputStyle} /><input type="text" value={signupForm.referralCode} onChange={(e) => setSignupForm((f) => ({ ...f, referralCode: e.target.value.toUpperCase().replace(/\s/g, '') }))} maxLength={20} autoComplete="off" placeholder="کد معرف (اختیاری)" className="w-full border rounded-md px-4 py-2" style={inputStyle} />{error && <p className="text-sm text-[var(--color-negative)] text-center">{error}</p>}<button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 font-bold py-2 px-6 rounded-md" style={buttonStyle}>{loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : <><UserPlusIcon /><span>ثبت‌نام</span></>}</button><button type="button" onClick={() => handleViewChange('login')} className="w-full text-center text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">بازگشت به صفحه ورود</button></form>
    );

    if (viewMode === 'forgot') return renderForgot();

    return (
      <form onSubmit={handleLoginSubmit} className="w-full p-7 sm:p-10 space-y-5" dir="rtl">
        <div className="text-right mb-7">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold mb-4" style={{ background: 'var(--login-accent-soft, #e8f4ef)', color: 'var(--login-accent, #218765)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--login-accent, #218765)' }} />
            سامانه تحلیلگر هوشمند بورس
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold" style={{ color: 'var(--login-title-color, #172638)' }}>نرم‌افزار تحلیلگر هوشمند بورس رونیا</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500">برای ورود به حساب کاربری خود، اطلاعات زیر را وارد کنید.</p>
        </div>
        <div>
          <label htmlFor="username" className="block text-sm font-semibold mb-2" style={{ color: 'var(--login-label-color)' }}>نام کاربری (ایمیل)</label>
          <input id="username" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition" placeholder="example@email.com" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-semibold mb-2" style={{ color: 'var(--login-label-color)' }}>کلمه عبور</label>
          <div className="relative">
            <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition" placeholder="••••••••" style={inputStyle} />
            <button type="button" aria-label={showPassword ? 'مخفی کردن کلمه عبور' : 'نمایش کلمه عبور'} onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" tabIndex={-1}>{showPassword ? <EyeSlashIcon /> : <EyeIcon />}</button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-gray-300 accent-emerald-600" /><span style={{ color: 'var(--login-label-color)' }}>مرا به خاطر بسپار</span></label>
          <button type="button" onClick={() => handleViewChange('forgot')} className="font-semibold hover:underline" style={{ color: 'var(--login-accent, #218765)' }}>فراموشی کلمه عبور</button>
        </div>
        {error && <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-600 rounded-xl p-3 flex items-start gap-2 text-sm"><XMarkIcon className="text-red-500 mt-0.5 flex-shrink-0 cursor-pointer" onClick={() => setError(null)} /><span className="text-red-600 dark:text-red-400">{error}</span></div>}
        <button type="submit" disabled={loading} className="w-full min-h-12 rounded-xl px-6 py-3 font-extrabold text-white shadow-md transition-all duration-200 flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]">
          {loading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" /> : <><LockClosedIcon /><span>ورود</span></>}
        </button>
        {browserSupportsWebAuthn() && <button type="button" onClick={() => void handlePasskeyLogin()} disabled={loading} className="w-full min-h-12 rounded-xl px-6 py-3 font-bold flex items-center justify-center gap-2 border border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50"><span aria-hidden="true">◉</span><span>ورود با Face ID، اثر انگشت یا قفل صفحه</span></button>}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--login-label-color)' }}>هنوز حساب کاربری ندارید؟</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">همین حالا حساب خود را رایگان ایجاد کنید.</p>
          </div>
          <button type="button" onClick={() => { void trackMarketingEvent('signup_click'); handleViewChange('signup'); }} className="w-full min-h-12 rounded-xl px-6 py-3 font-extrabold shadow-sm transition-all duration-200 flex items-center justify-center gap-2 border-2 border-emerald-700 bg-white text-emerald-800 hover:bg-emerald-50 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 active:scale-[0.99]">
            <UserPlusIcon /> <span>ثبت‌نام رایگان</span>
          </button>
        </div>
      </form>
    );
  };

  return (
    <main className="login-workstation min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-10" style={{ background: 'var(--login-bg, radial-gradient(circle at 12% 12%, #e5f4ed 0%, #f4f7f6 38%, #e9eef2 100%))' }}>
      <div className="w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-[0_28px_90px_-35px_rgba(15,45,43,0.35)] grid grid-cols-1 lg:grid-cols-[0.92fr_1.08fr]" style={{ color: 'var(--login-card-color, var(--card-color))', fontFamily: 'var(--login-card-font-family)', fontSize: 'var(--login-card-font-size)' }}>
        <section className="relative order-2 lg:order-1 overflow-hidden px-7 py-8 sm:px-10 sm:py-12 lg:px-12 lg:py-14 text-white flex flex-col justify-between min-h-[230px] lg:min-h-[650px]" style={{ background: 'linear-gradient(145deg,#102d2b 0%,#164b40 55%,#218765 100%)' }}>
          <div className="absolute -top-24 -left-20 w-72 h-72 rounded-full border border-white/10" />
          <div className="absolute top-20 -left-10 w-56 h-56 rounded-full border border-white/10" />
          <div className="absolute -bottom-28 right-8 w-80 h-80 rounded-full bg-emerald-300/10 blur-2xl" />
          <div className="relative z-10 flex items-center gap-4 sm:gap-5">
            <img src="/1.png" alt="رونیا" className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 object-contain rounded-2xl bg-white/95 p-1.5 shrink-0" />
            <div><div className="text-2xl font-black tracking-tight">رونیا</div><div className="text-xs sm:text-sm text-emerald-100 mt-1">تحلیل هوشمند بازار سرمایه</div></div>
          </div>
          <div className="relative z-10 mt-8 lg:mt-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black leading-[1.7]">هوشمندانه‌تر تحلیل کنید،<br/>آگاهانه‌تر معامله کنید.</h1>
            <p className="mt-4 max-w-md text-sm sm:text-base leading-8 text-emerald-50/85">ابزارهای تحلیلی و اطلاعات بازار را در یک فضای یکپارچه و حرفه‌ای در اختیار داشته باشید.</p>
            <div className="mt-8 hidden sm:flex items-end gap-2 h-24 opacity-80" aria-hidden="true">
              {[28,42,35,58,48,72,62,88,70,96,78,100,84,108].map((height,index)=><span key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-300/20 to-emerald-100/90" style={{height:height+'%'}} />)}
            </div>
          </div>
          <div className="relative z-10 mt-8 lg:mt-10 flex items-end justify-between gap-4 text-[11px] sm:text-xs text-emerald-100/75">
            <span>پلتفرم تحلیلگر هوشمند بورس</span>
            <div className="flex flex-col items-end gap-2 text-right">
              <span dir="ltr">roniya-analyzer.ir</span>
              <a
                href="https://t.me/RoniyaAnalyzer"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-100 hover:text-white hover:underline underline-offset-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#164b40] rounded-sm"
                aria-label="ورود به کانال تلگرام رونیا"
              >
                ورود به کانال تلگرام رونیا
              </a>
            </div>
          </div>
        </section>
        <section className="order-1 lg:order-2 flex items-center justify-center min-w-0" style={{ backgroundColor: 'var(--login-card-bg, #ffffff)' }}>
          <div className="w-full max-w-xl" style={{ color: 'var(--login-card-color, var(--card-color))' }}>{renderContent()}</div>
        </section>
      </div>
    </main>
  );
};

export default Login;
