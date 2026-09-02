import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDaysIcon } from './Icons';

// Iran uses a fixed UTC+03:30 offset since DST was abolished.
// We intentionally do not use the browser's local timezone or the IANA
// Asia/Tehran timezone database here, so the displayed clock cannot drift
// because of the user's OS/browser timezone rules.
const TEHRAN_UTC_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;

const Clock: React.FC = () => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timerId = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => window.clearInterval(timerId);
    }, []);

    // Convert the current UTC instant to Tehran wall-clock time using the
    // fixed +03:30 offset, then format that value explicitly as UTC. This
    // removes every dependency on the client machine's timezone settings.
    const tehranDate = useMemo(
        () => new Date(now + TEHRAN_UTC_OFFSET_MS),
        [now],
    );

    const shamsiDate = useMemo(
        () => new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
            calendar: 'persian',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
            timeZone: 'UTC',
        }).format(tehranDate),
        [tehranDate],
    );

    const gregorianDate = useMemo(
        () => new Intl.DateTimeFormat('en-US', {
            calendar: 'gregory',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
        }).format(tehranDate),
        [tehranDate],
    );

    const currentTime = useMemo(
        () => new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC',
        }).format(tehranDate),
        [tehranDate],
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
