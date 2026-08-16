import React, { useState, useEffect } from 'react';
import { RoniaLogo } from './Icons';

interface LoginSimulationProps {
    onComplete: () => void;
}

const steps = [
    "در حال احراز هویت ادمین...",
    "بررسی دسترسی‌های مدیریتی...",
    "بارگذاری ماژول‌های ادمین...",
    "خوش آمدید، ادمین!"
];

const LoginSimulation: React.FC<LoginSimulationProps> = ({ onComplete }) => {
    const [stepIndex, setStepIndex] = useState(0);
    const [fadingOut, setFadingOut] = useState(false);

    useEffect(() => {
        if (stepIndex < steps.length - 1) {
            const timer = setTimeout(() => {
                setStepIndex(stepIndex + 1);
            }, 1200); // Time each step is visible
            return () => clearTimeout(timer);
        } else {
            // Last step, wait then start fading out
            const fadeOutTimer = setTimeout(() => {
                setFadingOut(true);
            }, 1000);
            const completionTimer = setTimeout(() => {
                onComplete();
            }, 1500); // 1000ms wait + 500ms fade-out animation
            return () => {
                clearTimeout(fadeOutTimer);
                clearTimeout(completionTimer);
            };
        }
    }, [stepIndex, onComplete]);

    return (
        <div 
            className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-900/95 backdrop-blur-sm transition-opacity duration-500 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}
        >
            <div className="flex flex-col items-center gap-6 animate-fade-in">
                <RoniaLogo className="h-24 w-24 text-cyan-400" />
                <div className="h-8">
                    <p key={stepIndex} className="text-lg text-gray-200 animate-fade-in">
                        {steps[stepIndex]}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginSimulation;
