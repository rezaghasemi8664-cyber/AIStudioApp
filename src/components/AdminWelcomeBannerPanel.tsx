import React, { useEffect, useState } from 'react';
import * as themeService from '../services/themeService';
import type { WelcomeBannerConfig } from '../types';

const DEFAULT_CONFIG: WelcomeBannerConfig = {
  text: 'به رونیا خوش آمدید.',
  durationSeconds: 10,
};

const AdminWelcomeBannerPanel: React.FC = () => {
  const [config, setConfig] = useState<WelcomeBannerConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setConfig(await themeService.getWelcomeBannerConfig());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دریافت تنظیمات بنر ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    const text = config.text.trim();
    const durationSeconds = Math.max(1, Math.min(120, Math.trunc(Number(config.durationSeconds) || 10)));
    if (!text) {
      setError('متن بنر نمی‌تواند خالی باشد.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await themeService.setWelcomeBannerConfig({ text, durationSeconds });
      if (!result.ok) throw new Error(result.message || 'ذخیره تنظیمات بنر ناموفق بود.');
      setConfig({ text, durationSeconds });
      setMessage('تنظیمات بنر برای تمام کاربران ذخیره شد.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ذخیره تنظیمات بنر ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">در حال دریافت تنظیمات بنر خوش‌آمدگویی…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="text-lg font-extrabold">بنر خوش‌آمدگویی</h3>
        <p className="mt-2 text-sm text-gray-500">
          این تنظیمات سراسری است و متن و مدت نمایش بنر را برای همه کاربران هنگام ورود به نرم‌افزار تعیین می‌کند.
        </p>

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        <label className="mt-5 block text-sm font-semibold">متن بنر</label>
        <textarea
          value={config.text}
          onChange={e => setConfig(prev => ({ ...prev, text: e.target.value }))}
          className="mt-2 min-h-[160px] w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-4 text-sm leading-7"
          placeholder="متن خوش‌آمدگویی را وارد کنید"
        />

        <label className="mt-5 block text-sm font-semibold">مدت نمایش (ثانیه)</label>
        <input
          type="number"
          min={1}
          max={120}
          value={config.durationSeconds}
          onChange={e => setConfig(prev => ({ ...prev, durationSeconds: Number(e.target.value) }))}
          className="mt-2 w-full max-w-xs rounded-xl border border-[var(--card-border-color)] bg-transparent p-3 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">مقدار مجاز: ۱ تا ۱۲۰ ثانیه</p>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره بنر برای همه کاربران'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <h4 className="font-bold">نحوه نمایش</h4>
        <p className="mt-2 text-sm text-gray-500">
          بنر بعد از ورود موفق کاربر نمایش داده می‌شود، مدت آن از تنظیم بالا خوانده می‌شود و کاربر نیز می‌تواند قبل از پایان زمان آن را ببندد.
        </p>
      </div>
    </div>
  );
};

export default AdminWelcomeBannerPanel;
