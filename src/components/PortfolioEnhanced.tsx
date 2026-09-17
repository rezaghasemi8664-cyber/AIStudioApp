import React, { useState } from 'react';
import Portfolio from './Portfolio';
import PortfolioWatchlists from './PortfolioWatchlists';
import WatchlistAlerts from './WatchlistAlerts';
import StockProfile from './StockProfile';
import type { PortfolioAlertType } from '../types';
import type { StoredUser } from '../services/authService';

interface PortfolioEnhancedProps {
  onAlertChange: (alertType: PortfolioAlertType) => void;
  currentUser: StoredUser;
  isOnline: boolean;
}

const PortfolioEnhanced: React.FC<PortfolioEnhancedProps> = ({ onAlertChange, currentUser, isOnline }) => {
  const [activeSection, setActiveSection] = useState<'portfolio' | 'watchlist' | 'alerts' | 'profile'>('portfolio');

  return (
    <div dir="rtl" className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        <button type="button" onClick={() => setActiveSection('portfolio')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'portfolio' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>سبد سهام</button>
        <button type="button" onClick={() => setActiveSection('watchlist')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'watchlist' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>دیده‌بان حرفه‌ای</button>
        <button type="button" onClick={() => setActiveSection('alerts')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'alerts' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>هشدارهای دیده‌بان</button>
        <button type="button" onClick={() => setActiveSection('profile')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'profile' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>پروفایل سهم</button>
      </div>
      {activeSection === 'portfolio' ? <Portfolio onAlertChange={onAlertChange} currentUser={currentUser} isOnline={isOnline} /> : activeSection === 'watchlist' ? <PortfolioWatchlists currentUser={currentUser} isOnline={isOnline} /> : activeSection === 'alerts' ? <WatchlistAlerts isOnline={isOnline} /> : <StockProfile isOnline={isOnline} />}
    </div>
  );
};

export default PortfolioEnhanced;
