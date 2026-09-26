import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDaysIcon } from './Icons';

const SERVER_SYNC_INTERVAL_MS = 60 * 1000;
const TEHRAN_UTC_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;

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
    const tehranDate = useMemo(() => new Date(now + TEHRAN_UTC_OFFSET_MS), [now]);
    const shamsiDate = useMemo(() => new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
        calendar: 'persian', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC',
    }).format(tehranDate), [tehranDate]);
    const gregorianDate = useMemo(() => new Intl.DateTimeFormat('en-US', {
        calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(tehranDate), [tehranDate]);
    const currentTime = useMemo(() => new Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC',
    }).format(tehranDate), [tehranDate]);

    return (
        <div className="roniya-clock flex min-w-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-400 sm:gap-3">
            <CalendarDaysIcon className="h-5 w-5 flex-shrink-0 text-cyan-600 dark:text-cyan-500 sm:h-6 sm:w-6" />
            <div className="min-w-0 flex-1 text-right">
                <div className="flex min-w-0 items-center justify-end gap-1 whitespace-nowrap sm:gap-2">
                    <p className="min-w-0 truncate font-semibold text-gray-800 dark:text-gray-300 font-mono">{shamsiDate}</p>
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
