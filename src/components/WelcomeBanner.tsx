
import React, { useEffect, useState } from 'react';
import { XMarkIcon, InfoIcon } from './Icons';
import * as themeService from '../services/themeService';

interface WelcomeBannerProps {
    onClose: () => void;
}

const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ onClose }) => {
    const [config, setConfig] = useState(themeService.getWelcomeBannerConfig());
    const [progress, setProgress] = useState(100);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger entry animation
        setTimeout(() => setVisible(true), 100);

        const intervalMs = 100;
        const totalMs = config.durationSeconds * 1000;
        const step = (intervalMs / totalMs) * 100;

        const timer = setInterval(() => {
            setProgress(prev => {
                const next = prev - step;
                if (next <= 0) {
                    clearInterval(timer);
                    handleClose();
                    return 0;
                }
                return next;
            });
        }, intervalMs);

        return () => clearInterval(timer);
    }, [config.durationSeconds]);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 500); // Wait for exit animation
    };

    return (
        <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            <div 
                className={`relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-700 ${visible ? 'translate-y-0 scale-100' : 'translate-y-full scale-90'}`}
                style={{
                    fontFamily: 'var(--welcome-banner-text-font-family, inherit)',
                }}
            >
                <div className="p-1">
                     <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" style={{ width: `${progress}%`, transition: 'width 0.1s linear' }} />
                </div>
                
                <div className="p-6 sm:p-8 text-center">
                    <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 animate-bounce">
                        <InfoIcon className="w-8 h-8" />
                    </div>
                    
                    <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">خوش آمدید</h2>
                    
                    <div 
                        className="text-gray-600 dark:text-gray-300 leading-relaxed mb-8 text-justify"
                        style={{
                            fontSize: 'var(--welcome-banner-text-font-size, 16px)',
                            color: 'var(--welcome-banner-text-color, inherit)',
                        }}
                    >
                        {config.text}
                    </div>

                    <button 
                        onClick={handleClose}
                        className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg transform transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                    >
                        متوجه شدم
                    </button>
                </div>
                
                <button 
                    onClick={handleClose}
                    className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                >
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};

export default WelcomeBanner;
