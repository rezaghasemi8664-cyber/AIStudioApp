import React, { useState, useEffect, useRef } from 'react';
import * as authService from '../services/authService';
import * as notificationService from '../services/notificationService';
import type { StoredUser } from '../types';
import type { NotificationAttachment } from '../services/notificationService';
import { useNotification } from './NotificationSystem';
import { MegaphoneIcon, PaperclipIcon, XMarkIcon } from './Icons';

interface NotificationsManagementProps {
    isOnline: boolean;
}

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const NotificationsManagement: React.FC<NotificationsManagementProps> = ({ isOnline }) => {
    const [message, setMessage] = useState('');
    const [recipientType, setRecipientType] = useState<'all' | 'specific'>('all');
    const [users, setUsers] = useState<StoredUser[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const { addNotification } = useNotification();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            const allUsers = await authService.getUsers();
            setUsers(allUsers);
        };

        fetchUsers();
    }, []);

    const handleUserSelectionChange = (userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) {
            addNotification('فرمت فایل معتبر نیست. لطفاً از pdf, jpg, jpeg استفاده کنید.', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            addNotification('حجم فایل نباید بیشتر از ۵ مگابایت باشد.', 'error');
            return;
        }

        setAttachment(file);
    };

    const handleSendNotification = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!message.trim()) {
            addNotification('پیام اطلاعیه نمی‌تواند خالی باشد.', 'error');
            return;
        }

        if (recipientType === 'specific' && selectedUserIds.length === 0) {
            addNotification('لطفاً حداقل یک کاربر را برای ارسال انتخاب کنید.', 'error');
            return;
        }

        setLoading(true);

        try {
            let attachmentData: NotificationAttachment | undefined;

            if (attachment) {
                const base64Url = await fileToBase64(attachment);
                attachmentData = {
                    name: attachment.name,
                    type: attachment.type,
                    url: base64Url,
                };
            }

            if (recipientType === 'all') {
                await notificationService.addNotification({
                    message: message.trim(),
                    attachment: attachmentData,
                });
            } else {
                await notificationService.addNotification({
                    message: message.trim(),
                    userIds: selectedUserIds,
                    attachment: attachmentData,
                });
            }

            addNotification('اطلاعیه با موفقیت برای کاربران انتخاب شده ارسال شد.', 'success');

            setMessage('');
            setSelectedUserIds([]);
            setRecipientType('all');
            setAttachment(null);

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            addNotification('خطا در ارسال اطلاعیه.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">ارسال اطلاعیه</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
                یک پیام برای کاربران برنامه ارسال کنید. این پیام در پنل اطلاعیه‌های آن‌ها نمایش داده خواهد شد.
            </p>

            <fieldset disabled={!isOnline || loading} className="disabled:opacity-60">
                <form
                    onSubmit={handleSendNotification}
                    data-style-id="notifications-form-card"
                    data-style-name="فرم ارسال اطلاعیه"
                    className="p-6 rounded-lg shadow-md space-y-6"
                    style={{
                        backgroundColor: 'var(--notifications-form-card-bg)',
                        color: 'var(--notifications-form-card-color)',
                        fontFamily: 'var(--notifications-form-card-font-family)',
                        fontSize: 'var(--notifications-form-card-font-size)',
                        borderWidth: 'var(--notifications-form-card-border-width)',
                        borderStyle: 'var(--notifications-form-card-border-style)',
                        borderColor: 'var(--notifications-form-card-border-color)',
                    }}
                >
                    <div>
                        <label htmlFor="notificationMessage" className="block text-lg font-semibold mb-2">
                            متن پیام
                        </label>
                        <textarea
                            id="notificationMessage"
                            rows={5}
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="اطلاعیه خود را اینجا بنویسید..."
                            required
                            className="w-full border rounded-md px-4 py-2 focus:outline-none focus:ring-2 transition"
                            style={{
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--input-color)',
                                borderColor: 'var(--input-border)',
                                '--tw-ring-color': 'var(--input-focus-ring)',
                            } as React.CSSProperties}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">پیوست فایل (اختیاری)</label>
                        <div className="flex items-center gap-4">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
                            >
                                <PaperclipIcon className="h-4 w-4" />
                                <span>انتخاب فایل</span>
                            </button>

                            {attachment && (
                                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <span>{attachment.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAttachment(null);
                                            if (fileInputRef.current) {
                                                fileInputRef.current.value = '';
                                            }
                                        }}
                                        className="p-1 text-red-500 hover:text-red-700 rounded-full"
                                        aria-label="Remove attachment"
                                    >
                                        <XMarkIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".pdf,.jpg,.jpeg"
                            className="hidden"
                        />

                        <p className="text-xs text-gray-500 mt-2">
                            فایل‌های مجاز: PDF, JPG, JPEG. حداکثر حجم: ۵ مگابایت
                        </p>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold mb-3">گیرندگان</h3>
                        <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="recipientType"
                                    value="all"
                                    checked={recipientType === 'all'}
                                    onChange={() => setRecipientType('all')}
                                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-400 dark:border-gray-500 bg-gray-200 dark:bg-gray-700"
                                />
                                <span>همه کاربران</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="recipientType"
                                    value="specific"
                                    checked={recipientType === 'specific'}
                                    onChange={() => setRecipientType('specific')}
                                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-400 dark:border-gray-500 bg-gray-200 dark:bg-gray-700"
                                />
                                <span>انتخاب کاربران</span>
                            </label>
                        </div>
                    </div>

                    {recipientType === 'specific' && (
                        <div className="border border-[var(--input-border)] rounded-lg p-4 max-h-60 overflow-y-auto">
                            <h4 className="font-semibold mb-2">لیست کاربران</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {users.map(user => (
                                    <label
                                        key={user.id}
                                        className="flex items-center gap-2 p-2 rounded-md hover:bg-[var(--app-bg)] cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedUserIds.includes(user.id)}
                                            onChange={() => handleUserSelectionChange(user.id)}
                                            className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500"
                                        />
                                        <span className="text-sm">
                                            {user.firstName} {user.lastName} ({user.username})
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            data-style-id="notifications-send-button"
                            data-style-name="دکمه ارسال اطلاعیه"
                            className="font-bold rounded flex items-center justify-center gap-2 px-6 py-2 transition-colors disabled:bg-gray-500"
                            style={{
                                backgroundColor: 'var(--btn-primary-bg)',
                                color: 'var(--btn-primary-color)',
                                fontFamily: 'var(--btn-primary-font-family)',
                                fontSize: 'var(--btn-primary-font-size)',
                            } as React.CSSProperties}
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                                    <span>در حال ارسال...</span>
                                </>
                            ) : (
                                <>
                                    <MegaphoneIcon className="h-5 w-5" />
                                    <span>ارسال اطلاعیه</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </fieldset>
        </div>
    );
};

export default NotificationsManagement;
