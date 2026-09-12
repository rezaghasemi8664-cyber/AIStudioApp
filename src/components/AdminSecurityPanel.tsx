import React, { useEffect, useState } from 'react';
import * as adminActionsService from '../services/adminActionsService';

interface SecurityPolicy {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSpecial: boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  rateLimitPerMinute: number;
  auditSecurityEvents: boolean;
}

const defaults: SecurityPolicy = {
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSpecial: true,
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  sessionTimeoutMinutes: 120,
  maxConcurrentSessions: 3,
  rateLimitPerMinute: 120,
  auditSecurityEvents: true,
};

const labels: Record<keyof SecurityPolicy, string> = {
  passwordMinLength: 'حداقل طول رمز عبور',
  passwordRequireUppercase: 'الزام حروف بزرگ',
  passwordRequireNumber: 'الزام عدد',
  passwordRequireSpecial: 'الزام کاراکتر ویژه',
  maxLoginAttempts: 'حداکثر تلاش ناموفق ورود',
  lockoutMinutes: 'مدت قفل حساب (دقیقه)',
  sessionTimeoutMinutes: 'اعتبار نشست (دقیقه)',
  maxConcurrentSessions: 'حداکثر نشست همزمان',
  rateLimitPerMinute: 'سقف درخواست در دقیقه',
  auditSecurityEvents: 'ثبت رویدادهای امنیتی',
};

const AdminSecurityPanel: React.FC = () => {
  const [policy, setPolicy] = useState<SecurityPolicy>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminActionsService.getCapabilities('security');
      const configured = (result as any)?.config?.securityPolicy || (result as any)?.config?.policy;
      if (configured && typeof configured === 'object') setPolicy({ ...defaults, ...configured });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دریافت سیاست امنیتی ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const update = <K extends keyof SecurityPolicy>(key: K, value: SecurityPolicy[K]) =>
    setPolicy(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true); setMessage(null); setError(null);
    try {
      await adminActionsService.executeAction('security', 'set-policy', { key: 'policy', value: policy });
      setMessage('سیاست‌های امنیتی با موفقیت ذخیره شد.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ذخیره سیاست امنیتی ناموفق بود.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-6 text-sm text-gray-500">در حال دریافت تنظیمات امنیتی...</div>;

  return <div className="space-y-6" dir="rtl">
    <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">مدیریت امنیت و دسترسی</h2><p className="mt-1 text-sm text-gray-500">سیاست‌های ورود، نشست، محدودیت درخواست و ثبت رویدادهای امنیتی.</p></div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">فعال</span>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="mb-4 font-bold">سیاست رمز عبور</h3>
        <div className="grid gap-4">
          <NumberField label={labels.passwordMinLength} value={policy.passwordMinLength} min={6} max={128} onChange={v => update('passwordMinLength', v)} />
          <Toggle label={labels.passwordRequireUppercase} value={policy.passwordRequireUppercase} onChange={v => update('passwordRequireUppercase', v)} />
          <Toggle label={labels.passwordRequireNumber} value={policy.passwordRequireNumber} onChange={v => update('passwordRequireNumber', v)} />
          <Toggle label={labels.passwordRequireSpecial} value={policy.passwordRequireSpecial} onChange={v => update('passwordRequireSpecial', v)} />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="mb-4 font-bold">حفاظت از ورود</h3>
        <div className="grid gap-4">
          <NumberField label={labels.maxLoginAttempts} value={policy.maxLoginAttempts} min={1} max={20} onChange={v => update('maxLoginAttempts', v)} />
          <NumberField label={labels.lockoutMinutes} value={policy.lockoutMinutes} min={1} max={1440} onChange={v => update('lockoutMinutes', v)} />
          <NumberField label={labels.rateLimitPerMinute} value={policy.rateLimitPerMinute} min={10} max={10000} onChange={v => update('rateLimitPerMinute', v)} />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="mb-4 font-bold">مدیریت نشست</h3>
        <div className="grid gap-4">
          <NumberField label={labels.sessionTimeoutMinutes} value={policy.sessionTimeoutMinutes} min={5} max={10080} onChange={v => update('sessionTimeoutMinutes', v)} />
          <NumberField label={labels.maxConcurrentSessions} value={policy.maxConcurrentSessions} min={1} max={20} onChange={v => update('maxConcurrentSessions', v)} />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="mb-4 font-bold">ثبت و پایش امنیتی</h3>
        <Toggle label={labels.auditSecurityEvents} value={policy.auditSecurityEvents} onChange={v => update('auditSecurityEvents', v)} />
        <p className="mt-3 text-xs leading-6 text-gray-500">رویدادهای مهم امنیتی باید برای بررسی و Audit قابل ردیابی باشند.</p>
      </section>
    </div>

    {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {message && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
    <div className="flex justify-end"><button disabled={saving} onClick={() => void save()} className="rounded-xl bg-cyan-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'در حال ذخیره...' : 'ذخیره سیاست‌های امنیتی'}</button></div>
  </div>;
};

const NumberField: React.FC<{label:string;value:number;min:number;max:number;onChange:(v:number)=>void}> = ({label,value,min,max,onChange}) => <label className="block"><span className="mb-2 block text-sm font-medium">{label}</span><input type="number" min={min} max={max} value={value} onChange={e=>onChange(Math.min(max,Math.max(min,Number(e.target.value)||min)))} className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-500" /></label>;
const Toggle: React.FC<{label:string;value:boolean;onChange:(v:boolean)=>void}> = ({label,value,onChange}) => <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[var(--card-border-color)] p-4"><span className="text-sm">{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)} className="h-5 w-5 accent-cyan-600" /></label>;

export default AdminSecurityPanel;
