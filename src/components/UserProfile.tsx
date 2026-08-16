import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { StoredUser, DirectMessage, SubscriptionInfo } from '../types';
import * as authService from '../services/authService';
import * as messageService from '../services/messageService';
import * as guestSettingsService from '../services/guestSettingsService';
import * as profileService from '../services/profileService';
import { useNotification } from './NotificationSystem';
import PasswordChangeForm from './PasswordChangeForm';
import {
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  CalendarDaysIcon,
  PaperAirplaneIcon,
  EnvelopeIcon,
  UserCircleIcon,
  UserPlusIcon,
  TrashIcon,
  XCircleIcon,
  PaperclipIcon,
} from './Icons';

// =============================================================================
// Props
// =============================================================================
interface UserProfileProps {
  currentUser: StoredUser;
  onProfileUpdate: (updatedUser: StoredUser) => void;
  onPasswordChange: (currentPass: string, newPass: string) => Promise<void>;
}

// =============================================================================
// Helper: Base64 file converter
// =============================================================================
const fileToBase64 = (file: File): Promise<string | ArrayBuffer | null> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

// =============================================================================
// InfoRow — نمایش/ویرایش یک ردیف اطلاعات
// =============================================================================
const InfoRow: React.FC<{
  label: string;
  value: string;
  isEditing?: boolean;
  onChange?: (newValue: string) => void;
}> = ({ label, value, isEditing = false, onChange }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 border-b border-[var(--card-border-color)]">
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      {isEditing ? (
        <dd className="mt-1 text-sm sm:mt-0">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange && onChange(e.target.value)}
            className="w-full sm:w-auto border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2"
            style={
              {
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-color)',
                borderColor: 'var(--input-border)',
                '--tw-ring-color': 'var(--input-focus-ring)',
              } as React.CSSProperties
            }
            autoFocus={label === 'نام'}
          />
        </dd>
      ) : (
        <dd className="mt-1 text-sm sm:mt-0">{value}</dd>
      )}
    </div>
  );
};

// =============================================================================
// SubscriptionCard — کارت وضعیت اشتراک
// =============================================================================
const SubscriptionCard: React.FC<{
  currentUser: StoredUser;
  serverSubscription: SubscriptionInfo | null;
}> = ({ currentUser, serverSubscription }) => {
  const subData = serverSubscription || {
    isSubscriptionActive: currentUser.isSubscriptionActive || false,
    subscriptionStart: currentUser.subscriptionStart || null,
    subscriptionEnd: currentUser.subscriptionEnd || null,
    subscriptionMonths: currentUser.subscriptionMonths || 0,
    analysisLimit: currentUser.analysisLimit || currentUser.analysisLimit24h || 0,
    remainingDays: currentUser.remainingDays || 0,
    analysisCount: 0,
  };

  const isActive = subData.isSubscriptionActive;

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const progressPercent = useMemo(() => {
    if (!subData.subscriptionStart || !subData.subscriptionEnd) return 0;
    const start = new Date(subData.subscriptionStart).getTime();
    const end = new Date(subData.subscriptionEnd).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.round(((now - start) / (end - start)) * 100);
  }, [subData]);

  return (
    <div
      data-style-id="user-profile-subscription-card"
      data-style-name="کارت وضعیت اشتراک"
      className="p-6 rounded-lg shadow-md"
      style={{
        backgroundColor: 'var(--user-profile-subscription-card-bg, var(--card-bg))',
        color: 'var(--user-profile-subscription-card-color, var(--card-color))',
        borderWidth: 'var(--user-profile-subscription-card-border-width, 1px)',
        borderStyle: 'var(--user-profile-subscription-card-border-style, solid)',
        borderColor: 'var(--user-profile-subscription-card-border-color, var(--card-border-color))',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CalendarDaysIcon className="h-5 w-5" />
          وضعیت اشتراک
        </h3>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            isActive
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
          }`}
        >
          {isActive ? '✅ فعال' : '❌ غیرفعال'}
        </span>
      </div>

      <dl className="space-y-0">
        <div className="flex justify-between py-3 border-b border-[var(--card-border-color)]">
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
            تاریخ شروع
          </dt>
          <dd className="text-sm">{formatDate(subData.subscriptionStart)}</dd>
        </div>
        <div className="flex justify-between py-3 border-b border-[var(--card-border-color)]">
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
            تاریخ پایان
          </dt>
          <dd className="text-sm">{formatDate(subData.subscriptionEnd)}</dd>
        </div>
        <div className="flex justify-between py-3 border-b border-[var(--card-border-color)]">
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
            مدت اشتراک
          </dt>
          <dd className="text-sm">
            {subData.subscriptionMonths > 0
              ? `${subData.subscriptionMonths} ماه`
              : '—'}
          </dd>
        </div>
        <div className="flex justify-between py-3 border-b border-[var(--card-border-color)]">
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
            روزهای باقیمانده
          </dt>
          <dd
            className={`text-sm font-bold ${
              subData.remainingDays <= 7 && subData.remainingDays > 0
                ? 'text-orange-600 dark:text-orange-400'
                : subData.remainingDays <= 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            }`}
          >
            {subData.remainingDays > 0
              ? `${subData.remainingDays} روز`
              : subData.remainingDays === 0
              ? 'امروز منقضی می‌شود'
              : 'منقضی شده'}
          </dd>
        </div>
        <div className="flex justify-between py-3 border-b border-[var(--card-border-color)]">
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
            سقف تحلیل
          </dt>
          <dd className="text-sm">
            {subData.analysisLimit > 0
              ? `${subData.analysisLimit} تحلیل`
              : 'نامحدود'}
          </dd>
        </div>
        {serverSubscription && (
          <div className="flex justify-between py-3">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              تحلیل‌های انجام‌شده
            </dt>
            <dd className="text-sm">
              {subData.analysisCount} از {subData.analysisLimit || '∞'}
            </dd>
          </div>
        )}
      </dl>

      {/* نوار پیشرفت */}
      {isActive && subData.subscriptionStart && subData.subscriptionEnd && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>پیشرفت اشتراک</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progressPercent >= 90
                  ? 'bg-red-500'
                  : progressPercent >= 70
                  ? 'bg-orange-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Main Component: UserProfile — v10.1
// =============================================================================
const UserProfile: React.FC<UserProfileProps> = ({
  currentUser,
  onProfileUpdate,
  onPasswordChange,
}) => {
  // =====================
  // Tab type
  // =====================
  type ProfileTab = 'info' | 'subscription' | 'message' | 'guest-management';

  const [activeTab, setActiveTab] = useState<ProfileTab>('info');
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // =====================
  // Server subscription data
  // =====================
  const [serverSubscription, setServerSubscription] =
    useState<SubscriptionInfo | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  // =====================
  // Info Tab State
  // =====================
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editData, setEditData] = useState({
    firstName: currentUser.firstName,
    lastName: currentUser.lastName,
    mobile: currentUser.mobile,
  });

  // =====================
  // Guest Settings State (Admin only)
  // =====================
  const [guestValidityDays, setGuestValidityDays] = useState(7);
  const [guestUsers, setGuestUsers] = useState<StoredUser[]>([]);

  // =====================
  // Guest creation form state (Admin only)
  // =====================
  const [newGuestUsername, setNewGuestUsername] = useState('');
  const [newGuestPassword, setNewGuestPassword] = useState('');
  const [newGuestFirstName, setNewGuestFirstName] = useState('');
  const [newGuestLastName, setNewGuestLastName] = useState('');
  const [guestCreating, setGuestCreating] = useState(false);

  // =====================
  // Message Tab State
  // =====================
  const defaultMessage = `کاربر گرامی ${currentUser.firstName} ${currentUser.lastName} با نام کاربری ${currentUser.username} درخواست تمدید اعتبار اکانت به مدت ...... روز را دارم.`;
  const [message, setMessage] = useState(defaultMessage);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);

  // =====================
  // 🔧 v10.1: Refresh guest users — ایمن‌سازی فراخوانی getGuestUsers
  // =====================
  const refreshGuestUsers = async () => {
    try {
      let activeGuests: StoredUser[] = [];

      // 🔧 v10.1: بررسی وجود تابع قبل از فراخوانی
      if (typeof authService.getGuestUsers === 'function') {
        activeGuests = await authService.getGuestUsers();
      } else {
        // فال‌بک: از getUsers و فیلتر استفاده کن
        console.warn('[UserProfile] getGuestUsers not available, using getUsers fallback');
        const allUsers = await authService.getUsers();
        activeGuests = allUsers.filter(
          (u) => u.isGuest === true || u.role === 'guest',
        );
      }

      let wasCleaned = false;
      const guestsToRemove = activeGuests.filter(
        (guest) => !guest.isActive || authService.isAccountExpired(guest),
      );

      if (guestsToRemove.length > 0) {
        wasCleaned = true;
        await Promise.all(
          guestsToRemove.map((guest) => {
            if (typeof authService.deleteUser === 'function') {
              return authService.deleteUser(guest.id);
            }
            return Promise.resolve();
          }),
        );

        // دوباره بگیر
        if (typeof authService.getGuestUsers === 'function') {
          activeGuests = await authService.getGuestUsers();
        } else {
          const allUsers = await authService.getUsers();
          activeGuests = allUsers.filter(
            (u) => u.isGuest === true || u.role === 'guest',
          );
        }
      }

      setGuestUsers(activeGuests);
      if (wasCleaned) {
        addNotification(
          'کاربران میهمان منقضی شده به صورت خودکار حذف شدند.',
          'info',
        );
      }
    } catch (err) {
      console.error('[UserProfile] Error refreshing guest users:', err);
      setGuestUsers([]);
    }
  };

  // =====================
  // 🔧 v10.1: Fetch subscription — مدیریت خطای 404
  // =====================
  const fetchSubscription = async () => {
    setSubscriptionLoading(true);
    try {
      const sub = await profileService.getSubscriptionStatus();
      setServerSubscription(sub);
    } catch (error: any) {
      // 🔧 v10.1: 404 را به عنوان خطای بحرانی در نظر نگیر
      const is404 =
        error?.status === 404 ||
        error?.response?.status === 404 ||
        (error?.message && error.message.includes('404'));

      if (is404) {
        console.warn('[UserProfile] /profile/subscription endpoint not found (404). Using local data.');
      } else {
        console.warn('[UserProfile] Could not fetch subscription from server:', error);
      }
      // Fallback: از داده‌های محلی استفاده می‌شود (serverSubscription = null)
    } finally {
      setSubscriptionLoading(false);
    }
  };

  // =====================
  // Effects
  // =====================
  useEffect(() => {
    if (currentUser.isAdmin) {
      setGuestValidityDays(guestSettingsService.getGuestValidityDays());
      refreshGuestUsers();
    }
    fetchSubscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.isAdmin]);

  useEffect(() => {
    setEditData({
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      mobile: currentUser.mobile,
    });
  }, [currentUser]);

  const validityInfo = useMemo(
    () => authService.getUserValidityInfo(currentUser),
    [currentUser],
  );

  // =====================
  // 🔧 v10.1: handleSaveInfo — رفع خطای [object Object]
  // =====================
  const handleSaveInfo = async () => {
    try {
      let updatedUser: StoredUser;

      // 🔧 v10.1: ابتدا سعی کن از updateProfile استفاده کنی (برای خود کاربر)
      if (typeof authService.updateProfile === 'function') {
        updatedUser = await authService.updateProfile({
          firstName: editData.firstName,
          lastName: editData.lastName,
          mobile: editData.mobile,
        });
      } else {
        // فال‌بک: از updateUser با ارسال صحیح userId استفاده کن
        updatedUser = await authService.updateUser(currentUser.id, {
          firstName: editData.firstName,
          lastName: editData.lastName,
          mobile: editData.mobile,
        });
      }

      onProfileUpdate(updatedUser);
      addNotification('اطلاعات با موفقیت به‌روزرسانی شد.', 'success');
      setIsEditingInfo(false);
    } catch (err: any) {
      console.error('[UserProfile] handleSaveInfo error:', err);
      addNotification(err.message || 'خطا در ذخیره اطلاعات', 'error');
    }
  };

  const handleCancelEdit = () => {
    setIsEditingInfo(false);
    setEditData({
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      mobile: currentUser.mobile,
    });
  };

  const handleGuestValidityChange = () => {
    guestSettingsService.setGuestValidityDays(guestValidityDays);
    addNotification(
      `مدت اعتبار پیش‌فرض برای کاربران میهمان به ${guestValidityDays} روز تغییر یافت.`,
      'success',
    );
  };

  const handleCreateGuest = async () => {
    if (!newGuestUsername.trim()) {
      addNotification('لطفاً نام کاربری میهمان را وارد کنید.', 'error');
      return;
    }
    if (!newGuestPassword.trim()) {
      addNotification('لطفاً رمز عبور میهمان را وارد کنید.', 'error');
      return;
    }

    setGuestCreating(true);
    try {
      if (typeof authService.createGuestUser === 'function') {
        await authService.createGuestUser({
          username: newGuestUsername.trim(),
          password: newGuestPassword.trim(),
          validityDays: guestValidityDays,
          firstName: newGuestFirstName.trim() || 'کاربر',
          lastName: newGuestLastName.trim() || 'میهمان',
        });
      } else {
        addNotification('امکان ایجاد کاربر میهمان فراهم نیست.', 'error');
        return;
      }

      addNotification('کاربر میهمان با موفقیت ایجاد شد.', 'success');
      setNewGuestUsername('');
      setNewGuestPassword('');
      setNewGuestFirstName('');
      setNewGuestLastName('');
      await refreshGuestUsers();
    } catch (err: any) {
      addNotification(err.message || 'خطا در ایجاد کاربر میهمان', 'error');
    } finally {
      setGuestCreating(false);
    }
  };

  const handleDeleteGuest = async (guest: StoredUser) => {
    if (
      window.confirm(`آیا از حذف کاربر میهمان ${guest.username} مطمئن هستید؟`)
    ) {
      if (typeof authService.deleteUser === 'function') {
        await authService.deleteUser(guest.id);
      }
      await refreshGuestUsers();
      addNotification('کاربر میهمان با موفقیت حذف شد.', 'info');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessageLoading(true);
    try {
      let attachmentData: DirectMessage['attachment'] | undefined = undefined;
      if (attachment) {
        const base64 = (await fileToBase64(attachment)) as string;
        attachmentData = {
          name: attachment.name,
          type: attachment.type,
          data: base64,
        };
      }
      messageService.sendMessageToAdmin(currentUser, message, attachmentData);
      addNotification('پیام شما با موفقیت برای ادمین ارسال شد.', 'success');
      setMessage(defaultMessage);
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      addNotification('خطا در ارسال پیام.', 'error');
    } finally {
      setMessageLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        addNotification(
          'فرمت فایل معتبر نیست. لطفاً از pdf, jpg, jpeg استفاده کنید.',
          'error',
        );
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        addNotification('حجم فایل نباید بیشتر از ۵ مگابایت باشد.', 'error');
        return;
      }
      setAttachment(file);
    }
  };

  // =====================
  // TabButton sub-component
  // =====================
  const TabButton: React.FC<{
    tabId: ProfileTab;
    label: string;
    icon: React.ReactElement;
  }> = ({ tabId, label, icon }) => {
    const isActiveTab = activeTab === tabId;
    return (
      <button
        onClick={() => setActiveTab(tabId)}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          isActiveTab
            ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
        }`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  // ==========================================================================
  //  ✅ RENDER
  // ==========================================================================
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">
        پروفایل کاربری
      </h2>

      {/* ===== نوار تب‌ها ===== */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav
          className="-mb-px flex space-x-4 rtl:space-x-reverse overflow-x-auto"
          aria-label="Tabs"
        >
          <TabButton
            tabId="info"
            label="اطلاعات کاربری"
            icon={<UserCircleIcon className="h-5 w-5" />}
          />
          <TabButton
            tabId="subscription"
            label="وضعیت اشتراک"
            icon={<CalendarDaysIcon className="h-5 w-5" />}
          />
          {!currentUser.isAdmin && (
            <TabButton
              tabId="message"
              label="پیغام به ادمین"
              icon={<EnvelopeIcon className="h-5 w-5" />}
            />
          )}
          {currentUser.isAdmin && (
            <TabButton
              tabId="guest-management"
              label="مدیریت میهمان‌ها"
              icon={<UserPlusIcon className="h-5 w-5" />}
            />
          )}
        </nav>
      </div>

      {/* ===== محتوای تب‌ها ===== */}

      {/* ─── تب اطلاعات کاربری ─── */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          {/* کارت اطلاعات */}
          <div
            data-style-id="user-profile-info-card"
            data-style-name="کارت اطلاعات کاربری"
            className="p-6 rounded-lg shadow-md"
            style={{
              backgroundColor: 'var(--user-profile-info-card-bg, var(--card-bg))',
              color: 'var(--user-profile-info-card-color, var(--card-color))',
              borderWidth: 'var(--user-profile-info-card-border-width, 1px)',
              borderStyle: 'var(--user-profile-info-card-border-style, solid)',
              borderColor: 'var(--user-profile-info-card-border-color, var(--card-border-color))',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <UserCircleIcon className="h-5 w-5" />
                اطلاعات شخصی
              </h3>
              {!isEditingInfo ? (
                <button
                  onClick={() => setIsEditingInfo(true)}
                  className="flex items-center gap-1 text-sm text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  <PencilIcon className="h-4 w-4" />
                  ویرایش
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveInfo}
                    className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400 hover:underline"
                  >
                    <CheckIcon className="h-4 w-4" />
                    ذخیره
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400 hover:underline"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    انصراف
                  </button>
                </div>
              )}
            </div>

            <dl className="space-y-0">
              <InfoRow
                label="نام"
                value={editData.firstName}
                isEditing={isEditingInfo}
                onChange={(v) => setEditData((prev) => ({ ...prev, firstName: v }))}
              />
              <InfoRow
                label="نام خانوادگی"
                value={editData.lastName}
                isEditing={isEditingInfo}
                onChange={(v) => setEditData((prev) => ({ ...prev, lastName: v }))}
              />
              <InfoRow label="نام کاربری" value={currentUser.username || '—'} />
              <InfoRow label="ایمیل" value={currentUser.email || '—'} />
              <InfoRow
                label="موبایل"
                value={editData.mobile}
                isEditing={isEditingInfo}
                onChange={(v) => setEditData((prev) => ({ ...prev, mobile: v }))}
              />
              <InfoRow
                label="نقش"
                value={
                  currentUser.isAdmin
                    ? '🛡️ مدیر سیستم'
                    : currentUser.isGuest
                    ? '👤 میهمان'
                    : '👤 کاربر عادی'
                }
              />
              <InfoRow
                label="تاریخ عضویت"
                value={
                  currentUser.registrationDate
                    ? new Date(currentUser.registrationDate).toLocaleDateString('fa-IR')
                    : '—'
                }
              />

              {/* نمایش وضعیت اعتبار */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 border-b border-[var(--card-border-color)]">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  وضعیت اعتبار
                </dt>
                <dd className="mt-1 text-sm sm:mt-0">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                      validityInfo.statusColor === 'green'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                        : validityInfo.statusColor === 'orange'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400'
                        : validityInfo.statusColor === 'yellow'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400'
                        : validityInfo.statusColor === 'red'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {validityInfo.statusText}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* فرم تغییر رمز عبور */}
          <PasswordChangeForm onPasswordChange={onPasswordChange} />
        </div>
      )}

      {/* ─── تب وضعیت اشتراک ─── */}
      {activeTab === 'subscription' && (
        <div>
          {subscriptionLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            </div>
          ) : (
            <SubscriptionCard
              currentUser={currentUser}
              serverSubscription={serverSubscription}
            />
          )}
        </div>
      )}

      {/* ─── تب پیغام به ادمین ─── */}
      {activeTab === 'message' && !currentUser.isAdmin && (
        <div
          data-style-id="user-profile-message-card"
          data-style-name="کارت ارسال پیام"
          className="p-6 rounded-lg shadow-md"
          style={{
            backgroundColor: 'var(--user-profile-message-card-bg, var(--card-bg))',
            color: 'var(--user-profile-message-card-color, var(--card-color))',
            borderWidth: 'var(--user-profile-message-card-border-width, 1px)',
            borderStyle: 'var(--user-profile-message-card-border-style, solid)',
            borderColor: 'var(--user-profile-message-card-border-color, var(--card-border-color))',
          }}
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <EnvelopeIcon className="h-5 w-5" />
            ارسال پیام به مدیر سیستم
          </h3>

          <form onSubmit={handleSendMessage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">متن پیام</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                }}
                required
              />
            </div>

            {/* پیوست */}
            <div>
              <label className="block text-sm font-medium mb-1">
                پیوست (اختیاری — PDF, JPG)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg cursor-pointer border hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <PaperclipIcon className="h-4 w-4" />
                  <span>{attachment ? attachment.name : 'انتخاب فایل'}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {attachment && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachment(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <XCircleIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={messageLoading || !message.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
            >
              {messageLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <PaperAirplaneIcon className="h-4 w-4" />
              )}
              ارسال پیام
            </button>
          </form>
        </div>
      )}

      {/* ─── تب مدیریت میهمان‌ها (فقط ادمین) ─── */}
      {activeTab === 'guest-management' && currentUser.isAdmin && (
        <div className="space-y-6">
          {/* تنظیمات اعتبار پیش‌فرض */}
          <div
            className="p-6 rounded-lg shadow-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              color: 'var(--card-color)',
              border: '1px solid var(--card-border-color)',
            }}
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CalendarDaysIcon className="h-5 w-5" />
              تنظیمات اعتبار پیش‌فرض
            </h3>
            <div className="flex items-center gap-3">
              <label className="text-sm">مدت اعتبار (روز):</label>
              <input
                type="number"
                min={1}
                max={365}
                value={guestValidityDays}
                onChange={(e) => setGuestValidityDays(Number(e.target.value))}
                className="w-20 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                }}
              />
              <button
                onClick={handleGuestValidityChange}
                className="px-4 py-1 bg-cyan-600 text-white rounded text-sm hover:bg-cyan-700 transition-colors"
              >
                اعمال
              </button>
            </div>
          </div>

          {/* فرم ایجاد کاربر میهمان */}
          <div
            className="p-6 rounded-lg shadow-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              color: 'var(--card-color)',
              border: '1px solid var(--card-border-color)',
            }}
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <UserPlusIcon className="h-5 w-5" />
              ایجاد کاربر میهمان جدید
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">نام کاربری *</label>
                <input
                  type="text"
                  value={newGuestUsername}
                  onChange={(e) => setNewGuestUsername(e.target.value)}
                  placeholder="username"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-color)',
                    borderColor: 'var(--input-border)',
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">رمز عبور *</label>
                <input
                  type="text"
                  value={newGuestPassword}
                  onChange={(e) => setNewGuestPassword(e.target.value)}
                  placeholder="password"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-color)',
                    borderColor: 'var(--input-border)',
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">نام</label>
                <input
                  type="text"
                  value={newGuestFirstName}
                  onChange={(e) => setNewGuestFirstName(e.target.value)}
                  placeholder="نام"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-color)',
                    borderColor: 'var(--input-border)',
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">نام خانوادگی</label>
                <input
                  type="text"
                  value={newGuestLastName}
                  onChange={(e) => setNewGuestLastName(e.target.value)}
                  placeholder="نام خانوادگی"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-color)',
                    borderColor: 'var(--input-border)',
                  }}
                />
              </div>
            </div>
            <button
              onClick={handleCreateGuest}
              disabled={guestCreating}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {guestCreating ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <UserPlusIcon className="h-4 w-4" />
              )}
              ایجاد کاربر میهمان
            </button>
          </div>

          {/* لیست کاربران میهمان */}
          <div
            className="p-6 rounded-lg shadow-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              color: 'var(--card-color)',
              border: '1px solid var(--card-border-color)',
            }}
          >
            <h3 className="text-lg font-semibold mb-4">
              کاربران میهمان ({guestUsers.length})
            </h3>
            {guestUsers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                هیچ کاربر میهمان فعالی وجود ندارد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right border-b border-[var(--card-border-color)]">
                      <th className="py-2 pr-2">نام کاربری</th>
                      <th className="py-2">نام</th>
                      <th className="py-2">وضعیت</th>
                      <th className="py-2">روزهای باقی‌مانده</th>
                      <th className="py-2">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guestUsers.map((guest) => {
                      const guestValidity = authService.getUserValidityInfo(guest);
                      return (
                        <tr
                          key={guest.id}
                          className="border-b border-[var(--card-border-color)] hover:bg-gray-50 dark:hover:bg-gray-700/30"
                        >
                          <td className="py-2 pr-2">{guest.username}</td>
                          <td className="py-2">
                            {guest.firstName} {guest.lastName}
                          </td>
                          <td className="py-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                guest.isActive
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                              }`}
                            >
                              {guest.isActive ? 'فعال' : 'غیرفعال'}
                            </span>
                          </td>
                          <td className="py-2">
                            <span
                              className={`text-xs font-bold ${
                                guestValidity.statusColor === 'red'
                                  ? 'text-red-600'
                                  : guestValidity.statusColor === 'orange'
                                  ? 'text-orange-600'
                                  : 'text-green-600'
                              }`}
                            >
                              {guestValidity.statusText}
                            </span>
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => handleDeleteGuest(guest)}
                              className="text-red-500 hover:text-red-700 transition-colors"
                              title="حذف"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
