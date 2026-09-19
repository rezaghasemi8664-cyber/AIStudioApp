import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as apiEndpointService from '../services/apiEndpointService';
import type { ApiEndpoint, FeatureKey } from '../types';
import { useNotification } from './NotificationSystem';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowDownOnSquareIcon } from './Icons';
import * as storageService from '../services/storageService';

const FEATURE_KEYS: FeatureKey[] = ['analysis', 'scalping', 'marketIndex', 'stockComparison', 'marketSummary', 'portfolio'];

const FeatureKeyManager: React.FC<{
    title: string;
    featureKey: FeatureKey;
    assignedKeys: string[];
    allEndpoints: ApiEndpoint[];
    onAddKey: (feature: FeatureKey, keyName: string) => void;
    onRemoveKey: (feature: FeatureKey, keyName: string) => void;
}> = ({ title, featureKey, assignedKeys, allEndpoints, onAddKey, onRemoveKey }) => {
    const [keyToAdd, setKeyToAdd] = useState('');

    const availableKeys = useMemo(
        () => allEndpoints.filter(endpoint => !assignedKeys.includes(endpoint.name)),
        [allEndpoints, assignedKeys]
    );

    useEffect(() => {
        if (availableKeys.some(endpoint => endpoint.name === keyToAdd)) return;
        setKeyToAdd(availableKeys[0]?.name ?? '');
    }, [availableKeys, keyToAdd]);

    return (
        <div className="py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="font-semibold mb-2">{title}</h4>
            <div className="space-y-2 mb-3">
                {assignedKeys.length > 0 ? assignedKeys.map((keyName, index) => (
                    <div key={keyName} className="flex items-center justify-between p-2 rounded-md bg-gray-100 dark:bg-gray-700/50">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-gray-300 dark:bg-gray-600 rounded-full h-5 w-5 flex items-center justify-center">{index + 1}</span>
                            <span className="font-semibold">{keyName}</span>
                        </div>
                        <button onClick={() => onRemoveKey(featureKey, keyName)} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="حذف از این لیست">
                            <TrashIcon className="h-4 w-4" />
                        </button>
                    </div>
                )) : (
                    <p className="text-xs text-center text-gray-500 p-2">هیچ کلیدی تخصیص داده نشده است.</p>
                )}
            </div>
            {availableKeys.length > 0 && (
                <div className="flex items-center gap-2">
                    <select value={keyToAdd} onChange={event => setKeyToAdd(event.target.value)} className="flex-grow border rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-700">
                        {availableKeys.map(endpoint => <option key={endpoint.id} value={endpoint.name}>{endpoint.name}</option>)}
                    </select>
                    <button onClick={() => onAddKey(featureKey, keyToAdd)} className="p-2 bg-green-600 text-white rounded-md hover:bg-green-700" title="افزودن کلید انتخاب شده">
                        <PlusIcon />
                    </button>
                </div>
            )}
        </div>
    );
};

const ApiKeysManagement: React.FC = () => {
    const { addNotification } = useNotification();
    const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingAssignments, setIsSavingAssignments] = useState(false);
    const [analysisKeys, setAnalysisKeys] = useState<string[]>([]);
    const [scalpingKeys, setScalpingKeys] = useState<string[]>([]);
    const [marketIndexKeys, setMarketIndexKeys] = useState<string[]>([]);
    const [stockComparisonKeys, setStockComparisonKeys] = useState<string[]>([]);
    const [marketSummaryKeys, setMarketSummaryKeys] = useState<string[]>([]);
    const [portfolioKeys, setPortfolioKeys] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');

    const setters: Record<FeatureKey, React.Dispatch<React.SetStateAction<string[]>>> = useMemo(() => ({
        analysis: setAnalysisKeys,
        scalping: setScalpingKeys,
        marketIndex: setMarketIndexKeys,
        stockComparison: setStockComparisonKeys,
        marketSummary: setMarketSummaryKeys,
        portfolio: setPortfolioKeys,
    }), []);

    const currentKeys: Record<FeatureKey, string[]> = useMemo(() => ({
        analysis: analysisKeys,
        scalping: scalpingKeys,
        marketIndex: marketIndexKeys,
        stockComparison: stockComparisonKeys,
        marketSummary: marketSummaryKeys,
        portfolio: portfolioKeys,
    }), [analysisKeys, scalpingKeys, marketIndexKeys, stockComparisonKeys, marketSummaryKeys, portfolioKeys]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, ...selectionResults] = await Promise.all([
                apiEndpointService.getEndpoints(),
                ...FEATURE_KEYS.map(feature => apiEndpointService.getSelectedEndpointsForFeature(feature)),
            ]);
            setEndpoints(data);
            FEATURE_KEYS.forEach((feature, index) => setters[feature](selectionResults[index] ?? []));
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'خطای نامشخص';
            addNotification(`خطا در دریافت لیست API ها: ${message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [addNotification, setters]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    const handleSaveToServer = async () => {
        setIsSaving(true);
        try {
            await apiEndpointService.saveEndpoints(endpoints);
            await storageService.forceSync();
            addNotification('لیست کلیدهای API با موفقیت در سرور ذخیره شد.', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'خطای نامشخص';
            addNotification(`خطا در ذخیره‌سازی: ${message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAssignments = async () => {
        setIsSavingAssignments(true);
        try {
            await Promise.all(FEATURE_KEYS.map(feature => apiEndpointService.setSelectedEndpointsForFeature(feature, currentKeys[feature])));
            await storageService.forceSync();
            addNotification('تخصیص کلیدها با موفقیت در سرور ذخیره شد.', 'success');
        } catch (error: unknown) {
            addNotification('خطا در ذخیره تخصیص‌ها.', 'error');
        } finally {
            setIsSavingAssignments(false);
        }
    };

    const handleAdd = () => {
        const name = newName.trim();
        const url = newUrl.trim();
        if (!name || !url) return;
        if (endpoints.some(endpoint => endpoint.name.toLowerCase() === name.toLowerCase())) {
            addNotification('یک کلید API با همین نام از قبل وجود دارد.', 'error');
            return;
        }
        setEndpoints(previous => [...previous, { id: `local_${Date.now()}`, name, url }]);
        setNewName('');
        setNewUrl('');
    };

    const handleRemove = async (id: string) => {
        const endpoint = endpoints.find(item => item.id === id);
        if (!endpoint) return;
        const keyName = endpoint.name;
        try {
            await Promise.all(FEATURE_KEYS.map(async feature => {
                const keys = await apiEndpointService.getSelectedEndpointsForFeature(feature);
                const nextKeys = keys.filter(key => key !== keyName);
                setters[feature](nextKeys);
                await apiEndpointService.setSelectedEndpointsForFeature(feature, nextKeys);
            }));
            setEndpoints(previous => previous.filter(item => item.id !== id));
            addNotification(`کلید ${keyName} و تمام تخصیص‌های آن حذف شد.`, 'info');
        } catch (error: unknown) {
            addNotification('خطا در حذف کلید و تخصیص‌های آن.', 'error');
        }
    };

    const startEditing = (endpoint: ApiEndpoint) => {
        setEditingId(endpoint.id);
        setEditName(endpoint.name);
        setEditUrl(endpoint.url);
    };

    const handleUpdate = async () => {
        if (!editingId) return;
        const oldName = endpoints.find(endpoint => endpoint.id === editingId)?.name;
        const name = editName.trim();
        const url = editUrl.trim();
        if (!name || !url) return;
        if (endpoints.some(endpoint => endpoint.id !== editingId && endpoint.name.toLowerCase() === name.toLowerCase())) {
            addNotification('یک کلید API با همین نام از قبل وجود دارد.', 'error');
            return;
        }
        try {
            if (oldName && oldName !== name) {
                await Promise.all(FEATURE_KEYS.map(async feature => {
                    const keys = await apiEndpointService.getSelectedEndpointsForFeature(feature);
                    const nextKeys = keys.map(key => key === oldName ? name : key);
                    setters[feature](nextKeys);
                    await apiEndpointService.setSelectedEndpointsForFeature(feature, nextKeys);
                }));
            }
            setEndpoints(previous => previous.map(endpoint => endpoint.id === editingId ? { ...endpoint, name, url } : endpoint));
            setEditingId(null);
        } catch (error: unknown) {
            addNotification('خطا در به‌روزرسانی کلید API.', 'error');
        }
    };

    const handleAddFeatureKey = async (feature: FeatureKey, keyName: string) => {
        if (!keyName || currentKeys[feature].includes(keyName)) return;
        const nextKeys = [...currentKeys[feature], keyName];
        setters[feature](nextKeys);
        try {
            await apiEndpointService.setSelectedEndpointsForFeature(feature, nextKeys);
        } catch (error: unknown) {
            setters[feature](currentKeys[feature]);
            addNotification('ذخیره تخصیص کلید انجام نشد.', 'error');
        }
    };

    const handleRemoveFeatureKey = async (feature: FeatureKey, keyName: string) => {
        const nextKeys = currentKeys[feature].filter(key => key !== keyName);
        setters[feature](nextKeys);
        try {
            await apiEndpointService.setSelectedEndpointsForFeature(feature, nextKeys);
        } catch (error: unknown) {
            setters[feature](currentKeys[feature]);
            addNotification('ذخیره حذف تخصیص انجام نشد.', 'error');
        }
    };

    if (loading) return <p>در حال بارگذاری تنظیمات API...</p>;

    return (
        <div className="space-y-8">
            <div className="p-6 rounded-lg shadow-md border border-[var(--card-border-color)]" style={{ backgroundColor: 'var(--settings-card-bg)' }}>
                <h3 className="text-lg font-semibold mb-4">مدیریت لیست کلیدهای API</h3>
                <div className="space-y-2 mb-4">
                    {endpoints.map(endpoint => (
                        <div key={endpoint.id} className="flex items-center gap-2 p-2 rounded-md bg-gray-100 dark:bg-gray-800/50">
                            {editingId === endpoint.id ? (
                                <>
                                    <input value={editName} onChange={event => setEditName(event.target.value)} placeholder="نام کلید" className="w-1/3 border rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" />
                                    <input value={editUrl} onChange={event => setEditUrl(event.target.value)} placeholder="آدرس API" className="flex-grow border rounded px-2 py-1 text-sm font-mono bg-white dark:bg-gray-700" />
                                    <button onClick={() => void handleUpdate()} className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full" title="ذخیره"><CheckIcon /></button>
                                    <button onClick={() => setEditingId(null)} className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="انصراف"><XMarkIcon /></button>
                                </>
                            ) : (
                                <>
                                    <span className="font-semibold w-1/3 truncate" title={endpoint.name}>{endpoint.name}</span>
                                    <span className="font-mono text-xs flex-grow text-gray-500 truncate" title={endpoint.url}>{endpoint.url}</span>
                                    <button onClick={() => startEditing(endpoint)} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full" title="ویرایش"><PencilIcon className="h-4 w-4" /></button>
                                    <button onClick={() => void handleRemove(endpoint.id)} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="حذف"><TrashIcon className="h-4 w-4" /></button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <input value={newName} onChange={event => setNewName(event.target.value)} placeholder="نام جدید کلید" className="w-1/3 border rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" />
                    <input value={newUrl} onChange={event => setNewUrl(event.target.value)} placeholder="آدرس جدید API" className="flex-grow border rounded px-2 py-1 text-sm font-mono bg-white dark:bg-gray-700" />
                    <button onClick={handleAdd} className="p-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700" title="افزودن"><PlusIcon /></button>
                </div>
                <div className="mt-6 flex justify-end">
                    <button onClick={() => void handleSaveToServer()} disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2">
                        {isSaving ? <><div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" /><span>در حال ذخیره...</span></> : <><ArrowDownOnSquareIcon className="h-5 w-5" /><span>ذخیره لیست در سرور</span></>}
                    </button>
                </div>
            </div>

            <div className="p-6 rounded-lg shadow-md border border-[var(--card-border-color)]" style={{ backgroundColor: 'var(--settings-card-bg)' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">تخصیص کلید به بخش‌ها</h3>
                    <button onClick={() => void handleSaveAssignments()} disabled={isSavingAssignments} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors">
                        {isSavingAssignments ? <><div className="w-3 h-3 border-2 border-t-transparent border-white rounded-full animate-spin" /><span>...</span></> : <><ArrowDownOnSquareIcon className="h-4 w-4" /><span>ذخیره تخصیص‌ها</span></>}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mb-4">به هر بخش می‌توانید چند کلید تخصیص دهید. سیستم به ترتیب از اولین کلید لیست استفاده خواهد کرد.</p>
                <FeatureKeyManager title="تحلیل سهم (پیش‌فرض)" featureKey="analysis" assignedKeys={analysisKeys} allEndpoints={endpoints} onAddKey={handleAddFeatureKey} onRemoveKey={handleRemoveFeatureKey} />
                <FeatureKeyManager title="مقایسه سهام" featureKey="stockComparison" assignedKeys={stockComparisonKeys} allEndpoints={endpoints} onAddKey={handleAddFeatureKey} onRemoveKey={handleRemoveFeatureKey} />
                <FeatureKeyManager title="سبد سهام (تحلیل و بهینه‌سازی)" featureKey="portfolio" assignedKeys={portfolioKeys} allEndpoints={endpoints} onAddKey={handleAddFeatureKey} onRemoveKey={handleRemoveFeatureKey} />
                <FeatureKeyManager title="خلاصه بازار (در تب تحلیل سهام)" featureKey="marketSummary" assignedKeys={marketSummaryKeys} allEndpoints={endpoints} onAddKey={handleAddFeatureKey} onRemoveKey={handleRemoveFeatureKey} />
                <FeatureKeyManager title="نوسان‌گیری" featureKey="scalping" assignedKeys={scalpingKeys} allEndpoints={endpoints} onAddKey={handleAddFeatureKey} onRemoveKey={handleRemoveFeatureKey} />
                <FeatureKeyManager title="شاخص بازار (در هدر)" featureKey="marketIndex" assignedKeys={marketIndexKeys} allEndpoints={endpoints} onAddKey={handleAddFeatureKey} onRemoveKey={handleRemoveFeatureKey} />
            </div>
        </div>
    );
};

export default ApiKeysManagement;
