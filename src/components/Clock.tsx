import React, { useState, useEffect } from 'react';
import { CalendarDaysIcon } from './Icons';

const Clock: React.FC = () => {
    const [date, setDate] = useState(new Date());

    useEffect(() => {
        const timerId = setInterval(() => {
            setDate(new Date());
        }, 1000);
        return () => clearInterval(timerId);
    }, []);

    // Formatter for Shamsi date, using Tehran time zone and Latin numerals
    const shamsiFormatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'Asia/Tehran',
    });

    // Formatter for Gregorian date, using Tehran time zone
    const gregorianFormatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Tehran',
    });

    // Formatter for time, using Tehran time zone
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Tehran',
    });
    
    const shamsiDate = shamsiFormatter.format(date);
    const gregorianDate = gregorianFormatter.format(date);
    const currentTime = timeFormatter.format(date);

    return (
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
            <CalendarDaysIcon className="h-6 w-6 text-cyan-600 dark:text-cyan-500 flex-shrink-0" />
            <div className="text-right">
                <p className="font-semibold text-gray-800 dark:text-gray-300 whitespace-nowrap font-mono">{shamsiDate}</p>
                <div className="flex items-center justify-end gap-2">
                    <p className="font-mono text-xs">{gregorianDate}</p>
                     <span className="text-gray-400 dark:text-gray-600">|</span>
                    <p className="font-mono">{currentTime}</p>
                </div>
            </div>
        </div>
    );
};

export default Clock;