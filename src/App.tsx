import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  Suspense,
  lazy,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

import Login from './components/Login';
import Clock from './components/Clock';
import MarketIndex from './components/MarketIndex';
import LoadingSpinner from './components/LoadingSpinner';
import WelcomeBanner from './components/WelcomeBanner';

import * as authServiceModule from './services/authService';
import type { StoredUser } from './services/authService';
import * as notificationServiceModule from './services/notificationService';
import * as messageServiceModule from './services/messageService';
import * as themeServiceModule from './services/themeService';
import * as apiConfigServiceModule from './services/apiConfigService';
import * as uiConfigServiceModule from './services/uiConfigService';
import * as storageServiceModule from './services/storageService';
import * as apiEndpointServiceModule from './services/apiEndpointService';
import * as gapgptServiceModule from './services/gapgptService';
import * as socketServiceModule from './services/socketService';
import { globalSettings } from './services/settingsService';

import { useNotification } from './components/NotificationSystem';

import {
  ChartBarIcon,
  MagnifyingGlassIcon,
  BriefcaseIcon,
  RoniaLogo,
  UserGroupIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  GlobeAltIcon,
  WifiSlashIcon,
  MegaphoneIcon,
  BellIcon,
  UserCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  PresentationChartLineIcon,
  ClipboardDocumentIcon,
  LockClosedIcon,
  PaperclipIcon,
} from './components/Icons';

import type { PortfolioAlertType, AppNotification, TseLink } from './types';

function logAsyncError(scope: string, error: unknown): void {
  console.error(`[${scope}]`, error);
}

const authService = (authServiceModule || {}) as typeof authServiceModule;
const notificationService = (notificationServiceModule || {}) as typeof notificationServiceModule;
const messageService = (messageServiceModule || {}) as typeof messageServiceModule;
const themeService = (themeServiceModule || {}) as typeof themeServiceModule;
const apiConfigService = (apiConfigServiceModule || {}) as typeof apiConfigServiceModule;
const uiConfigService = (uiConfigServiceModule || {}) as typeof uiConfigServiceModule;
const storageService = (storageServiceModule || {}) as typeof storageServiceModule;
const apiEndpointService = (apiEndpointServiceModule || {}) as typeof apiEndpointServiceModule;
const gapgptService = (gapgptServiceModule || {}) as typeof gapgptServiceModule;
const socketService = (socketServiceModule || {}) as typeof socketServiceModule;

const StockAnalysis = lazy(() => import('./components/StockAnalysis'));
const Scalping = lazy(() => import('./components/Scalping'));
const Portfolio = lazy(() => import('./components/Portfolio'));
const StockComparison = lazy(() => import('./components/StockComparison'));
const DailyFilters = lazy(() => import('./components/DailyFilters'));
const UserProfile = lazy(() => import('./components/UserProfile'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const NotificationsManagement = lazy(() => import('./components/NotificationsManagement'));
const Settings = lazy(() => import('./components/Settings'));

type Tab =
  | 'analysis'
  | 'scalping'
  | 'portfolio'
  | 'comparison'
  | 'dailyFilters'
  | 'users'
  | 'settings'
  | 'notifications'
  | 'profile';

const TIMING = {
  PRESENCE_INTERVAL: 15_000,
  SCAN_CHECK_INTERVAL: 60_000,
  MARKET_CHECK_INTERVAL: 60_000,
  NOTIFICATION_REFRESH_INTERVAL: 30_000,
  LOCK_TIMEOUT: 2 * 60_000,
} as const;

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class LazyErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[LazyErrorBoundary] Component failed to load:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">خطا در بارگذاری بخش</h3>
            <p className="text-sm text-gray-500 mt-2">
              {this.state.error?.message || 'لطفاً صفحه را مجدداً بارگذاری کنید.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-4 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm"
            >
              تلاش مجدد
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

const OfflineBanner: React.FC = () => (
  <div className="bg-red-600 text-white text-center py-2 px-4 fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 flex-row-reverse">
    <WifiSlashIcon />
    <span>شما آفلاین هستید. برخی از امکانات غیرفعال شده‌اند.</span>
  </div>
);

const SplashScreen: React.FC = () => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--app-bg)] text-[var(--app-color)] transition-colors duration-300">
    <RoniaLogo className="h-24 w-24 text-cyan-500 dark:text-cyan-400 mb-6 animate-pulse" />
    <h1 className="text-2xl font-bold mb-4">تحلیلگر هوشمند بورس رونیا</h1>
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
      <span>در حال بارگذاری...</span>
    </div>
  </div>
);

const AccessDenied: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 py-16">
    <LockClosedIcon className="h-12 w-12 text-yellow-500 mb-4" />
    <h3 className="text-xl font-bold">دسترسی محدود شده است</h3>
    <p className="mt-2 max-w-md">
      اعتبار حساب کاربری شما به پایان رسیده است. برای دسترسی به این بخش، لطفاً از طریق تب
      پروفایل، درخواست تمدید اعتبار ارسال نمایید.
    </p>
  </div>
);

interface TabButtonProps {
  tab: Tab;
  label: string;
  icon: React.ReactElement;
  alertType: 'none' | 'cyan' | 'green' | 'red';
  disabled?: boolean;
  locked?: boolean;
  activeTab: Tab;
  onTabClick: (tab: Tab) => void;
}

const TabButton: React.FC<TabButtonProps> = React.memo(
  ({ tab, label, icon, alertType, disabled = false, locked = false, activeTab, onTabClick }) => {
    const alertClasses: Record<string, string> = {
      none: '',
      cyan: 'animate-flash-cyan',
      green: 'animate-flash-green',
      red: 'animate-flash-red',
    };

    const isActive = activeTab === tab;
    const styleId = isActive ? 'tab-active' : 'tab-inactive';
    const hoverBg = isActive ? '' : 'hover:bg-[var(--tab-inactive-hover-bg)]';
    const border = isActive ? 'border-b-2 border-[var(--tab-active-border-color)]' : '';

    return (
      <button
        onClick={() => onTabClick(tab)}
        disabled={disabled || locked}
        data-style-id={styleId}
        data-style-name={`تب ${label}`}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-t-lg transition-all duration-300 focus:outline-none ${alertClasses[alertType]} ${hoverBg} ${border} ${disabled || locked ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{
          backgroundColor: `var(--${styleId}-bg)`,
          color: `var(--${styleId}-color)`,
          fontFamily: `var(--${styleId}-font-family)`,
          fontSize: `var(--${styleId}-font-size)`,
        }}
      >
        {icon}
        {label}
        {locked && <LockClosedIcon className="w-3 h-3 mr-1" />}
      </button>
    );
  },
);

TabButton.displayName = 'TabButton';

interface ValidityBadgeProps {
  validityInfo: { daysLeft: number; isExpired: boolean; expiryDate: string } | null;
}

const ValidityBadge: React.FC<ValidityBadgeProps> = ({ validityInfo }) => {
  if (!validityInfo) return null;

  if (validityInfo.isExpired) {
    return (
      <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
        اعتبار پایان یافته
      </span>
    );
  }

  if (validityInfo.daysLeft <= 7) {
    return (
      <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-full">
        {validityInfo.daysLeft} روز باقیمانده
      </span>
    );
  }

  return (
    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
      {validityInfo.daysLeft} روز اعتبار
    </span>
  );
};

const formatRelativeTime = (timestamp: number): string => {
  try {
    const now = new Date();
    const notificationDate = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - notificationDate.getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat('fa-IR', { numeric: 'auto' });

    if (diffInSeconds < 60) return rtf.format(-diffInSeconds, 'second');
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return rtf.format(-diffInMinutes, 'minute');
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return rtf.format(-diffInHours, 'hour');
    const diffInDays = Math.floor(diffInHours / 24);
    return rtf.format(-diffInDays, 'day');
  } catch {
    return '';
  }
};

const playNotificationSound = (): void => {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return;

  try {
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    console.error('Could not play notification sound:', error);
  }
};

const staticTseIcons: Record<string, React.ReactElement> = {
  'شاخص‌ها': <GlobeAltIcon className="w-4 h-4" />,
  'در یک نگاه': <PresentationChartLineIcon className="w-4 h-4" />,
  'شبکه کدال': <ClipboardDocumentIcon className="w-4 h-4" />,
};

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('analysis');
  const [scalpingAlert, setScalpingAlert] = useState(false);
  const [portfolioAlert, setPortfolioAlert] = useState<PortfolioAlertType>('none');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [onlineUserCount, setOnlineUserCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [viewingNotification, setViewingNotification] = useState<AppNotification | null>(null);
  const [isTseMenuOpen, setIsTseMenuOpen] = useState(false);
  const [tseLinks, setTseLinks] = useState<TseLink[]>([]);
  const [initialSettingsTab, setInitialSettingsTab] = useState<string | undefined>(undefined);

  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const tseMenuRef = useRef<HTMLDivElement>(null);
  const scalpingCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const marketIndexCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeGlobalSettingsRef = useRef<(() => void) | null>(null);

  const { addNotification } = useNotification();

  const validityInfo = useMemo(() => {
    if (!currentUser) return null;

    try {
      return typeof authService.getUserValidityInfo === 'function'
        ? authService.getUserValidityInfo(currentUser)
        : null;
    } catch {
      return null;
    }
  }, [currentUser]);

  const loadTseLinks = useCallback(async () => {
    if (typeof uiConfigService.initializeTseLinks === 'function') {
      await uiConfigService.initializeTseLinks();
    }

    if (typeof uiConfigService.getLinksForDisplay === 'function') {
      setTseLinks(uiConfigService.getLinksForDisplay());
    }
  }, []);

  const refreshUnreadCount = useCallback((user: StoredUser | null) => {
    if (!user) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }

    try {
      let totalUnread = 0;

      if (typeof notificationService.getUnreadCountForUser === 'function') {
        totalUnread = notificationService.getUnreadCountForUser(user.id);
      }

      if (user.isAdmin && typeof messageService.getUnreadMessageCountForAdmin === 'function') {
        totalUnread += messageService.getUnreadMessageCountForAdmin();
      }

      setUnreadCount(totalUnread);

      if (typeof notificationService.getNotificationsForUser === 'function') {
        setNotifications(notificationService.getNotificationsForUser(user.id));
      }
    } catch (error) {
      console.error('[refreshUnreadCount] Error:', error);
    }
  }, []);

  const handleLogout = useCallback(() => {
    try {
      const user =
        typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;

      if (user && typeof authService.removeUserPresence === 'function') {
        authService.removeUserPresence(user.id);
      }

      if (typeof socketService.disconnectSocket === 'function') {
        socketService.disconnectSocket();
      }

      if (typeof authService.logout === 'function') {
        authService.logout();
      }
    } catch (error) {
      console.error('[handleLogout] Error during logout:', error);
    }

    setCurrentUser(null);
    setNotifications([]);
    setUnreadCount(0);
    setIsExpired(false);
    setShowWelcomeBanner(false);
    setIsNotificationsOpen(false);
    setViewingNotification(null);
    setIsTseMenuOpen(false);
    setInitialSettingsTab(undefined);
    setActiveTab('analysis');
    setPortfolioAlert('none');
    setScalpingAlert(false);
  }, []);

  // گوش دادن به رویداد سراسری خروج اجباری (Unauthorized) صادر شده از apiClient
  useEffect(() => {
    const handleGlobalUnauthorized = () => {
      handleLogout();
      addNotification('نشست شما خاتمه یافته است. لطفا دوباره وارد شوید.', 'error');
    };

    window.addEventListener('auth:unauthorized', handleGlobalUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleGlobalUnauthorized);
    };
  }, [handleLogout, addNotification]);

  useEffect(() => {
    let mounted = true;

    const setUserState = (user: StoredUser | null) => {
      if (!mounted) return;

      if (!user) {
        setCurrentUser(null);
        setIsExpired(false);
        refreshUnreadCount(null);
        return;
      }

      setCurrentUser(user);

      if (typeof authService.isAccountExpired === 'function') {
        setIsExpired(authService.isAccountExpired(user));
      } else {
        setIsExpired(false);
      }

      refreshUnreadCount(user);

      if (typeof notificationService.checkAndSendExpiryNotification === 'function') {
        try {
          notificationService.checkAndSendExpiryNotification(user);
        } catch (error) {
          logAsyncError('checkAndSendExpiryNotification failed', error);
        }
      }
    };

    const getCurrentSessionUser = (): StoredUser | null => {
      try {
        return typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
      } catch (error) {
        logAsyncError('getCurrentUser failed', error);
        return null;
      }
    };

    const restoreSessionUserQuickly = () => {
      const sessionUser = getCurrentSessionUser();

      if (!sessionUser || !sessionUser.isActive || sessionUser.isDeleted) {
        setUserState(null);
        return;
      }

      setUserState(sessionUser);
    };

    const reconcileSessionUserInBackground = async () => {
      try {
        if (typeof authService.getMe !== 'function') {
          return;
        }

        const meResult = await authService.getMe();

        if (!mounted) return;

        if (meResult?.success && meResult.data) {
          const resolvedUser = meResult.data as StoredUser;

          if (resolvedUser.isActive && !resolvedUser.isDeleted) {
            if (typeof authService.setCurrentUser === 'function') {
              authService.setCurrentUser(resolvedUser);
            }

            setUserState(resolvedUser);
            return;
          }
        }

        // اگر نشست در سرور نامعتبر بود، خروج کامل رخ دهد
        handleLogout();
      } catch (error) {
        logAsyncError('reconcileSessionUserInBackground getMe failed', error);
      }
    };

    const initializeNonBlockingServices = async () => {
      try {
        if (typeof apiEndpointService.initializeDefaults === 'function') {
          await apiEndpointService.initializeDefaults();
        }
      } catch (error) {
        logAsyncError('initializeDefaults failed', error);
      }

      try {
        if (typeof globalSettings.fetchGlobalSettings === 'function') {
          await globalSettings.fetchGlobalSettings();
        }
      } catch (error) {
        logAsyncError('fetchGlobalSettings failed', error);
      }

      try {
        if (!mounted) return;

        if (typeof themeService.initializeTheme === 'function') {
          await themeService.initializeTheme();
        }
      } catch (error) {
        logAsyncError('initializeTheme background refresh failed', error);
      }

      try {
        if (!mounted) return;
        await loadTseLinks();
      } catch (error) {
        logAsyncError('initializeTseLinks failed', error);
      }

      try {
        if (!mounted) return;
        await reconcileSessionUserInBackground();
      } catch (error) {
        logAsyncError('reconcileSessionUserInBackground failed', error);
      }
    };

    const initializeApp = async () => {
      try {
        if (typeof storageService.init === 'function') {
          await storageService.init();
        }

        if (!mounted) return;

        if (typeof themeService.initializeTheme === 'function') {
          await themeService.initializeTheme();
        }

        if (!mounted) return;
        await loadTseLinks();

        if (!mounted) return;
        restoreSessionUserQuickly();

        if (typeof storageService.getItem === 'function') {
          if (storageService.getItem('ronia_new_scalping_alert') === 'true') {
            setScalpingAlert(true);
          }
        }

        if (mounted) {
          setInitError(null);
          setIsInitializing(false);
        }

        void initializeNonBlockingServices();
      } catch (error) {
        console.error('App initialization failed:', error);

        if (mounted) {
          setInitError('خطا در بارگذاری برنامه. لطفاً صفحه را مجدداً بارگذاری کنید.');
          setIsInitializing(false);
        }
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationPanelRef.current &&
        !notificationPanelRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }

      if (tseMenuRef.current && !tseMenuRef.current.contains(event.target as Node)) {
        setIsTseMenuOpen(false);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'ronia_notifications') {
        refreshUnreadCount(getCurrentSessionUser());
      }

      if (event.key === 'ronia_new_scalping_alert' && event.newValue === 'true') {
        setScalpingAlert(true);
        playNotificationSound();
      }

      if (event.key === 'global_app_tse_links') {
        if (typeof uiConfigService.getLinksForDisplay === 'function') {
          setTseLinks(uiConfigService.getLinksForDisplay());
        }
      }
    };

    const handleBeforeUnload = () => {
      try {
        const user = getCurrentSessionUser();

        if (user && typeof authService.removeUserPresence === 'function') {
          authService.removeUserPresence(user.id);
        }
      } catch {
        //
      }
    };

    void initializeApp();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    const presenceInterval = setInterval(() => {
      try {
        const user = getCurrentSessionUser();

        if (!user) return;

        if (typeof authService.updateUserPresence === 'function') {
          authService.updateUserPresence(user.id);
        }

        if (user.isAdmin && typeof authService.getOnlineUserCount === 'function') {
          authService.getOnlineUserCount().then(setOnlineUserCount).catch(() => {});
        }
      } catch {
        //
      }
    }, TIMING.PRESENCE_INTERVAL);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(presenceInterval);

      if (scalpingCheckIntervalRef.current) clearInterval(scalpingCheckIntervalRef.current);
      if (marketIndexCheckIntervalRef.current) clearInterval(marketIndexCheckIntervalRef.current);
      if (notificationRefreshIntervalRef.current) {
        clearInterval(notificationRefreshIntervalRef.current);
      }
    };
  }, [loadTseLinks, refreshUnreadCount, handleLogout]);

  useEffect(() => {
    let mounted = true;

    const cleanupSubscription = () => {
      if (unsubscribeGlobalSettingsRef.current) {
        unsubscribeGlobalSettingsRef.current();
        unsubscribeGlobalSettingsRef.current = null;
      }
    };

    const disconnectSocket = () => {
      if (typeof socketService.disconnectSocket === 'function') {
        socketService.disconnectSocket();
      }
    };

    const refreshGlobalSettingsAndUi = async () => {
      try {
        if (typeof globalSettings.fetchGlobalSettings === 'function') {
          await globalSettings.fetchGlobalSettings();
        }

        if (!mounted) return;

        if (typeof themeService.initializeTheme === 'function') {
          await themeService.initializeTheme();
        }

        if (!mounted) return;
        await loadTseLinks();
      } catch (error) {
        console.error('[App] Failed to refresh global settings from socket event:', error);
      }
    };

    cleanupSubscription();

    if (!currentUser) {
      disconnectSocket();

      return () => {
        mounted = false;
        cleanupSubscription();
        disconnectSocket();
      };
    }

    try {
      // در معماری جدید مبتنی بر کوکی، سوکت بدون ارسال دستی توکن متصل می‌شود
      if (typeof socketService.initializeSocket === 'function') {
        socketService.initializeSocket();
      }

      if (typeof socketService.onGlobalSettingsUpdated === 'function') {
        unsubscribeGlobalSettingsRef.current = socketService.onGlobalSettingsUpdated(async () => {
          if (!mounted) return;
          await refreshGlobalSettingsAndUi();
        });
      }
    } catch (error) {
      console.error('[App] Failed to initialize socket or subscribe to settings events:', error);
    }

    return () => {
      mounted = false;
      cleanupSubscription();
      disconnectSocket();
    };
  }, [currentUser, loadTseLinks]);

  useEffect(() => {
    if (notificationRefreshIntervalRef.current) {
      clearInterval(notificationRefreshIntervalRef.current);
      notificationRefreshIntervalRef.current = null;
    }

    if (!currentUser) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }

    const refreshNotifications = () => {
      refreshUnreadCount(currentUser);
    };

    refreshNotifications();

    notificationRefreshIntervalRef.current = setInterval(
      refreshNotifications,
      TIMING.NOTIFICATION_REFRESH_INTERVAL,
    );

    return () => {
      if (notificationRefreshIntervalRef.current) {
        clearInterval(notificationRefreshIntervalRef.current);
        notificationRefreshIntervalRef.current = null;
      }
    };
  }, [currentUser, refreshUnreadCount]);

  useEffect(() => {
    if (scalpingCheckIntervalRef.current) {
      clearInterval(scalpingCheckIntervalRef.current);
      scalpingCheckIntervalRef.current = null;
    }

    if (!currentUser || !isOnline || isExpired) {
      return;
    }

    let isCancelled = false;
    let scanInProgress = false;

    const checkScalping = async () => {
      if (isCancelled || scanInProgress) return;
      scanInProgress = true;

      try {
        if (typeof apiConfigService.getScalpingSchedule !== 'function') return;

        const schedule = apiConfigService.getScalpingSchedule();
        if (!schedule?.isEnabled) return;

        const now = new Date();

        if (!Array.isArray(schedule.days) || !schedule.days.includes(now.getDay())) return;

        const currentTime = now.toTimeString().slice(0, 5);
        if (!schedule.startTime || !schedule.endTime) return;
        if (currentTime < schedule.startTime || currentTime > schedule.endTime) return;

        const lockKey = 'ronia_scalping_scan_lock';
        const rawLockTimestamp =
          typeof storageService.getItem === 'function' ? storageService.getItem(lockKey) : null;
        const lockTimestamp = Number.parseInt(rawLockTimestamp || '0', 10);

        if (Number.isFinite(lockTimestamp) && Date.now() - lockTimestamp < TIMING.LOCK_TIMEOUT) {
          return;
        }

        if (typeof storageService.setItem === 'function') {
          storageService.setItem(lockKey, Date.now().toString());
        }

        try {
          if (typeof gapgptService.runAutomatedScalping === 'function') {
            const result = await gapgptService.runAutomatedScalping();

            if (isCancelled) return;

            if (result?.opportunities?.length > 0) {
              addNotification(`فرصت‌های جدید: ${result.opportunities.join(', ')}`, 'success');
              setScalpingAlert(true);
            }
          }
        } finally {
          if (typeof storageService.removeItem === 'function') {
            storageService.removeItem(lockKey);
          }
        }
      } catch (error) {
        console.error('Scalping scan failed:', error);
      } finally {
        scanInProgress = false;
      }
    };

    void checkScalping();
    scalpingCheckIntervalRef.current = setInterval(checkScalping, TIMING.SCAN_CHECK_INTERVAL);

    return () => {
      isCancelled = true;

      if (scalpingCheckIntervalRef.current) {
        clearInterval(scalpingCheckIntervalRef.current);
        scalpingCheckIntervalRef.current = null;
      }
    };
  }, [currentUser, isOnline, isExpired, addNotification]);

  useEffect(() => {
    if (marketIndexCheckIntervalRef.current) {
      clearInterval(marketIndexCheckIntervalRef.current);
      marketIndexCheckIntervalRef.current = null;
    }

    if (!currentUser || !isOnline) {
      return;
    }

    let isCancelled = false;
    let updateInProgress = false;

    const checkMarketIndex = async () => {
      if (isCancelled || updateInProgress) return;
      updateInProgress = true;

      try {
        if (typeof apiConfigService.getMarketIndexSchedule !== 'function') return;

        const schedule = apiConfigService.getMarketIndexSchedule();
        if (!schedule?.isEnabled) return;

        const now = new Date();
        if (!Array.isArray(schedule.days) || !schedule.days.includes(now.getDay())) return;

        if (typeof gapgptService.updateMarketIndex === 'function') {
          await gapgptService.updateMarketIndex();
        }
      } catch (error) {
        console.error('Market index update failed:', error);
      } finally {
        updateInProgress = false;
      }
    };

    void checkMarketIndex();
    marketIndexCheckIntervalRef.current = setInterval(
      checkMarketIndex,
      TIMING.MARKET_CHECK_INTERVAL,
    );

    return () => {
      isCancelled = true;

      if (marketIndexCheckIntervalRef.current) {
        clearInterval(marketIndexCheckIntervalRef.current);
        marketIndexCheckIntervalRef.current = null;
      }
    };
  }, [currentUser, isOnline]);

  const buildSafeUser = useCallback(
    (baseUser: StoredUser, incomingUser?: Partial<StoredUser> | null): StoredUser => ({
      ...baseUser,
      ...(incomingUser || {}),
      isAdmin: incomingUser?.isAdmin ?? baseUser.isAdmin ?? false,
      role: incomingUser?.role || baseUser.role || 'user',
      id: baseUser.id,
      username: baseUser.username,
    }),
    [],
  );

  const persistUser = useCallback((user: StoredUser) => {
    if (typeof authService.setCurrentUser === 'function') {
      authService.setCurrentUser(user);
    } else {
      localStorage.setItem('user', JSON.stringify(user));
    }
  }, []);

  const handleLogin = useCallback(
    async (user: StoredUser) => {
      const safeUser = buildSafeUser(user);

      setCurrentUser(safeUser);
      persistUser(safeUser);

      if (typeof authService.isAccountExpired === 'function') {
        setIsExpired(authService.isAccountExpired(safeUser));
      } else {
        setIsExpired(false);
      }

      setActiveTab('analysis');
      setInitError(null);
      setShowWelcomeBanner(true);
      setIsNotificationsOpen(false);
      setViewingNotification(null);
      setIsTseMenuOpen(false);

      if (typeof notificationService.checkAndSendExpiryNotification === 'function') {
        try {
          notificationService.checkAndSendExpiryNotification(safeUser);
        } catch (error) {
          console.error('[handleLogin] checkAndSendExpiryNotification failed:', error);
        }
      }

      refreshUnreadCount(safeUser);
    },
    [buildSafeUser, persistUser, refreshUnreadCount],
  );

  const handleTabClick = useCallback(
    (tab: Tab) => {
      if (activeTab === 'settings' && tab !== 'settings') {
        setInitialSettingsTab(undefined);
      }

      setActiveTab(tab);

      if (tab === 'scalping') {
        setScalpingAlert(false);
        if (typeof storageService.removeItem === 'function') {
          storageService.removeItem('ronia_new_scalping_alert');
        }
      }

      if (tab !== 'notifications') {
        setIsNotificationsOpen(false);
      }
    },
    [activeTab],
  );

  const handlePasswordChange = useCallback(
    async (currentPass: string, newPass: string) => {
      if (!currentUser) {
        throw new Error('کاربر وارد نشده است.');
      }

      if (typeof authService.changePassword !== 'function') {
        throw new Error('سرویس تغییر رمز عبور در دسترس نیست.');
      }

      await authService.changePassword(currentPass, newPass);

      const freshUser =
        typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;

      if (freshUser) {
        const safeUser = buildSafeUser(currentUser, freshUser);

        setCurrentUser(safeUser);
        persistUser(safeUser);

        if (typeof authService.isAccountExpired === 'function') {
          setIsExpired(authService.isAccountExpired(safeUser));
        }
      }

      console.log('[APP] Password changed successfully, forcing logout.');
      handleLogout();
    },
    [buildSafeUser, currentUser, persistUser],
  );

  const handleProfileUpdate = useCallback(
    (updatedUser: StoredUser) => {
      if (!currentUser) return;

      const safeUser = buildSafeUser(currentUser, updatedUser);

      setCurrentUser(safeUser);
      persistUser(safeUser);

      if (typeof authService.isAccountExpired === 'function') {
        setIsExpired(authService.isAccountExpired(safeUser));
      }

      console.log('[APP] Profile updated, user state refreshed with safe merge');
    },
    [buildSafeUser, currentUser, persistUser],
  );

  const handleToggleNotifications = useCallback(() => {
    setIsNotificationsOpen((prev) => !prev);
  }, []);

  const handleToggleTseMenu = useCallback(() => {
    setIsTseMenuOpen((prev) => !prev);
  }, []);

  const handleViewNotification = useCallback(
    (notification: AppNotification) => {
      setViewingNotification(notification);

      if (!notification.read && currentUser) {
        if (typeof notificationService.markSingleNotificationAsRead === 'function') {
          notificationService.markSingleNotificationAsRead(notification.id, currentUser.id);
        }

        refreshUnreadCount(currentUser);
      }
    },
    [currentUser, refreshUnreadCount],
  );

  const handleCloseNotificationModal = useCallback(() => {
    setViewingNotification(null);
  }, []);

  const handleCloseWelcomeBanner = useCallback(() => {
    setShowWelcomeBanner(false);
  }, []);

  const renderContent = useCallback(() => {
    if (!currentUser) return null;

    if (isExpired && !['profile', 'settings'].includes(activeTab)) {
      return <AccessDenied />;
    }

    switch (activeTab) {
      case 'analysis':
        return <StockAnalysis currentUser={currentUser} isOnline={isOnline} />;

      case 'scalping':
        return <Scalping isOnline={isOnline} />;

      case 'portfolio':
        return (
          <Portfolio
            onAlertChange={setPortfolioAlert}
            currentUser={currentUser}
            isOnline={isOnline}
          />
        );

      case 'comparison':
        return <StockComparison currentUser={currentUser} isOnline={isOnline} />;

      case 'dailyFilters':
        return <DailyFilters />;

      case 'profile':
        return (
          <UserProfile
            currentUser={currentUser}
            onProfileUpdate={handleProfileUpdate}
            onPasswordChange={handlePasswordChange}
          />
        );

      case 'users':
        return currentUser.isAdmin ? (
          <UserManagement
            isOnline={isOnline}
            onMessageUpdate={() => refreshUnreadCount(currentUser)}
            onlineCount={onlineUserCount}
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            <LockClosedIcon className="h-8 w-8 mx-auto mb-2" />
            <p>شما دسترسی ندارید.</p>
          </div>
        );

      case 'notifications':
        return currentUser.isAdmin ? (
          <NotificationsManagement isOnline={isOnline} />
        ) : (
          <div className="text-center py-8 text-gray-500">
            <LockClosedIcon className="h-8 w-8 mx-auto mb-2" />
            <p>شما دسترسی ندارید.</p>
          </div>
        );

      case 'settings':
        return <Settings currentUser={currentUser} initialTab={initialSettingsTab} />;

      default:
        return isExpired ? (
          <AccessDenied />
        ) : (
          <StockAnalysis currentUser={currentUser} isOnline={isOnline} />
        );
    }
  }, [
    activeTab,
    currentUser,
    handlePasswordChange,
    handleProfileUpdate,
    initialSettingsTab,
    isExpired,
    isOnline,
    onlineUserCount,
    refreshUnreadCount,
  ]);

  if (isInitializing) return <SplashScreen />;

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <p className="text-red-600 dark:text-red-400 mt-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
          >
            بارگذاری مجدد
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) return <Login onLogin={handleLogin} />;

  return (
    <>
      {showWelcomeBanner && <WelcomeBanner onClose={handleCloseWelcomeBanner} />}

      <div
        className={`app-shell min-h-screen text-[var(--app-color)] flex flex-col p-3 sm:p-4 lg:p-6 transition-colors duration-300 ${
          !isOnline && !currentUser.isAdmin ? 'pt-12' : ''
        }`}
      >
        {!isOnline && !currentUser.isAdmin && <OfflineBanner />}

        <header
          data-style-id="header"
          data-style-name="هدر اصلی"
          className="app-header flex items-center justify-between px-3 sm:px-5 py-3 border-b"
          style={{
            backgroundColor: 'var(--header-bg)',
            borderColor: 'var(--header-border-color)',
          }}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="brand-lockup">
              <img src="/2.png" alt="لوگوی رونیا" className="brand-logo h-14 w-14 sm:h-16 sm:w-16 object-contain shrink-0" />
              <div className="brand-copy min-w-0">
                <h1 className="brand-title whitespace-nowrap text-base sm:text-lg lg:text-xl font-extrabold tracking-tight">
                  تحلیلگر هوشمند بورس <span>رونیا</span>
                </h1>
                <p className="brand-subtitle hidden sm:block">هوشمندی داده‌محور برای تصمیم‌گیری بهتر در بازار سرمایه</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Clock />
            <MarketIndex isOnline={isOnline} />
          </div>

          <div className="flex items-center justify-self-center lg:justify-self-end gap-2 relative">
            <ValidityBadge validityInfo={validityInfo} />

            {currentUser.isAdmin && onlineUserCount > 0 && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                {onlineUserCount} آنلاین
              </span>
            )}

            <button
              onClick={handleToggleNotifications}
              className="relative p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="اطلاعیه‌ها"
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 items-center justify-center text-white text-[10px] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div
                ref={notificationPanelRef}
                className="absolute top-12 left-0 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-20"
              >
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 font-semibold flex justify-between items-center">
                  <span>اطلاعیه‌ها</span>
                  {unreadCount > 0 && (
                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                      {unreadCount} خوانده نشده
                    </span>
                  )}
                </div>

                {notifications.length > 0 ? (
                  <ul>
                    {notifications.map((n) => (
                      <li
                        key={n.id}
                        onClick={() => handleViewNotification(n)}
                        className={`p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                          !n.read ? 'font-bold bg-blue-50/50 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        <p className="text-sm line-clamp-2 text-right">{n.message}</p>
                        <p className="text-xs text-gray-500 mt-1 text-right">{formatRelativeTime(n.timestamp)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-sm text-center text-gray-500">اطلاعیه جدیدی وجود ندارد.</p>
                )}
              </div>
            )}

            <button
              onClick={() => handleTabClick('profile')}
              className="flex items-center gap-2 text-sm font-semibold p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="پروفایل"
            >
              <UserCircleIcon />
              <span className="hidden sm:inline">{currentUser.firstName || currentUser.username}</span>
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-red-500 hover:text-red-600"
              title="خروج"
            >
              <ArrowRightOnRectangleIcon />
            </button>
          </div>
        </header>

        <nav className="app-nav mb-4 sm:mb-6" aria-label="ناوبری اصلی">
          <div className="app-nav-scroll flex flex-wrap items-center border-b border-gray-200 dark:border-gray-700">
            <TabButton
              tab="analysis"
              label="تحلیل سهام"
              icon={<MagnifyingGlassIcon />}
              alertType="none"
              locked={isExpired}
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />

            <TabButton
              tab="scalping"
              label="نوسان‌گیری"
              icon={<ChartBarIcon />}
              alertType={scalpingAlert ? 'cyan' : 'none'}
              locked={isExpired}
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />

            <TabButton
              tab="portfolio"
              label="سبد سهام"
              icon={<BriefcaseIcon />}
              alertType={portfolioAlert === 'buy' ? 'green' : portfolioAlert === 'sell' ? 'red' : 'none'}
              locked={isExpired}
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />

            <TabButton
              tab="comparison"
              label="مقایسه"
              icon={<ClipboardDocumentIcon />}
              alertType="none"
              locked={isExpired}
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />

            <TabButton
              tab="dailyFilters"
              label="فیلترهای روزانه"
              icon={<PresentationChartLineIcon />}
              alertType="none"
              locked={isExpired}
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />

            {currentUser.isAdmin && (
              <>
                <TabButton
                  tab="users"
                  label="کاربران"
                  icon={<UserGroupIcon />}
                  alertType="none"
                  activeTab={activeTab}
                  onTabClick={handleTabClick}
                />

                <TabButton
                  tab="notifications"
                  label="اطلاعیه‌ها"
                  icon={<MegaphoneIcon />}
                  alertType="none"
                  activeTab={activeTab}
                  onTabClick={handleTabClick}
                />
              </>
            )}

            <div className="relative" ref={tseMenuRef}>
              <button
                onClick={handleToggleTseMenu}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors hover:bg-[var(--tab-inactive-hover-bg)]"
                style={{
                  color: 'var(--tab-inactive-color)',
                  fontFamily: 'var(--tab-inactive-font-family)',
                  fontSize: 'var(--tab-inactive-font-size)',
                }}
              >
                <GlobeAltIcon />
                <span>تالار بورس</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isTseMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isTseMenuOpen && tseLinks.length > 0 && (
                <div className="absolute top-full right-0 w-48 bg-white dark:bg-gray-800 rounded-b-lg shadow-xl border border-gray-200 dark:border-gray-700 z-10 py-2">
                  {tseLinks
                    .filter((link) => link.href)
                    .map((link) => (
                      <a
                        key={link.id}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors text-right"
                      >
                        {staticTseIcons[link.label] || <GlobeAltIcon className="w-4 h-4" />}
                        {link.label}
                      </a>
                    ))}
                </div>
              )}
            </div>

            <TabButton
              tab="profile"
              label="پروفایل"
              icon={<UserCircleIcon />}
              alertType="none"
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />

            <TabButton
              tab="settings"
              label="تنظیمات"
              icon={<Cog6ToothIcon />}
              alertType="none"
              activeTab={activeTab}
              onTabClick={handleTabClick}
            />
          </div>
        </nav>

        <main className="app-main flex-grow" data-page={activeTab}>
          <LazyErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>{renderContent()}</Suspense>
          </LazyErrorBoundary>
        </main>
      </div>

      {viewingNotification && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={handleCloseNotificationModal}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-semibold text-gray-800 dark:text-white">جزئیات اطلاعیه</h3>
              <button
                onClick={handleCloseNotificationModal}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-right">
                {new Date(viewingNotification.timestamp).toLocaleString('fa-IR')}
              </p>

              <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap text-right">
                {viewingNotification.message}
              </p>

              {viewingNotification.attachment && (
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-right">
                  <p className="text-sm font-semibold mb-2">پیوست:</p>
                  <a
                    href={viewingNotification.attachment.data}
                    download={viewingNotification.attachment.name}
                    className="flex items-center gap-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-cyan-600 dark:text-cyan-400 flex-row-reverse"
                  >
                    <PaperclipIcon className="h-5 w-5" />
                    <span className="text-sm underline">{viewingNotification.attachment.name}</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
