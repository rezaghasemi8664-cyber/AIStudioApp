import React, { useState, useEffect } from 'react';
import { getMostTradedStocks } from '../services/geminiService';
import type { MostTradedStock } from '../types';
import { ChartBarIcon } from './Icons';

interface MostTradedStocksProps {
    onSymbolClick: (symbol: string) => void;
    isOnline: boolean;
}

const formatNumber = (num: number) => {
    if (num >= 1_000_000_000) {
        return `${(num / 1_000_000_000).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
    }
    if (num >= 1_000_000) {
        return `${(num / 1_000_000).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
    }
    return num.toLocaleString('fa-IR');
}


const MostTradedStocks: React.FC<MostTradedStocksProps> = ({ onSymbolClick, isOnline }) => {
    const [stocks, setStocks] = useState<MostTradedStock[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOnline) {
            setLoading(false);
            setStocks([]);
            return;
        }

        const fetchData = async () => {
            try {
                const data = await getMostTradedStocks();
                setStocks(data);
            } catch (error) {
                console.error("Failed to fetch most traded stocks:", error);
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
          data-style-name="کارت پرتراکنش‌ها"
          className="p-4 rounded-lg"
          style={{ 
              backgroundColor: 'var(--most-traded-card-bg)',
              color: 'var(--most-traded-card-color)',
              fontFamily: 'var(--most-traded-card-font-family)',
              fontSize: `var(--most-traded-card-font-size)`,
              borderWidth: `var(--most-traded-card-border-width)`,
              borderStyle: `var(--most-traded-card-border-style)`,
              borderColor: `var(--most-traded-card-border-color)`,
          }}
        >
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ChartBarIcon className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                بیشترین حجم معاملات
            </h3>
            <div className="overflow-hidden">
                <table className="w-full text-sm text-center">
                    <thead 
                        data-style-id="most-traded-header"
                        data-style-name="هدر پرتراکنش‌ها"
                        className="uppercase text-xs"
                        style={{ 
                            backgroundColor: 'var(--most-traded-header-bg)',
                            color: 'var(--most-traded-header-color)',
                            fontFamily: 'var(--most-traded-header-font-family)',
                            fontSize: `var(--most-traded-header-font-size)`
                        }}
                    >
                        <tr>
                            <th scope="col" className="px-2 py-3 text-right">نماد</th>
                            <th scope="col" className="px-2 py-3">آخرین قیمت</th>
                            <th scope="col" className="px-2 py-3">تعداد</th>
                            <th scope="col" className="px-2 py-3">حجم</th>
                        </tr>
                    </thead>
                    <tbody
                         data-style-id="most-traded-rows"
                         data-style-name="ردیف‌های پرتراکنش‌ها"
                         style={{ 
                            color: 'var(--most-traded-rows-color)',
                            fontFamily: 'var(--most-traded-rows-font-family)',
                            fontSize: `var(--most-traded-rows-font-size)`
                         }}
                    >
                        {loading ? (
                            Array.from({ length: 7 }).map((_, index) => (
                                <tr key={index} className="border-b border-[var(--table-border-color)] animate-pulse">
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                    <td className="px-2 py-4"><div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div></td>
                                </tr>
                            ))
                        ) : (
                            stocks.map(stock => (
                                <tr key={stock.symbol} className="border-b border-[var(--table-border-color)] last:border-b-0" style={{ backgroundColor: 'var(--most-traded-rows-bg)' }}>
                                    <td className="px-2 py-3 text-right">
                                        <button 
                                            onClick={() => onSymbolClick(stock.symbol)}
                                            className="font-bold text-cyan-700 dark:text-cyan-400 hover:underline"
                                            aria-label={`تحلیل سهم ${stock.symbol}`}
                                        >
                                            {stock.symbol}
                                        </button>
                                    </td>
                                    <td className="px-2 py-3 font-mono">{stock.lastPrice.toLocaleString('fa-IR')}</td>
                                    <td className="px-2 py-3 font-mono">{formatNumber(stock.tradeCount)}</td>
                                    <td className="px-2 py-3 font-mono">{formatNumber(stock.tradeVolume)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
             {!isOnline && stocks.length === 0 && <p className="text-center text-xs text-gray-500 mt-2">این بخش در حالت آفلاین در دسترس نیست.</p>}
        </div>
    );
};

export default MostTradedStocks;