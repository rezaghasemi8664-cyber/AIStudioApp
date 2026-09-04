import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as adminService from '../services/adminService';
import type { AdminDashboardStats } from '../types';
import UserManagementLegacy from './UserManagementLegacy';
import {
  ChartBarIcon,
  UserGroupIcon,
  BriefcaseIcon,
  Cog6ToothIcon,
  BellIcon,
  ShieldCheckIcon,
  PresentationChartLineIcon,
  ClipboardDocumentIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
} from './Icons';

interface AdminPanelProps {
  isOnline: boolean;
  onMessageUpdate: () => void;
  onlineCount: number;
}

type AdminSection =
  | 'dashboard'
  | 'users'
  | 'subscriptions'
  | 'analysis'
  | 'market'
  | 'scalping'
  | 'ai'
  | 'prompts'
  | 'history'
  | 'notifications'
  | 'monitoring'
  | 'reports'
  | 'security'
  | 'settings'
  | 'maintenance'
  | 'updates'
  | 'backup'
  | 'payments';

interface ModuleItem {
  id: AdminSection;
  title: string;
  description: string;
  icon: React.ReactNode;
  available?: boolean;
}

const modules: ModuleItem[] = [
  { id: 'dashboard', title: 'داشبورد مدیریتی', description: 'نمای کلی عملکرد سامانه و شاخص‌های کلیدی', icon: <ChartBarIcon /> , available: true },
  { id: 'users', title: 'مدیریت کاربران', description: 'کاربران، نقش‌ها، دسترسی و حساب‌ها', icon: <UserGroupIcon />, available: true },
  { id: 'subscriptions', title: 'اشتراک‌ها و اعتبار', description: 'مدت اعتبار، سقف تحلیل و وضعیت اشتراک', icon: <BriefcaseIcon />, available: true },
  { id: 'analysis', title: 'مدیریت تحلیل‌ها', description: 'کنترل تحلیل‌ها، محدودیت‌ها و مصرف', icon: <MagnifyingGlassIcon /> },
  { id: 'market', title: 'مدیریت بازار', description: 'شاخص‌ها، داده‌های بازار و خلاصه بازار', icon: <GlobeAltIcon /> },
  { id: 'scalping', title: 'نوسان‌گیری', description: 'تنظیمات و کنترل موتور فرصت‌های نوسان‌گیری', icon: <ChartBarIcon /> },
  { id: 'ai', title: 'هوش مصنوعی', description: 'مدل‌ها، سرویس‌ها و تنظیمات هوش مصنوعی', icon: <PresentationChartLineIcon /> },
  { id: 'prompts', title: 'مدیریت پرامپت‌ها', description: 'نسخه‌بندی و مدیریت پرامپت‌های تحلیلی', icon: <ClipboardDocumentIcon /> },
  { id: 'history', title: 'تاریخچه تحلیل‌ها', description: 'جستجو، مشاهده و مدیریت سوابق تحلیل', icon: <ClipboardDocumentIcon /> },
  { id: 'notifications', title: 'اطلاع‌رسانی', description: 'اطلاعیه‌ها، پیام‌ها و اعلان‌های کاربران', icon: <BellIcon /> },
  { id: 'monitoring', title: 'مانیتورینگ سیستم', description: 'وضعیت سرویس، دیتابیس، API و منابع سرور', icon: <PresentationChartLineIcon /> },
  { id: 'reports', title: 'گزارش‌ها', description: 'گزارش کاربران، تحلیل‌ها و مصرف سامانه', icon: <ChartBarIcon /> },
  { id: 'security', title: 'امنیت و دسترسی', description: 'نقش‌ها، سطح دسترسی، نشست‌ها و رویدادهای امنیتی', icon: <ShieldCheckIcon /> },
  { id: 'settings', title: 'تنظیمات سامانه', description: 'تنظیمات عمومی و پیکربندی امکانات', icon: <Cog6ToothIcon /> },
  { id: 'maintenance', title: 'حالت تعمیرات', description: 'قفل دسترسی کاربران هنگام نگهداری سامانه', icon: <LockClosedIcon /> },
  { id: 'updates', title: 'بروزرسانی و استقرار', description: 'نسخه، Build، استقرار و وضعیت بروزرسانی', icon: <PresentationChartLineIcon /> },
  { id: 'backup', title: 'پشتیبان‌گیری و بازیابی', description: 'مدیریت Backup پایگاه داده و تنظیمات', icon: <BriefcaseIcon /> },
  { id: 'payments', title: 'پرداخت‌ها و تراکنش‌ها', description: 'پرداخت، تمدید و سوابق مالی', icon: <BriefcaseIcon /> },
];

const fmt = (value: number | undefined | null) =>
  Number(value || 0).toLocaleString('fa-IR');

const StatCard: React.FC<{ title: string; value: number; hint: string }> = ({ title, value, hint }) => (
  <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 shadow-sm">
    <div className="text-sm text-gray-500 dark:text-gray-400">{title}</div>
    <div className="mt-2 text-3xl font-extrabold tracking-tight">{fmt(value)}</div>
    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{hint}</div>
  </div>
);

const AdminPanel: React.FC<AdminPanelProps> = ({ isOnline, onMessageUpdate, onlineCount }) => {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [dashboard, setDashboard] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.getDashboard();
      if (!data) throw new Error('داده داشبورد مدیریتی دریافت نشد.');
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت داشبورد مدیریتی.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeModule = useMemo(() => modules.find((item) => item.id === section) || modules[0], [section]);

  const renderSection = () => {
    if (section === 'users' || section === 'subscriptions') {
      return <UserManagementLegacy isOnline={isOnline} onMessageUpdate={onMessageUpdate} onlineCount={onlineCount} />;
    }

    if (section === 'dashboard') {
      if (loading) return <div className="py-16 text-center text-gray-500">در حال بارگذاری داشبورد مدیریتی...</div>;
      if (error) {
        return (
          <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6 text-center">
            <p className="font-semibold text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => void loadDashboard()} className="mt-4 rounded-lg bg-cyan-600 px-5 py-2 text-white">تلاش مجدد</button>
          </div>
        );
      }

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="کل کاربران" value={dashboard?.totalUsers || 0} hint="حساب‌های ثبت‌شده فعال و غیرفعال" />
            <StatCard title="اشتراک‌های فعال" value={dashboard?.activeSubscriptions || 0} hint="کاربران دارای اعتبار جاری" />
            <StatCard title="کل تحلیل‌ها" value={dashboard?.totalAnalyses || 0} hint="سوابق تحلیل ثبت‌شده" />
            <StatCard title="کل کلیدهای API" value={dashboard?.totalApiKeys || 0} hint="کلیدهای فعال و ثبت‌شده" />
          </div>

          <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-lg font-bold">وضعیت سامانه</h3>
                <p className="text-sm text-gray-500 mt-1">نمای سریع برای کنترل روزانه نرم‌افزار</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                {isOnline ? 'سرویس آنلاین' : 'اتصال قطع است'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-xs text-gray-500">کاربران آنلاین</div><div className="text-2xl font-bold mt-1">{fmt(onlineCount)}</div></div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-xs text-gray-500">کاربران اخیر</div><div className="text-2xl font-bold mt-1">{fmt(dashboard?.recentUsers?.length)}</div></div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-xs text-gray-500">ماژول‌های مدیریتی</div><div className="text-2xl font-bold mt-1">{fmt(modules.length)}</div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
            <h3 className="text-lg font-bold mb-4">دسترسی سریع</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {['users', 'subscriptions', 'notifications'].map((id) => {
                const item = modules.find((m) => m.id === id)!;
                return <button key={id} onClick={() => setSection(item.id)} className="flex items-center gap-3 rounded-xl border border-[var(--card-border-color)] p-4 text-right hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition"><span className="text-cyan-500">{item.icon}</span><span><span className="block font-semibold">{item.title}</span><span className="block text-xs text-gray-500 mt-1">{item.description}</span></span></button>;
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-[var(--card-bg)] p-10 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 flex items-center justify-center">{activeModule.icon}</div>
        <h2 className="text-xl font-bold">{activeModule.title}</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">{activeModule.description}</p>
        <p className="mt-5 text-sm text-gray-500">این بخش در معماری پنل مدیریت تعریف شده و در مرحله بعد به API اختصاصی خود متصل می‌شود.</p>
      </div>
    );
  };

  return (
    <div dir="rtl" className="mx-auto max-w-[1600px] space-y-5">
      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3"><ShieldCheckIcon className="h-7 w-7 text-cyan-500" /><h1 className="text-2xl font-extrabold">مرکز کنترل مدیریت رونیا</h1></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">مدیریت متمرکز کاربران، اشتراک، تحلیل، بازار، امنیت و زیرساخت نرم‌افزار</p>
          </div>
          <div className="flex items-center gap-2 text-xs"><span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />{isOnline ? 'اتصال برقرار است' : 'اتصال قطع است'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-start">
        <aside className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-3 lg:sticky lg:top-4">
          <div className="px-3 py-2 text-xs font-bold text-gray-500">بخش‌های پنل مدیریت</div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-1 max-h-[70vh] overflow-auto">
            {modules.map((item) => {
              const selected = section === item.id;
              return <button key={item.id} onClick={() => setSection(item.id)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition ${selected ? 'bg-cyan-600 text-white shadow' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}><span className="shrink-0">{item.icon}</span><span className="truncate">{item.title}</span></button>;
            })}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{activeModule.title}</h2><p className="text-xs text-gray-500 mt-1">{activeModule.description}</p></div>{section === 'dashboard' && <button onClick={() => void loadDashboard()} className="rounded-lg border border-[var(--card-border-color)] px-4 py-2 text-sm hover:border-cyan-500">به‌روزرسانی</button>}</div>
          {renderSection()}
        </section>
      </div>
    </div>
  );
};

export default AdminPanel;
