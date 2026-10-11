// src/components/PasswordChangeForm.tsx
// ═══════════════════════════════════════════════════════════════
// فرم تغییر رمز عبور — نسخه اصلاح‌شده v2.0
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react';

interface PasswordChangeFormProps {
  onPasswordChange: (currentPass: string, newPass: string) => Promise<void>;
}

const PasswordChangeForm: React.FC<PasswordChangeFormProps> = ({
  onPasswordChange,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // ─── اعتبارسنجی ─────────────────────────────────────────
    if (newPassword !== confirmPassword) {
      setError('کلمه عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }
    if (newPassword.length < 6) {
      setError('کلمه عبور جدید باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('کلمه عبور جدید نباید با کلمه عبور فعلی یکسان باشد.');
      return;
    }

    setLoading(true);
    try {
      // ✅ onPasswordChange اکنون توکن جدید را هم ذخیره می‌کند
      await onPasswordChange(currentPassword, newPassword);

      // پاکسازی فرم پس از موفقیت
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);

      // ✅ دیگر نیازی به "لطفاً دوباره وارد شوید" نیست

    } catch (err: any) {
      setError(err.message || 'خطا در تغییر کلمه عبور.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-style-id="password-form-card"
      data-style-name="فرم تغییر رمز"
      className="password-change-workstation p-6 rounded-lg"
      style={{
        backgroundColor: 'var(--password-form-card-bg)',
        color: 'var(--password-form-card-color)',
        fontFamily: 'var(--password-form-card-font-family)',
        fontSize: 'var(--password-form-card-font-size)',
      }}
    >
      <h3 className="text-lg font-semibold mb-4">تغییر کلمه عبور</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── کلمه عبور فعلی ──────────────────────── */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="currentPassword"
          >
            کلمه عبور فعلی
          </label>
          <div className="relative">
            <input
              id="currentPassword"
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 pl-11 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-color)',
                borderColor: 'var(--input-border)',
                '--tw-ring-color': 'var(--input-focus-ring)',
              } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword((visible) => !visible)}
              aria-label={showCurrentPassword ? 'پنهان کردن کلمه عبور فعلی' : 'نمایش کلمه عبور فعلی'}
              aria-pressed={showCurrentPassword}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-gray-500 hover:text-[var(--input-color)] focus:outline-none focus:ring-2 rounded"
            >
              {showCurrentPassword ? (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A11.7 11.7 0 0112 5c5.2 0 9.3 4.3 10 7-.3 1.2-1.3 2.8-3 4.1M6.2 6.2C3.8 7.7 2.4 10 2 12c.4 1.5 1.5 3.4 3.5 4.8A11.8 11.8 0 0012 19c1 0 2-.1 2.9-.4" />
                </svg>
              ) : (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── کلمه عبور جدید ──────────────────────── */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="newPassword"
          >
            کلمه عبور جدید
          </label>
          <div className="relative">
            <input
              id="newPassword"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 pl-11 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-color)',
                borderColor: 'var(--input-border)',
                '--tw-ring-color': 'var(--input-focus-ring)',
              } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((visible) => !visible)}
              aria-label={showNewPassword ? 'پنهان کردن کلمه عبور جدید' : 'نمایش کلمه عبور جدید'}
              aria-pressed={showNewPassword}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-gray-500 hover:text-[var(--input-color)] focus:outline-none focus:ring-2 rounded"
            >
              {showNewPassword ? (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A11.7 11.7 0 0112 5c5.2 0 9.3 4.3 10 7-.3 1.2-1.3 2.8-3 4.1M6.2 6.2C3.8 7.7 2.4 10 2 12c.4 1.5 1.5 3.4 3.5 4.8A11.8 11.8 0 0012 19c1 0 2-.1 2.9-.4" />
                </svg>
              ) : (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── تکرار کلمه عبور ─────────────────────── */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="confirmPassword"
          >
            تکرار کلمه عبور جدید
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 pl-11 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-color)',
                borderColor: 'var(--input-border)',
                '--tw-ring-color': 'var(--input-focus-ring)',
              } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              aria-label={showConfirmPassword ? 'پنهان کردن تکرار کلمه عبور جدید' : 'نمایش تکرار کلمه عبور جدید'}
              aria-pressed={showConfirmPassword}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-gray-500 hover:text-[var(--input-color)] focus:outline-none focus:ring-2 rounded"
            >
              {showConfirmPassword ? (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A11.7 11.7 0 0112 5c5.2 0 9.3 4.3 10 7-.3 1.2-1.3 2.8-3 4.1M6.2 6.2C3.8 7.7 2.4 10 2 12c.4 1.5 1.5 3.4 3.5 4.8A11.8 11.8 0 0012 19c1 0 2-.1 2.9-.4" />
                </svg>
              ) : (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── نمایش خطا ───────────────────────────── */}
        {error && (
          <p className="text-sm text-[var(--color-negative)]">{error}</p>
        )}

        {/* ── دکمه ارسال ──────────────────────────── */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 font-bold py-2 px-6 rounded-md transition-transform duration-200 ease-in-out transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-color)',
            }}
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
                <span>در حال ذخیره...</span>
              </>
            ) : (
              <span>تغییر کلمه عبور</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PasswordChangeForm;
