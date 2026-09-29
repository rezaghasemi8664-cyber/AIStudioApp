import React, { useEffect, useState } from 'react';
import { XMarkIcon, InfoIcon } from './Icons';
import * as themeService from '../services/themeService';
import type { WelcomeBannerConfig } from '../types';

interface WelcomeBannerProps {
    onClose: () => void;
}

const EMPTY_CONFIG: WelcomeBannerConfig = {
    text: '',
    durationSeconds: 10,
};

const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ onClose }) => {
    const [config, setConfig] = useState<WelcomeBannerConfig>(EMPTY_CONFIG);
    const [progress, setProgress] = useState(100);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

        const loadConfig = async () => {
            for (let attempt = 0; attempt < 4; attempt += 1) {
                try {
                    const loaded = await themeService.getWelcomeBannerConfig();
                    if (cancelled) return;

                    const text = typeof loaded?.text === 'string' ? loaded.text.trim() : '';
                    if (!text) {
                        onClose();
                        return;
                    }

                    setConfig({
                        text,
                        durationSeconds: Math.max(1, Math.min(120, Math.trunc(Number(loaded.durationSeconds) || 10))),
                    });
                    setProgress(100);
                    setVisible(true);
                    return;
                } catch (error) {
                    console.error('[WelcomeBanner] Error loading global banner config:', error);
                    if (attempt < 3) await sleep(400 * (attempt + 1));
                }
            }

            if (!cancelled) onClose();
        };

        void loadConfig();
        return () => {
            cancelled = true;
        };
    }, [onClose]);

    useEffect(() => {
        if (!config.text.trim()) return;

        const intervalMs = 100;
        const totalMs = Math.max(config.durationSeconds, 1) * 1000;
        const step = (intervalMs / totalMs) * 100;

        const timer = window.setInterval(() => {
            setProgress(prev => {
                const next = prev - step;
                if (next <= 0) {
                    window.clearInterval(timer);
                    handleClose();
                    return 0;
                }
                return next;
            });
        }, intervalMs);

        return () => {
            window.clearInterval(timer);
        };
    }, [config.durationSeconds, config.text]);

    const handleClose = () => {
        setVisible(false);
        window.setTimeout(onClose, 500);
    };

    return (
        <div className={`roniya-welcome-banner fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            <div
                className={`roniya-welcome-card relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-700 ${visible ? 'translate-y-0 scale-100' : 'translate-y-full scale-90'}`}
                style={{
                    fontFamily: 'var(--welcome-banner-text-font-family, inherit)',
                    backgroundColor: '#ffffff',
                    color: '#17202b',
                    border: '1px solid #dbe4eb',
                }}
            >
                <div className="p-1">
                    <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" style={{ width: `${progress}%`, transition: 'width 0.1s linear' }} />
                </div>

                <div className="roniya-welcome-content p-6 sm:p-8 text-center">
                    <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 animate-bounce">
                        <InfoIcon className="w-8 h-8" />
                    </div>

                    <h2 className="text-2xl font-bold mb-4" style={{ color: '#17202b' }}>خوش آمدید</h2>

                    <div
                        className="leading-relaxed mb-8 text-justify"
                        style={{
                            fontSize: 'var(--welcome-banner-text-font-size, 16px)',
                            color: '#263746',
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
                    className="absolute top-4 left-4 p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};

export default WelcomeBanner;
