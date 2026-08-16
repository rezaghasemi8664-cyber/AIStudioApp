import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import { CheckCircleIcon, XCircleIcon, InfoIcon, XMarkIcon } from './Icons';

// --- Types ---
interface Notification {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

interface NotificationContextType {
  addNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
}

// --- Context and Hook ---
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

// --- Single Notification Component ---
const NotificationItem: React.FC<{ notification: Notification; onRemove: (id: number) => void }> = ({ notification, onRemove }) => {
  React.useEffect(() => {
    const timerId = setTimeout(() => {
      onRemove(notification.id);
    }, 5000); // Auto-remove after 5 seconds

    return () => clearTimeout(timerId);
  }, [notification.id, onRemove]);

  const typeStyles = {
    success: { 
      bg: 'bg-green-100 dark:bg-green-800/90', 
      border: 'border-green-500 dark:border-green-600', 
      icon: <CheckCircleIcon className="h-6 w-6 text-green-500 dark:text-green-300" />,
      text: 'text-green-800 dark:text-gray-200',
      closeHoverBg: 'hover:bg-green-200 dark:hover:bg-gray-700'
    },
    info: { 
      bg: 'bg-blue-100 dark:bg-blue-800/90', 
      border: 'border-blue-500 dark:border-blue-600', 
      icon: <InfoIcon className="h-6 w-6 text-blue-500 dark:text-blue-300" />,
      text: 'text-blue-800 dark:text-gray-200',
      closeHoverBg: 'hover:bg-blue-200 dark:hover:bg-gray-700'
    },
    error: { 
      bg: 'bg-red-100 dark:bg-red-800/90', 
      border: 'border-red-500 dark:border-red-600', 
      icon: <XCircleIcon className="h-6 w-6 text-red-500 dark:text-red-300" />,
      text: 'text-red-800 dark:text-gray-200',
      closeHoverBg: 'hover:bg-red-200 dark:hover:bg-gray-700'
    },
  };

  const styles = typeStyles[notification.type];

  return (
    <div
      className={`relative flex items-center w-full max-w-sm p-4 mb-4 ${styles.bg} rounded-lg shadow-lg border-l-4 ${styles.border} backdrop-blur-sm animate-toast-in ${styles.text}`}
      role="alert"
    >
      <div className="flex-shrink-0">{styles.icon}</div>
      <div className="ms-3 text-sm font-normal pr-4">{notification.message}</div>
      <button
        type="button"
        className={`ms-auto -mx-1.5 -my-1.5 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white ${styles.closeHoverBg} rounded-lg focus:ring-2 focus:ring-gray-300 inline-flex items-center justify-center h-8 w-8`}
        onClick={() => onRemove(notification.id)}
        aria-label="Close"
      >
        <span className="sr-only">Close</span>
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

// --- Provider and Container ---
export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const newNotification = {
      id: Date.now(),
      message,
      type,
    };
    setNotifications((prev) => [...prev, newNotification]);
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification }}>
      {children}
      <div className="fixed top-5 right-5 z-50">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} onRemove={removeNotification} />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};