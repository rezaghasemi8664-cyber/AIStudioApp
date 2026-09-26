import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDaysIcon } from './Icons';

const SERVER_SYNC_INTERVAL_MS = 60 * 1000;
type ServerClockState = { serverNowMs: number; syncedAtMs: number; };

const getInitialClockState = (): ServerClockState => ({ serverNowMs: Date.now(), syncedAtMs: Date.now() });

const readServerTime = async (): Promise<ServerClockState | null> => {
    const startedAt = performance.now();
    try {
        const response = await fetch('/', { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
        const dateHeader = response.headers.get('date');
        if (!dateHeader) return null;
        const serverDateMs = Date.parse(dateHeader);
        if (!Number.isFinite(serverDateMs)) return null;
        const roundTripMs = performance.now() - startedAt;
        return { serverNowMs: serverDateMs + Math.max(0, roundTripMs / 2), syncedAtMs: performance.now() };
    } catch { return null; }
};

const Clock: React.FC = () => {
    const [clockState, setClockState] = useState<ServerClockState>(getInitialClockState);
    const [tick, setTick] = useState(() => performance.now());

    useEffect(() => {
        let mounted = true;
        let syncTimerId: number | undefined;
        let tickTimerId: number | undefined;
        const syncWithServer = async () => {
            const synced = await readServerTime();
            if (mounted && synced) { setClockState(synced); setTick(performance.now()); }
        };
        void syncWithServer();
        tickTimerId = window.setInterval(() => { if (mounted) setTick(performance.now()); }, 1000);
        syncTimerId = window.setInterval(() => { void syncWithServer(); }, SERVER_SYNC_INTERVAL_MS);
        return () => {
            mounted = false;
            if (tickTimerId !== undefined) window.clearInterval(tickTimerId);
            if (syncTimerId !== undefined) window.clearInterval(syncTimerId);
        };
    }, []);

    const now = useMemo(() => clockState.serverNowMs + (tick - clockState.syncedAtMs), [clockState, tick]);

    const tehranTimeZone = 'Asia/Tehran';

    const shamsiDate = useMemo(() => new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: tehranTimeZone,
    }).format(new Date(now)), [now]);

    const gregorianDate = useMemo(() => new Intl.DateTimeFormat('en-US', {
        calendar: 'gregory',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: tehranTimeZone,
    }).format(new Date(now)), [now]);

    const currentTime = useMemo(() => new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: tehranTimeZone,
    }).format(new Date(now)), [now]);

    return (
        <div className="roniya-clock flex min-w-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-400 sm:gap-3">
            <CalendarDaysIcon className="h-5 w-5 flex-shrink-0 text-cyan-600 dark:text-cyan-500 sm:h-6 sm:w-6" />
            <div className="min-w-0 flex-1 text-right">
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-0.5 sm:flex-nowrap sm:gap-x-2">
                    <p className="min-w-0 max-w-full truncate font-semibold text-gray-800 dark:text-gray-300 font-mono">{shamsiDate}</p>
                    <span className="flex-shrink-0 text-gray-400 dark:text-gray-600">|</span>
                    <p className="flex-shrink-0 font-mono text-[10px] sm:text-xs">{gregorianDate}</p>
                    <span className="flex-shrink-0 text-gray-400 dark:text-gray-600">|</span>
                    <p className="flex-shrink-0 font-mono text-[11px] sm:text-sm">{currentTime}</p>
                </div>
            </div>
        </div>
    );
};

export default Clock;
