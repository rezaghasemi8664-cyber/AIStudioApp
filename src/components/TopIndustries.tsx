import React, { useState, useEffect } from 'react';
import { getTopIndustryGroups } from '../services/geminiService';
import type { TopIndustryGroup } from '../types';
import { BriefcaseIcon } from './Icons';

const formatValue = (value: number) => {
    // Value is likely in Rials, convert to billion Toman
    const billionToman = value / 10 / 1_000_000_000;
    return billionToman.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const ChangeDisplay: React.FC<{ value: number }> = ({ value }) => {
    const isPositive = value >= 0;
    const color = isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]';
    const sign = isPositive ? '+' : '';
    return <span className={`font-mono font-bold ${color}`}>{sign}{value.toLocaleString('fa-IR')}%</span>
}

const TopIndustries: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
    const [data, setData] = useState<TopIndustryGroup[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOnline) {
            setLoading(false);
            setData([]);
            return;
        }

        const fetchData = async () => {
            try {
                const result = await getTopIndustryGroups();
                setData(result);
            } catch (error) {
                console.error("Failed to fetch top industries:", error);
            }
        };

        const initialFetch = async () => {
            setLoading(true);
            await fetchData();
            setLoading(false);
        };

        initialFetch();
        const intervalId = setInterval(fetchData, 60000); // Refetch every minute

        return () => clearInterval(intervalId);
    }, [isOnline]);

    return (
        <div 
          data-style-id="most-traded-card"
          className="p-4 rounded-lg"
          style={{ 
              backgroundColor: 'var(--most-traded-card-bg)', 
              color: 'var(--most-traded-card-color)',
              borderWidth: `var(--most-traded-card-border-width)`,
              borderStyle: `var(--most-traded-card-border-style)`,
              borderColor: `var(--most-traded-card-border-color)`,
          }}
        >
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <BriefcaseIcon className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                برترین گروه‌های صنعت
            </h3>
            <div className="overflow-hidden">
                <table className="w-full text-sm text-center">
                    <thead 
                        data-style-id="most-traded-header"
                        className="uppercase text-xs"
                        style={{ backgroundColor: 'var(--most-traded-header-bg)', color: 'var(--most-traded-header-color)' }}
                    >
                        <tr>
                            <th scope="col" className="px-2 py-3 text-right">گروه صنعت</th>
                            <th scope="col" className="px-2 py-3">ارزش (میلیارد تومان)</th>
                            <th scope="col" className="px-2 py-3">تغییر</th>
                        </tr>
                    </thead>
                    <tbody data-style-id="most-traded-rows">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, index) => (
                                <tr key={index} className="border-b border-[var(--table-border-color)] animate-pulse">
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                </tr>
                            ))
                        ) : (
                            data.map(item => (
                                <tr key={item.name} className="border-b border-[var(--table-border-color)] last:border-b-0">
                                    <td className="px-2 py-3 text-right font-semibold">{item.name}</td>
                                    <td className="px-2 py-3 font-mono">{formatValue(item.value)}</td>
                                    <td className="px-2 py-3"><ChangeDisplay value={item.change} /></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            {!isOnline && data.length === 0 && <p className="text-center text-xs text-gray-500 mt-2">این بخش در حالت آفلاین در دسترس نیست.</p>}
        </div>
    );
};

export default TopIndustries;