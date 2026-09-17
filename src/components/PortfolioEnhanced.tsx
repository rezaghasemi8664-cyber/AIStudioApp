import React, { useState } from 'react';
import Portfolio from './Portfolio';
import PortfolioWatchlists from './PortfolioWatchlists';
import WatchlistAlerts from './WatchlistAlerts';
import StockProfile from './StockProfile';
import SmartScore from './SmartScore';
import type { PortfolioAlertType } from '../types';
import type { StoredUser } from '../services/authService';

interface PortfolioEnhancedProps {
  onAlertChange: (alertType: PortfolioAlertType) => void;
  currentUser: StoredUser;
  isOnline: boolean;
}

const PortfolioEnhanced: React.FC<PortfolioEnhancedProps> = ({ onAlertChange, currentUser, isOnline }) => {
  const [activeSection, setActiveSection] = useState<'portfolio' | 'watchlist' | 'alerts' | 'profile' | 'smartScore'>('portfolio');
  const [smartScoreSymbol, setSmartScoreSymbol] = useState('');

  return (
    <div dir="rtl" className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        <button type="button" onClick={() => setActiveSection('portfolio')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'portfolio' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>سبد سهام</button>
        <button type="button" onClick={() => setActiveSection('watchlist')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'watchlist' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>دیده‌بان حرفه‌ای</button>
        <button type="button" onClick={() => setActiveSection('alerts')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'alerts' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>هشدارهای دیده‌بان</button>
        <button type="button" onClick={() => setActiveSection('profile')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'profile' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>پروفایل سهم</button>
        <button type="button" onClick={() => setActiveSection('smartScore')} className={`shrink-0 px-5 py-3 rounded-t-xl font-bold transition ${activeSection === 'smartScore' ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Smart Score</button>
      </div>
      {activeSection === 'portfolio' ? <Portfolio onAlertChange={onAlertChange} currentUser={currentUser} isOnline={isOnline} /> : activeSection === 'watchlist' ? <PortfolioWatchlists currentUser={currentUser} isOnline={isOnline} /> : activeSection === 'alerts' ? <WatchlistAlerts isOnline={isOnline} /> : activeSection === 'profile' ? <StockProfile isOnline={isOnline} /> : <div className="space-y-4"><div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><label className="block text-sm font-bold mb-2">نماد</label><div className="flex gap-2"><input value={smartScoreSymbol} onChange={e => setSmartScoreSymbol(e.target.value.toUpperCase())} placeholder="مثلاً فملی" className="flex-1 rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2" /><button type="button" onClick={() => setSmartScoreSymbol(smartScoreSymbol.trim().toUpperCase())} className="rounded-xl bg-cyan-600 text-white px-5 py-2 font-bold">محاسبه</button></div></div><SmartScore symbol={smartScoreSymbol} isOnline={isOnline} /></div>}
    </div>
  );
};

export default PortfolioEnhanced;
