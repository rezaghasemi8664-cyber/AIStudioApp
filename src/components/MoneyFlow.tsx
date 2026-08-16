import React, { useState, useEffect } from 'react';
import { getRealMoneyInflow, getRealMoneyOutflow } from '../services/geminiService';
import type { MoneyFlowStock } from '../types';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from './Icons';

interface MoneyFlowProps {
    type: 'inflow' | 'outflow';
    isOnline: boolean;
}

const formatValue = (value: number) => {
    // Value is likely in Rials, convert to billion Toman
    const billionToman = value / 10 / 1_000_000_000;
    return billionToman.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const MoneyFlow: React.FC<MoneyFlowProps> = ({ type, isOnline }) => {
    const [data, setData] = useState<MoneyFlowStock[]>([]);
    const [loading, setLoading] = useState(true);

    const config = {
        inflow: {
            title: 'ورود پول حقیقی',
            fetcher: getRealMoneyInflow,
            icon: <ArrowTrendingUpIcon className="h-6 w-6 text-green-500" />,
            textColor: 'text-green-700 dark:text-green-400',
        },
        outflow: {
            title: 'خروج پول حقیقی',
            fetcher: getRealMoneyOutflow,
            icon: <ArrowTrendingDownIcon className="h-6 w-6 text-red-500" />,
            textColor: 'text-red-700 dark:text-red-400',
        }
    };

    const currentConfig = config[type];

    useEffect(() => {
        if (!isOnline) {
            setLoading(false);
            setData([]);
            return;
        }

        const fetchData = async () => {
            try {
                const result = await currentConfig.fetcher();
                setData(result);
            } catch (error) {
                console.error(`Failed to fetch ${type}:`, error);
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
    }, [isOnline, type, currentConfig.fetcher]);
    
    // Using existing data-style-ids for consistency
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
                {currentConfig.icon}
                {currentConfig.title}
            </h3>
            <div className="overflow-hidden">
                <table className="w-full text-sm text-center">
                    <thead 
                        data-style-id="most-traded-header"
                        className="uppercase text-xs"
                        style={{ backgroundColor: 'var(--most-traded-header-bg)', color: 'var(--most-traded-header-color)' }}
                    >
                        <tr>
                            <th scope="col" className="px-2 py-3 text-right">نماد</th>
                            <th scope="col" className="px-2 py-3">ارزش (میلیارد تومان)</th>
                        </tr>
                    </thead>
                    <tbody data-style-id="most-traded-rows">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, index) => (
                                <tr key={index} className="border-b border-[var(--table-border-color)] animate-pulse">
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                </tr>
                            ))
                        ) : (
                            data.map(item => (
                                <tr key={item.symbol} className="border-b border-[var(--table-border-color)] last:border-b-0">
                                    <td className="px-2 py-3 text-right font-bold">{item.symbol}</td>
                                    <td className={`px-2 py-3 font-mono font-semibold ${currentConfig.textColor}`}>{formatValue(item.value)}</td>
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

export default MoneyFlow;