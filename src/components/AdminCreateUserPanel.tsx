import React, { useEffect, useState } from 'react';
import * as adminService from '../services/adminService';
import { useNotification } from './NotificationSystem';

const input = 'w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30';

const AdminCreateUserPanel: React.FC<{ onCreated?: () => void }> = ({ onCreated }) => {
  const { addNotification } = useNotification();
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', mobile: '' });
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<adminService.AdminRole[]>([]);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    void adminService.getRoles().then((items) => {
      setRoles(items);
      const defaultRole = items.find((role) => role.name.toLowerCase() === 'user') || items.find((role) => role.name.toLowerCase() === 'member');
      if (defaultRole) setRoleId(defaultRole.id);
      else if (items.length) setRoleId(items[0].id);
    });
  }, []);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setForm({ email: '', password: '', firstName: '', lastName: '', mobile: '' });
    setIsActive(true);
  };

  const submit = async () => {
    const email = form.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addNotification('ایمیل معتبر الزامی است.', 'error');
      return;
    }
    if (form.password.length < 6) {
      addNotification('رمز عبور باید حداقل ۶ کاراکتر باشد.', 'error');
      return;
    }
    if (!form.firstName.trim() || !form.lastName.trim() || !form.mobile.trim()) {
      addNotification('نام، نام خانوادگی و شماره موبایل الزامی هستند.', 'error');
      return;
    }

    setLoading(true);
    try {
      await adminService.createUser({
        username: email,
        email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        mobile: form.mobile,
        phone: form.mobile,
        roleId,
        isActive,
      });
      addNotification('کاربر با موفقیت ایجاد شد.', 'success');
      reset();
      onCreated?.();
    } catch (error) {
      addNotification(error instanceof Error ? error.message : 'ایجاد کاربر ناموفق بود.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">ثبت کاربر جدید</h3>
          <p className="mt-1 text-sm text-gray-500">نام کاربری به‌صورت خودکار برابر ایمیل کاربر ثبت می‌شود. کد ملی در این فرم وجود ندارد.</p>
        </div>
        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400">ثبت مستقیم توسط ادمین</span>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">ایمیل</span>
          <input className={input} type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="example@email.com" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">رمز عبور</span>
          <input className={input} type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="حداقل ۶ کاراکتر" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">نام</span>
          <input className={input} type="text" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="نام" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">نام خانوادگی</span>
          <input className={input} type="text" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="نام خانوادگی" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">شماره موبایل</span>
          <input className={input} type="tel" inputMode="numeric" autoComplete="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="09xxxxxxxxx" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">نقش</span>
          <select className={input} value={roleId ?? ''} onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">نقش پیش‌فرض</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.title || role.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input id="admin-new-user-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <label htmlFor="admin-new-user-active" className="text-sm">کاربر فعال باشد</label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={reset} disabled={loading} className="rounded-xl border px-5 py-2.5 disabled:opacity-50">پاک کردن</button>
        <button type="button" onClick={() => void submit()} disabled={loading} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          {loading ? 'در حال ایجاد کاربر...' : 'ایجاد کاربر'}
        </button>
      </div>
    </div>
  );
};

export default AdminCreateUserPanel;
