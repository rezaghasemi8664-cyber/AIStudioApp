import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { DirectMessage } from '../types';
import * as messageService from '../services/messageService';
import { useNotification } from './NotificationSystem';
import {
  PlusIcon,
  KeyIcon,
  TrashIcon,
  XCircleIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
  PaperclipIcon,
  ArrowDownOnSquareIcon,
  MagnifyingGlassIcon,
} from './Icons';
import * as adminService from '../services/adminService';

interface UserManagementProps {
  isOnline: boolean;
  onMessageUpdate: () => void;
  onlineCount: number;
}

type UserRole = 'ADMIN' | 'USER';

interface ManagedUser {
  id: string | number;
  username: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
  phone?: string | null;
  nationalId?: string | null;
  bio?: string | null;
  avatar?: string | null;
  isActive: boolean;
  roleId?: number | null;
  roleName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  subscriptionDays?: number | null;
  subscriptionDays?: number | null;
  isSubscriptionActive?: boolean;
  analysisLimit?: number | null;
  analysisLimit24h?: number | null;
}

const ROLE_USER_ID = 1;
const ROLE_ADMIN_ID = 2;

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toSafeString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateFa = (value?: string | null): string => {
  const date = parseDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('fa-IR');
};

const formatDateInputValue = (value?: string | null): string => {
  const date = parseDate(value);
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getDisplayName = (user: ManagedUser): string => {
  const first = toSafeString(user.firstName).trim();
  const last = toSafeString(user.lastName).trim();
  const full = `${first} ${last}`.trim();

  if (full) return full;
  if (user.name?.trim()) return user.name.trim();
  return user.username;
};

const getRoleLabel = (user: ManagedUser): string => {
  const roleName = toSafeString(user.roleName).toUpperCase();
  if (roleName === 'ADMIN') return 'ادمین';
  return 'کاربر';
};

const isAdminUser = (user: ManagedUser): boolean => {
  return toSafeString(user.roleName).toUpperCase() === 'ADMIN' || user.roleId === ROLE_ADMIN_ID;
};

const getSubscriptionStatus = (
  user: ManagedUser
): { text: string; color: string } => {
  if (!user.isActive) {
    return { text: 'غیرفعال توسط ادمین', color: 'bg-gray-400 dark:bg-gray-600' };
  }

  if (user.isSubscriptionActive === false) {
    return { text: 'اشتراک غیرفعال', color: 'bg-yellow-500' };
  }

  const endDate = parseDate(user.subscriptionEnd);
  if (endDate && new Date() > endDate) {
    return { text: 'منقضی شده', color: 'bg-red-500' };
  }

  if (user.subscriptionStart || user.subscriptionEnd || user.subscriptionDays) {
    return { text: 'اعتبار دارد', color: 'bg-green-500' };
  }

  return { text: 'در انتظار تخصیص اعتبار', color: 'bg-yellow-500' };
};

const getRemainingValidityInfo = (
  user: ManagedUser
): { remainingDaysText: string; badgeColor: string } => {
  const remainingDays = Number(user.subscriptionDays ?? user.remainingDays ?? 0);
  if (!Number.isFinite(remainingDays) || remainingDays <= 0) {
    return { remainingDaysText: 'منقضی شده', badgeColor: 'bg-red-100 text-red-700 dark:bg-red-900\/40 dark:text-red-300' };
  }
  if (remainingDays <= 7) {
    return { remainingDaysText: `${remainingDays} روز`, badgeColor: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900\/40 dark:text-yellow-300' };
  }
  return { remainingDaysText: `${remainingDays} روز`, badgeColor: 'bg-green-100 text-green-700 dark:bg-green-900\/40 dark:text-green-300' };
};



const UserManagement: React.FC<UserManagementProps> = ({
  isOnline,
  onMessageUpdate,
  onlineCount,
}) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addNotification } = useNotification();

  // current user
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Create user form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [bio, setBio] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('USER');
  const [subscriptionDays, setSubscriptionDays] = useState('30');
  const [analysisLimit, setAnalysisLimit] = useState('20');
  const [analysisLimit24h, setAnalysisLimit24h] = useState('20');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'user'>('all');

  // Inline editing
  const [editingMobile, setEditingMobile] = useState<{ userId: string; value: string } | null>(null);
  const [editingSubscriptionStart, setEditingSubscriptionStart] = useState<{ userId: string; value: string } | null>(null);
  const [editingSubscriptionDays, setEditingSubscriptionDays] = useState<{ userId: string; value: string } | null>(null);
  const [editingAnalysisSettings, setEditingAnalysisSettings] = useState<{
    userId: string;
    analysisLimit: string;
    analysisLimit24h: string;
  } | null>(null);

  // Modals
  const [userToReset, setUserToReset] = useState<ManagedUser | null>(null);
  const [newPasswordForReset, setNewPasswordForReset] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Message modal
  const [viewingMessage, setViewingMessage] = useState<DirectMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  const loadCurrentUserId = useCallback(() => {
    try {
      const raw =
        localStorage.getItem('user') ||
        localStorage.getItem('currentUser') ||
        localStorage.getItem('auth_user');

      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (parsed?.id !== undefined && parsed?.id !== null) {
        setCurrentUserId(String(parsed.id));
      }
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [userList, messageList] = await Promise.all([
        adminService.getUsers(),
        Promise.resolve(messageService.getAllMessages()),
      ]);

      setUsers(Array.isArray(userList) ? (userList as ManagedUser[]) : []);
      setMessages(Array.isArray(messageList) ? messageList : []);
    } catch (err: any) {
      setUsers([]);
      setMessages([]);
      setError(err?.message || 'خطا در بارگذاری داده‌ها.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUserId();
    fetchAllData();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'ronia_direct_messages') {
        addNotification('پیام‌ها به‌روزرسانی شدند.', 'info');
        void fetchAllData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchAllData, addNotification, loadCurrentUserId]);

  const resetCreateForm = () => {
    setUsername('');
    setPassword('');
    setEmail('');
    setFirstName('');
    setLastName('');
    setMobile('');
    setNationalId('');
    setBio('');
    setSelectedRole('USER');
    setSubscriptionDays('30');
    setAnalysisLimit('20');
    setAnalysisLimit24h('20');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError('نام کاربری و کلمه عبور الزامی است.');
      return;
    }

    if (password.trim().length < 6) {
      setError('کلمه عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }

    try {
      await adminService.createUser({
        username: username.trim(),
        password: password.trim(),
        email: emptyToNull(email),
        firstName: emptyToNull(firstName),
        lastName: emptyToNull(lastName),
        name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null,
        mobile: emptyToNull(mobile),
        nationalId: emptyToNull(nationalId),
        bio: emptyToNull(bio),
        roleId: selectedRole === 'ADMIN' ? ROLE_ADMIN_ID : ROLE_USER_ID,
        isActive: true,
        subscriptionDays: Number(subscriptionDays) || 0,
        isSubscriptionActive: true,
        analysisLimit: Number(analysisLimit) || null,
        analysisLimit24h: Number(analysisLimit24h) || null,
      });

      await fetchAllData();
      resetCreateForm();
      addNotification(`کاربر ${username.trim()} با موفقیت اضافه شد.`, 'success');
    } catch (err: any) {
      setError(err?.message || 'ایجاد کاربر با خطا مواجه شد.');
      addNotification(err?.message || 'ایجاد کاربر با خطا مواجه شد.', 'error');
    }
  };

  const handleToggleActive = async (userToToggle: ManagedUser) => {
    if (currentUserId && String(userToToggle.id) === currentUserId) {
      addNotification('شما نمی‌توانید حساب کاربری خود را غیرفعال کنید.', 'error');
      return;
    }

    try {
      await adminService.toggleUserActive(userToToggle.id, !userToToggle.isActive);
      await fetchAllData();
      addNotification(
        `دسترسی کاربر ${userToToggle.username} ${!userToToggle.isActive ? 'فعال' : 'غیرفعال'} شد.`,
        'info'
      );
    } catch (err: any) {
      addNotification(err?.message || 'تغییر وضعیت کاربر با خطا مواجه شد.', 'error');
    }
  };

  const handleSaveMobile = async () => {
    if (!editingMobile) return;

    try {
      await adminService.updateUser(editingMobile.userId, {
        mobile: editingMobile.value.trim() || null,
      });

      await fetchAllData();
      setEditingMobile(null);
      addNotification('شماره موبایل با موفقیت به‌روزرسانی شد.', 'success');
    } catch (err: any) {
      addNotification(err?.message || 'به‌روزرسانی موبایل با خطا مواجه شد.', 'error');
    }
  };

  const handleStartEditingSubscriptionStart = (user: ManagedUser) => {
    setEditingSubscriptionStart({
      userId: String(user.id),
      value: formatDateInputValue(user.subscriptionStart),
    });
  };

  const handleSaveSubscriptionStart = async () => {
    if (!editingSubscriptionStart) return;

    try {
      await adminService.updateSubscription({
        userId: editingSubscriptionStart.userId,
        subscriptionStart: editingSubscriptionStart.value || null,
      });

      await fetchAllData();
      setEditingSubscriptionStart(null);
      addNotification('تاریخ شروع اشتراک با موفقیت به‌روزرسانی شد.', 'success');
    } catch (err: any) {
      addNotification(err?.message || 'به‌روزرسانی تاریخ اشتراک با خطا مواجه شد.', 'error');
    }
  };

  const handleSaveSubscriptionDays = async () => {
    if (!editingSubscriptionDays) return;

    try {
      await adminService.updateSubscription({
        userId: editingSubscriptionDays.userId,
        subscriptionDays: Number(editingSubscriptionDays.value) || 0,
      });

      await fetchAllData();
      setEditingSubscriptionDays(null);
      addNotification('مدت اشتراک با موفقیت به‌روزرسانی شد.', 'success');
    } catch (err: any) {
      addNotification(err?.message || 'به‌روزرسانی مدت اشتراک با خطا مواجه شد.', 'error');
    }
  };

  const handleSaveAnalysisSettings = async () => {
    if (!editingAnalysisSettings) return;

    try {
      await adminService.updateSubscription({
        userId: editingAnalysisSettings.userId,
        analysisLimit: Number(editingAnalysisSettings.analysisLimit) || 0,
        analysisLimit24h: Number(editingAnalysisSettings.analysisLimit24h) || 0,
      });

      await fetchAllData();
      setEditingAnalysisSettings(null);
      addNotification('محدودیت‌های تحلیل با موفقیت به‌روزرسانی شد.', 'success');
    } catch (err: any) {
      addNotification(err?.message || 'به‌روزرسانی محدودیت تحلیل با خطا مواجه شد.', 'error');
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToReset) return;

    if (newPasswordForReset.trim().length < 6) {
      addNotification('کلمه عبور جدید باید حداقل ۶ کاراکتر باشد.', 'error');
      return;
    }

    setResetLoading(true);
    try {
      await adminService.resetUserPassword(userToReset.id, newPasswordForReset.trim());
      addNotification(`کلمه عبور کاربر ${userToReset.username} با موفقیت بازنشانی شد.`, 'success');
      setUserToReset(null);
      setNewPasswordForReset('');
    } catch (err: any) {
      addNotification(err?.message || 'بازنشانی رمز عبور با خطا مواجه شد.', 'error');
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    setDeleteLoading(true);
    try {
      await adminService.deleteUser(userToDelete.id);
      await fetchAllData();
      setMessages((prev) => prev.filter((m) => String(m.senderId) !== String(userToDelete.id)));
      addNotification(`کاربر ${userToDelete.username} با موفقیت حذف شد.`, 'success');
      setUserToDelete(null);
    } catch (err: any) {
      addNotification(err?.message || 'حذف کاربر با خطا مواجه شد.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleViewMessage = async (message: DirectMessage) => {
    setViewingMessage(message);

    if (!message.readByAdmin) {
      const updatedMessages = messageService.markAsReadByAdmin(message.id);
      setMessages(updatedMessages);
      onMessageUpdate();
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingMessage || !replyText.trim()) return;

    setReplyLoading(true);
    try {
      const updatedMessages = messageService.sendReplyToUser(viewingMessage.id, replyText.trim());
      setMessages(updatedMessages);
      addNotification('پاسخ با موفقیت برای کاربر ارسال شد.', 'success');
      setViewingMessage(null);
      setReplyText('');
    } catch (err: any) {
      addNotification(err?.message || 'ارسال پاسخ با خطا مواجه شد.', 'error');
    } finally {
      setReplyLoading(false);
    }
  };

  const handleDeleteAttachment = async (messageId: string) => {
    try {
      const updatedMessages = messageService.deleteAttachment(messageId);
      setMessages(updatedMessages);

      if (viewingMessage) {
        setViewingMessage((prev) => (prev ? { ...prev, attachment: undefined } : null));
      }

      addNotification('پیوست با موفقیت حذف شد.', 'info');
    } catch {
      addNotification('خطا در حذف پیوست.', 'error');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const term = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !term ||
        toSafeString(user.username).toLowerCase().includes(term) ||
        toSafeString(user.firstName).toLowerCase().includes(term) ||
        toSafeString(user.lastName).toLowerCase().includes(term) ||
        toSafeString(user.mobile).toLowerCase().includes(term) ||
        toSafeString(user.email).toLowerCase().includes(term);

      const matchesStatus =
        filterStatus === 'all'
          ? true
          : filterStatus === 'active'
            ? !!user.isActive
            : !user.isActive;

      const matchesRole =
        filterRole === 'all'
          ? true
          : filterRole === 'admin'
            ? isAdminUser(user)
            : !isAdminUser(user);

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, searchTerm, filterStatus, filterRole]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto py-10 text-center text-gray-600 dark:text-gray-300">
        در حال بارگذاری اطلاعات کاربران...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
          مدیریت کاربران
        </h2>

        {isOnline && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <span>{onlineCount} کاربر آنلاین</span>
          </div>
        )}
      </div>

      <p className="text-gray-600 dark:text-gray-400 mb-6">
        در این بخش می‌توانید کاربران جدید تعریف کرده و دسترسی، نقش و اشتراک کاربران فعلی را مدیریت کنید.
      </p>

      <fieldset disabled={!isOnline} className="disabled:opacity-60">
        <div
          data-style-id="user-management-add-form"
          data-style-name="فرم افزودن کاربر"
          className="p-6 rounded-lg shadow-md mb-8"
          style={{
            backgroundColor: 'var(--user-management-add-form-bg)',
            color: 'var(--user-management-add-form-color)',
            fontFamily: 'var(--user-management-add-form-font-family)',
            fontSize: `var(--user-management-add-form-font-size)`,
            borderWidth: `var(--user-management-add-form-border-width)`,
            borderStyle: `var(--user-management-add-form-border-style)`,
            borderColor: `var(--user-management-add-form-border-color)`,
          }}
        >
          <h3 className="text-lg font-semibold mb-4">افزودن کاربر جدید</h3>

          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="نام"
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="نام خانوادگی"
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="شماره موبایل"
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="نام کاربری"
                required
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="کلمه عبور"
                required
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ایمیل"
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <input
                type="text"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="کد ملی"
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              >
                <option value="USER">کاربر عادی</option>
                <option value="ADMIN">ادمین</option>
              </select>

              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="توضیحات / بیو"
                rows={3}
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2 md:col-span-3"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />
            </div>

            <div className="border-t border-[var(--card-border-color)] pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">مدت اشتراک (ماه)</label>
                <input
                  type="number"
                  value={subscriptionDays}
                  onChange={(e) => setSubscriptionMonths(e.target.value)}
                  min="0"
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-color)',
                    borderColor: 'var(--input-border)',
                    '--tw-ring-color': 'var(--input-focus-ring)',
                  } as React.CSSProperties}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">سقف تحلیل کل</label>
                <input
                  type="number"
                  value={analysisLimit}
                  onChange={(e) => setAnalysisLimit(e.target.value)}
                  min="0"
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-color)',
                    borderColor: 'var(--input-border)',
                    '--tw-ring-color': 'var(--input-focus-ring)',
                  } as React.CSSProperties}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">تعداد تحلیل در 24 ساعت</label>
                <input
                  type="number"
                  value={analysisLimit24h}
                  onChange={(e) => setAnalysisLimit24h(e.target.value)}
                  min="0"
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-color)',
                    borderColor: 'var(--input-border)',
                    '--tw-ring-color': 'var(--input-focus-ring)',
                  } as React.CSSProperties}
                />
              </div>
            </div>

            {error && <p className="text-[var(--color-negative)] text-sm mt-2">{error}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                className="font-bold rounded flex items-center justify-center gap-2 px-6 py-2 transition-colors disabled:bg-gray-500"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-color)',
                }}
              >
                <PlusIcon className="h-5 w-5" />
                افزودن کاربر
              </button>
            </div>
          </form>
        </div>

        {/* Filter Bar */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 bg-[var(--card-bg)] p-4 rounded-lg border border-[var(--card-border-color)] shadow-sm">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
              <MagnifyingGlassIcon className="h-5 w-5" />
            </div>
            <input
              type="text"
              placeholder="جستجو (نام، نام کاربری، موبایل، ایمیل)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-color)',
                borderColor: 'var(--input-border)',
                '--tw-ring-color': 'var(--input-focus-ring)',
              } as React.CSSProperties}
            />
          </div>

          <div className="flex gap-4 flex-wrap sm:flex-nowrap">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="flex-grow sm:flex-grow-0 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-color)',
                borderColor: 'var(--input-border)',
                '--tw-ring-color': 'var(--input-focus-ring)',
              } as React.CSSProperties}
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال</option>
            </select>

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as 'all' | 'admin' | 'user')}
              className="flex-grow sm:flex-grow-0 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-color)',
                borderColor: 'var(--input-border)',
                '--tw-ring-color': 'var(--input-focus-ring)',
              } as React.CSSProperties}
            >
              <option value="all">همه نقش‌ها</option>
              <option value="admin">ادمین</option>
              <option value="user">کاربر عادی</option>
            </select>
          </div>
        </div>

        <div
          className="overflow-x-auto bg-[var(--card-bg)] rounded-lg"
          style={{
            borderWidth: `var(--user-management-table-rows-border-width)`,
            borderStyle: `var(--user-management-table-rows-border-style)`,
            borderColor: `var(--user-management-table-rows-border-color)`,
          }}
        >
          <table className="min-w-full text-sm text-left">
            <thead
              data-style-id="user-management-table-header"
              data-style-name="هدر جدول کاربران"
              className="uppercase"
              style={{
                backgroundColor: 'var(--user-management-table-header-bg)',
                color: 'var(--user-management-table-header-color)',
                fontFamily: 'var(--user-management-table-header-font-family)',
                fontSize: `var(--user-management-table-header-font-size)`,
              }}
            >
              <tr>
                <th scope="col" className="px-6 py-3">کاربر</th>
                <th scope="col" className="px-6 py-3">موبایل</th>
                <th scope="col" className="px-6 py-3">تاریخ ثبت</th>
                <th scope="col" className="px-6 py-3">شروع اشتراک</th>
                <th scope="col" className="px-6 py-3">مدت اشتراک</th>
                <th scope="col" className="px-6 py-3">اعتبار باقیمانده</th>
                <th scope="col" className="px-6 py-3">محدودیت تحلیل</th>
                <th scope="col" className="px-6 py-3">دسترسی</th>
                <th scope="col" className="px-6 py-3">وضعیت</th>
                <th scope="col" className="px-6 py-3">پیام</th>
                <th scope="col" className="px-6 py-3 text-center">عملیات</th>
              </tr>
            </thead>

            <tbody
              data-style-id="user-management-table-rows"
              data-style-name="ردیف‌های جدول کاربران"
              style={{
                color: 'var(--user-management-table-rows-color)',
                fontFamily: 'var(--user-management-table-rows-font-family)',
                fontSize: `var(--user-management-table-rows-font-size)`,
              }}
            >
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const status = getSubscriptionStatus(user);
                  const validityInfo = getRemainingValidityInfo(user);
                  const userMessage = Array.isArray(messages)
                    ? messages.find((m) => String(m.senderId) === String(user.id))
                    : undefined;

                  return (
                    <tr
                      key={String(user.id)}
                      className="border-b border-[var(--table-border-color)] hover:bg-[var(--table-row-hover-bg)]"
                      style={{ backgroundColor: 'var(--user-management-table-rows-bg)' }}
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold">{getDisplayName(user)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {user.username}
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            isAdminUser(user)
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {getRoleLabel(user)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {editingMobile?.userId === String(user.id) ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingMobile.value}
                              onChange={(e) =>
                                setEditingMobile({ ...editingMobile, value: e.target.value })
                              }
                              className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2"
                              style={{
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--input-color)',
                                borderColor: 'var(--input-border)',
                                '--tw-ring-color': 'var(--input-focus-ring)',
                              } as React.CSSProperties}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveMobile}
                              className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                            >
                              <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setEditingMobile(null)}
                              className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between group">
                            <span>{user.mobile || '-'}</span>
                            <button
                              onClick={() =>
                                setEditingMobile({
                                  userId: String(user.id),
                                  value: user.mobile || '',
                                })
                              }
                              className="p-1 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-cyan-600 dark:hover:text-cyan-400"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 font-mono">
                        {formatDateFa(user.createdAt)}
                      </td>

                      <td className="px-6 py-4">
                        {editingSubscriptionStart?.userId === String(user.id) ? (
                          <div className="flex items-center gap-2 relative z-10">
                            <input
                              type="date"
                              value={editingSubscriptionStart.value}
                              onChange={(e) =>
                                setEditingSubscriptionStart((prev) =>
                                  prev ? { ...prev, value: e.target.value } : null
                                )
                              }
                              className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2"
                              style={{
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--input-color)',
                                borderColor: 'var(--input-border)',
                                '--tw-ring-color': 'var(--input-focus-ring)',
                              } as React.CSSProperties}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveSubscriptionStart}
                              className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                            >
                              <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setEditingSubscriptionStart(null)}
                              className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between group font-mono">
                            <span>{formatDateFa(user.subscriptionStart)}</span>
                            <button
                              onClick={() => handleStartEditingSubscriptionStart(user)}
                              className="p-1 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-cyan-600 dark:hover:text-cyan-400"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {editingSubscriptionDays?.userId === String(user.id) ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editingSubscriptionDays.value}
                              onChange={(e) =>
                                setEditingSubscriptionDays({
                                  ...editingSubscriptionDays,
                                  value: e.target.value,
                                })
                              }
                              min="0"
                              className="w-20 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2"
                              style={{
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--input-color)',
                                borderColor: 'var(--input-border)',
                                '--tw-ring-color': 'var(--input-focus-ring)',
                              } as React.CSSProperties}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveSubscriptionDays}
                              className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                            >
                              <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setEditingSubscriptionDays(null)}
                              className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between group">
                            <span>{user.subscriptionDays ?? 0} ماه</span>
                            <button
                              onClick={() =>
                                setEditingSubscriptionDays({
                                  userId: String(user.id),
                                  value: String(user.subscriptionDays ?? 0),
                                })
                              }
                              className="p-1 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-cyan-600 dark:hover:text-cyan-400"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${validityInfo.badgeColor}`}
                        >
                          {validityInfo.remainingDaysText}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {editingAnalysisSettings?.userId === String(user.id) ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editingAnalysisSettings.analysisLimit}
                              onChange={(e) =>
                                setEditingAnalysisSettings({
                                  ...editingAnalysisSettings,
                                  analysisLimit: e.target.value,
                                })
                              }
                              min="0"
                              className="w-16 border rounded px-2 py-1 text-sm"
                              style={{
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--input-color)',
                              }}
                              title="سقف تحلیل کل"
                            />
                            <input
                              type="number"
                              value={editingAnalysisSettings.analysisLimit24h}
                              onChange={(e) =>
                                setEditingAnalysisSettings({
                                  ...editingAnalysisSettings,
                                  analysisLimit24h: e.target.value,
                                })
                              }
                              min="0"
                              className="w-16 border rounded px-2 py-1 text-sm"
                              style={{
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--input-color)',
                              }}
                              title="تعداد تحلیل 24 ساعته"
                            />
                            <button onClick={handleSaveAnalysisSettings} className="p-1 text-green-600">
                              <CheckIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => setEditingAnalysisSettings(null)} className="p-1 text-red-600">
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between group">
                            <div>
                              <div className="text-xs">
                                سقف کل: <span className="font-mono font-semibold">{user.analysisLimit ?? 0}</span>
                              </div>
                              <div className="text-xs">
                                24 ساعت: <span className="font-mono font-semibold">{user.analysisLimit24h ?? 0}</span>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                setEditingAnalysisSettings({
                                  userId: String(user.id),
                                  analysisLimit: String(user.analysisLimit ?? 0),
                                  analysisLimit24h: String(user.analysisLimit24h ?? 0),
                                })
                              }
                              className="p-1 text-gray-400 opacity-0 group-hover:opacity-100"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {currentUserId && String(user.id) !== currentUserId ? (
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={user.isActive}
                              onChange={() => handleToggleActive(user)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600" />
                          </label>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full text-white ${status.color}`}
                        >
                          {status.text}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-center">
                        {userMessage ? (
                          <button
                            onClick={() => handleViewMessage(userMessage)}
                            className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors"
                            title="مشاهده پیام"
                          >
                            <EnvelopeIcon className="h-6 w-6" />
                            {!userMessage.readByAdmin && (
                              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-[var(--card-bg)]" />
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-600">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        {(!currentUserId || String(user.id) !== currentUserId) && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setUserToReset(user)}
                              className="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                              title="بازنشانی کلمه عبور"
                            >
                              <KeyIcon className="h-5 w-5 text-blue-500" />
                            </button>

                            <button
                              onClick={() => setUserToDelete(user)}
                              className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                              title="حذف کاربر"
                            >
                              <TrashIcon className="h-5 w-5 text-red-500" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    هیچ کاربری با این مشخصات یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </fieldset>

      {userToReset && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setUserToReset(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-300 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleConfirmResetPassword} className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                بازنشانی کلمه عبور
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                یک کلمه عبور جدید برای کاربر{' '}
                <span className="font-mono text-cyan-600 dark:text-cyan-400">
                  {userToReset.username}
                </span>{' '}
                وارد کنید.
              </p>

              <input
                type="password"
                value={newPasswordForReset}
                onChange={(e) => setNewPasswordForReset(e.target.value)}
                placeholder="کلمه عبور جدید (حداقل ۶ کاراکتر)"
                required
                className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setUserToReset(null)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-600 dark:hover:bg-gray-700 dark:text-white rounded-md transition-colors"
                >
                  انصراف
                </button>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors flex items-center gap-2 disabled:bg-gray-500"
                >
                  {resetLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
                      <span>در حال ذخیره...</span>
                    </>
                  ) : (
                    'بازنشانی'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userToDelete && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setUserToDelete(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-red-500 dark:border-red-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                تایید حذف کاربر
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                آیا از حذف کامل کاربر{' '}
                <span className="font-mono text-cyan-600 dark:text-cyan-400">
                  {userToDelete.username}
                </span>{' '}
                مطمئن هستید؟
                <br />
                <strong className="text-red-500">این عملیات غیرقابل بازگشت است.</strong>
              </p>

              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-600 dark:hover:bg-gray-700 dark:text-white rounded-md transition-colors"
                >
                  انصراف
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteLoading}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center gap-2 disabled:bg-red-400"
                >
                  {deleteLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
                      <span>در حال حذف...</span>
                    </>
                  ) : (
                    'حذف'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingMessage && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingMessage(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg border border-gray-300 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-semibold text-gray-800 dark:text-white">
                پیام از طرف {viewingMessage.senderUsername}
              </h3>
              <button
                onClick={() => setViewingMessage(null)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">متن پیام کاربر:</p>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-100 dark:bg-gray-700/50 p-3 rounded-md">
                  {viewingMessage.message}
                </p>
              </div>

              {viewingMessage.attachment && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">فایل پیوست:</p>
                  <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-700/50 p-2 rounded-md">
                    <div className="flex items-center gap-2">
                      <PaperclipIcon className="h-4 w-4" />
                      <span className="text-sm">{viewingMessage.attachment.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={viewingMessage.attachment.data}
                        download={viewingMessage.attachment.name}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"
                        title="دانلود"
                      >
                        <ArrowDownOnSquareIcon className="h-5 w-5" />
                      </a>

                      <button
                        onClick={() => handleDeleteAttachment(viewingMessage.id)}
                        className="p-1.5 text-red-500 dark:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"
                        title="حذف پیوست"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {viewingMessage.reply && (
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400 mb-1">پاسخ شما:</p>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-green-50 dark:bg-green-900/30 p-3 rounded-md">
                    {viewingMessage.reply.text}
                  </p>
                </div>
              )}
            </div>

            <form
              onSubmit={handleSendReply}
              className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 space-y-3"
            >
              <label className="block text-sm font-medium">پاسخ به کاربر:</label>

              <textarea
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="پاسخ خود را اینجا بنویسید..."
                required
                className="w-full border rounded-md px-4 py-2 focus:outline-none focus:ring-2 transition"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-color)',
                  borderColor: 'var(--input-border)',
                  '--tw-ring-color': 'var(--input-focus-ring)',
                } as React.CSSProperties}
              />

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setViewingMessage(null)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-600 dark:hover:bg-gray-700 dark:text-white rounded-md transition-colors"
                >
                  بستن
                </button>

                <button
                  type="submit"
                  disabled={replyLoading}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors flex items-center gap-2 disabled:bg-gray-500"
                >
                  {replyLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
                      <span>در حال ارسال...</span>
                    </>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="h-5 w-5" />
                      <span>ارسال پاسخ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
