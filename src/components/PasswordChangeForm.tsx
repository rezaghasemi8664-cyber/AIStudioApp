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
      className="p-6 rounded-lg"
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
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-color)',
              borderColor: 'var(--input-border)',
              '--tw-ring-color': 'var(--input-focus-ring)',
            } as React.CSSProperties}
          />
        </div>

        {/* ── کلمه عبور جدید ──────────────────────── */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="newPassword"
          >
            کلمه عبور جدید
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-color)',
              borderColor: 'var(--input-border)',
              '--tw-ring-color': 'var(--input-focus-ring)',
            } as React.CSSProperties}
          />
        </div>

        {/* ── تکرار کلمه عبور ─────────────────────── */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="confirmPassword"
          >
            تکرار کلمه عبور جدید
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-color)',
              borderColor: 'var(--input-border)',
              '--tw-ring-color': 'var(--input-focus-ring)',
            } as React.CSSProperties}
          />
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
