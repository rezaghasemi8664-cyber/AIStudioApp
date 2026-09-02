import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDaysIcon } from './Icons';

const TEHRAN_TIME_ZONE = 'Asia/Tehran';

const Clock: React.FC = () => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timerId = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => window.clearInterval(timerId);
    }, []);

    const date = useMemo(() => new Date(now), [now]);

    // All displayed date/time values are explicitly formatted in Tehran time.
    // This makes the clock independent of the browser/OS local timezone.
    const shamsiDate = useMemo(
        () => new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
            calendar: 'persian',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
            timeZone: TEHRAN_TIME_ZONE,
        }).format(date),
        [date],
    );

    const gregorianDate = useMemo(
        () => new Intl.DateTimeFormat('en-US', {
            calendar: 'gregory',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: TEHRAN_TIME_ZONE,
        }).format(date),
        [date],
    );

    const currentTime = useMemo(
        () => new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: TEHRAN_TIME_ZONE,
        }).format(date),
        [date],
    );

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
