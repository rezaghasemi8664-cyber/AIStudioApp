import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as apiEndpointService from '../services/apiEndpointService';
import type { ApiEndpoint, FeatureKey } from '../types';
import { useNotification } from './NotificationSystem';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowDownOnSquareIcon } from './Icons';
import * as storageService from '../services/storageService';

const FeatureKeyManager: React.FC<{
    title: string;
    featureKey: FeatureKey;
    assignedKeys: string[];
    allEndpoints: ApiEndpoint[];
    onAddKey: (feature: FeatureKey, keyName: string) => void;
    onRemoveKey: (feature: FeatureKey, keyName: string) => void;
}> = ({ title, featureKey, assignedKeys, allEndpoints, onAddKey, onRemoveKey }) => {
    const [keyToAdd, setKeyToAdd] = useState('');

    // Memoize availableKeys to prevent it from being a new array reference on every render.
    // This fixes the issue where selecting an option triggered a re-render, which reset the selection to the first item.
    const availableKeys = useMemo(() => 
        allEndpoints.filter(ep => !assignedKeys.includes(ep.name)),
        [allEndpoints, assignedKeys]
    );

    useEffect(() => {
        // Only change the selected key if the current selection is no longer valid
        // (e.g. because it was just added to the assigned list).
        const isCurrentSelectionValid = availableKeys.some(ep => ep.name === keyToAdd);
        
        if (!isCurrentSelectionValid) {
            if (availableKeys.length > 0) {
                setKeyToAdd(availableKeys[0].name);
            } else {
                setKeyToAdd('');
            }
        }
    }, [availableKeys]); // Depend on the memoized array

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
                    <select
                        value={keyToAdd}
                        onChange={(e) => setKeyToAdd(e.target.value)}
                        className="flex-grow border rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-700"
                    >
                        {availableKeys.map(ep => <option key={ep.id} value={ep.name}>{ep.name}</option>)}
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


    // Feature selections - now arrays
    const [analysisKeys, setAnalysisKeys] = useState<string[]>([]);
    const [scalpingKeys, setScalpingKeys] = useState<string[]>([]);
    const [marketIndexKeys, setMarketIndexKeys] = useState<string[]>([]);
    const [stockComparisonKeys, setStockComparisonKeys] = useState<string[]>([]);
    const [marketSummaryKeys, setMarketSummaryKeys] = useState<string[]>([]);
    const [portfolioKeys, setPortfolioKeys] = useState<string[]>([]);


    // Editing states for the main list
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiEndpointService.getEndpoints();
            setEndpoints(data);
            setAnalysisKeys(apiEndpointService.getSelectedEndpointsForFeature('analysis'));
            setScalpingKeys(apiEndpointService.getSelectedEndpointsForFeature('scalping'));
            setMarketIndexKeys(apiEndpointService.getSelectedEndpointsForFeature('marketIndex'));
            setStockComparisonKeys(apiEndpointService.getSelectedEndpointsForFeature('stockComparison'));
            setMarketSummaryKeys(apiEndpointService.getSelectedEndpointsForFeature('marketSummary'));
            setPortfolioKeys(apiEndpointService.getSelectedEndpointsForFeature('portfolio'));
        } catch (error: any) {
            addNotification(`خطا در دریافت لیست API ها: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveToServer = async () => {
        setIsSaving(true);
        try {
            await apiEndpointService.saveEndpoints(endpoints);
            await storageService.forceSync(); // Force sync to server immediately
            addNotification('لیست کلیدهای API با موفقیت در سرور ذخیره شد.', 'success');
        } catch (error: any) {
            addNotification(`خطا در ذخیره‌سازی: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleSaveAssignments = async () => {
        setIsSavingAssignments(true);
        try {
            // Assignments are updated in localStorage by helper functions.
            // We just need to force a push to the server.
            await storageService.forceSync();
            addNotification('تخصیص کلیدها با موفقیت در سرور ذخیره شد.', 'success');
        } catch (error: any) {
            addNotification('خطا در ذخیره تخصیص‌ها.', 'error');
        } finally {
            setIsSavingAssignments(false);
        }
    };

    const handleAdd = () => {
        if (!newName.trim() || !newUrl.trim()) return;
        if (endpoints.some(ep => ep.name.toLowerCase() === newName.trim().toLowerCase())) {
            addNotification('یک کلید API با همین نام از قبل وجود دارد.', 'error');
            return;
        }
        setEndpoints([...endpoints, { id: `local_${Date.now()}`, name: newName.trim(), url: newUrl.trim() }]);
        setNewName('');
        setNewUrl('');
    };

    const handleRemove = (id: string) => {
        const endpointToRemove = endpoints.find(ep => ep.id === id);
        if (!endpointToRemove) return;

        const keyName = endpointToRemove.name;
        // Automatically remove the key from all feature assignments
        const featureSetters: Record<FeatureKey, React.Dispatch<React.SetStateAction<string[]>>> = {
            analysis: setAnalysisKeys,
            scalping: setScalpingKeys,
            marketIndex: setMarketIndexKeys,
            stockComparison: setStockComparisonKeys,
            marketSummary: setMarketSummaryKeys,
            portfolio: setPortfolioKeys,
        };

        Object.entries(featureSetters).forEach(([key, setter]) => {
            const featureKey = key as FeatureKey;
            const newKeys = apiEndpointService.getSelectedEndpointsForFeature(featureKey).filter(k => k !== keyName);
            setter(newKeys);
            apiEndpointService.setSelectedEndpointsForFeature(featureKey, newKeys);
        });

        // Finally, remove from the main list
        setEndpoints(endpoints.filter(ep => ep.id !== id));
        addNotification(`کلید ${keyName} و تمام تخصیص‌های آن حذف شد.`, 'info');
    };

    const startEditing = (endpoint: ApiEndpoint) => {
        setEditingId(endpoint.id);
        setEditName(endpoint.name);
        setEditUrl(endpoint.url);
    };

    const handleUpdate = () => {
        if (!editingId) return;
        const oldName = endpoints.find(ep => ep.id === editingId)?.name;
        const trimmedEditName = editName.trim();

        if (endpoints.some(ep => ep.id !== editingId && ep.name.toLowerCase() === trimmedEditName.toLowerCase())) {
            addNotification('یک کلید API با همین نام از قبل وجود دارد.', 'error');
            return;
        }
        
        // Update the key in the main list
        setEndpoints(endpoints.map(ep => ep.id === editingId ? { ...ep, name: trimmedEditName, url: editUrl.trim() } : ep));
        
        // Update feature selections if name changed
        if (oldName && oldName !== trimmedEditName) {
            const updateKeyName = (keys: string[]) => keys.map(k => k === oldName ? trimmedEditName : k);
            
            const featureSetters: Record<FeatureKey, React.Dispatch<React.SetStateAction<string[]>>> = {
                analysis: setAnalysisKeys,
                scalping: setScalpingKeys,
                marketIndex: setMarketIndexKeys,
                stockComparison: setStockComparisonKeys,
                marketSummary: setMarketSummaryKeys,
                portfolio: setPortfolioKeys,
            };

            Object.entries(featureSetters).forEach(([key, setter]) => {
                const featureKey = key as FeatureKey;
                const newKeys = updateKeyName(apiEndpointService.getSelectedEndpointsForFeature(featureKey));
                setter(newKeys);
                apiEndpointService.setSelectedEndpointsForFeature(featureKey, newKeys);
            });
        }
        setEditingId(null);
    };

    const handleAddFeatureKey = (feature: FeatureKey, keyName: string) => {
        if (!keyName) return;
        const actionMap: Record<FeatureKey, { keys: string[], set: React.Dispatch<React.SetStateAction<string[]>>}> = {
            analysis: { keys: analysisKeys, set: setAnalysisKeys },
            scalping: { keys: scalpingKeys, set: setScalpingKeys },
            marketIndex: { keys: marketIndexKeys, set: setMarketIndexKeys },
            stockComparison: { keys: stockComparisonKeys, set: setStockComparisonKeys },
            marketSummary: { keys: marketSummaryKeys, set: setMarketSummaryKeys },
            portfolio: { keys: portfolioKeys, set: setPortfolioKeys },
        };
        const { keys, set } = actionMap[feature];
        if (keys.includes(keyName)) return;

        const newKeys = [...keys, keyName];
        set(newKeys);
        apiEndpointService.setSelectedEndpointsForFeature(feature, newKeys);
    };

    const handleRemoveFeatureKey = (feature: FeatureKey, keyName: string) => {
        const actionMap: Record<FeatureKey, { keys: string[], set: React.Dispatch<React.SetStateAction<string[]>>}> = {
            analysis: { keys: analysisKeys, set: setAnalysisKeys },
            scalping: { keys: scalpingKeys, set: setScalpingKeys },
            marketIndex: { keys: marketIndexKeys, set: setMarketIndexKeys },
            stockComparison: { keys: stockComparisonKeys, set: setStockComparisonKeys },
            marketSummary: { keys: marketSummaryKeys, set: setMarketSummaryKeys },
            portfolio: { keys: portfolioKeys, set: setPortfolioKeys },
        };
        const { keys, set } = actionMap[feature];
        const newKeys = keys.filter(k => k !== keyName);
        set(newKeys);
        apiEndpointService.setSelectedEndpointsForFeature(feature, newKeys);
    };

    if (loading) {
        return <p>در حال بارگذاری تنظیمات API...</p>;
    }

    return (
        <div className="space-y-8">
            <div
                className="p-6 rounded-lg shadow-md border border-[var(--card-border-color)]"
                style={{ backgroundColor: 'var(--settings-card-bg)' }}
            >
                <h3 className="text-lg font-semibold mb-4">مدیریت لیست کلیدهای API</h3>
                <div className="space-y-2 mb-4">
                    {endpoints.map(ep => (
                         <div key={ep.id} className="flex items-center gap-2 p-2 rounded-md bg-gray-100 dark:bg-gray-800/50">
                            {editingId === ep.id ? (
                                <>
                                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="نام کلید" className="w-1/3 border rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" />
                                    <input value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="آدرس API" className="flex-grow border rounded px-2 py-1 text-sm font-mono bg-white dark:bg-gray-700" />
                                    <button onClick={handleUpdate} className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full" title="ذخیره"><CheckIcon /></button>
                                    <button onClick={() => setEditingId(null)} className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="انصراف"><XMarkIcon /></button>
                                </>
                            ) : (
                                <>
                                    <span className="font-semibold w-1/3 truncate" title={ep.name}>{ep.name}</span>
                                    <span className="font-mono text-xs flex-grow text-gray-500 truncate" title={ep.url}>{ep.url}</span>
                                    <button onClick={() => startEditing(ep)} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full" title="ویرایش"><PencilIcon className="h-4 w-4"/></button>
                                    <button onClick={() => handleRemove(ep.id)} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="حذف"><TrashIcon className="h-4 w-4"/></button>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                 <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="نام جدید کلید" className="w-1/3 border rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" />
                    <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="آدرس جدید API" className="flex-grow border rounded px-2 py-1 text-sm font-mono bg-white dark:bg-gray-700" />
                    <button onClick={handleAdd} className="p-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700" title="افزودن"><PlusIcon /></button>
                </div>

                <div className="mt-6 flex justify-end">
                     <button onClick={handleSaveToServer} disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2">
                         {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                                <span>در حال ذخیره...</span>
                            </>
                        ) : (
                            <>
                                <ArrowDownOnSquareIcon className="h-5 w-5" />
                                <span>ذخیره لیست در سرور</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div
                className="p-6 rounded-lg shadow-md border border-[var(--card-border-color)]"
                style={{ backgroundColor: 'var(--settings-card-bg)' }}
            >
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">تخصیص کلید به بخش‌ها</h3>
                    <button onClick={handleSaveAssignments} disabled={isSavingAssignments} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors">
                         {isSavingAssignments ? (
                            <>
                                <div className="w-3 h-3 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                                <span>...</span>
                            </>
                        ) : (
                            <>
                                <ArrowDownOnSquareIcon className="h-4 w-4" />
                                <span>ذخیره تخصیص‌ها</span>
                            </>
                        )}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mb-4">به هر بخش می‌توانید چند کلید تخصیص دهید. سیستم به ترتیب از اولین کلید لیست استفاده خواهد کرد.</p>

                <FeatureKeyManager
                    title="تحلیل سهم (پیش‌فرض)"
                    featureKey="analysis"
                    assignedKeys={analysisKeys}
                    allEndpoints={endpoints}
                    onAddKey={handleAddFeatureKey}
                    onRemoveKey={handleRemoveFeatureKey}
                />
                <FeatureKeyManager
                    title="مقایسه سهام"
                    featureKey="stockComparison"
                    assignedKeys={stockComparisonKeys}
                    allEndpoints={endpoints}
                    onAddKey={handleAddFeatureKey}
                    onRemoveKey={handleRemoveFeatureKey}
                />
                <FeatureKeyManager
                    title="سبد سهام (تحلیل و بهینه‌سازی)"
                    featureKey="portfolio"
                    assignedKeys={portfolioKeys}
                    allEndpoints={endpoints}
                    onAddKey={handleAddFeatureKey}
                    onRemoveKey={handleRemoveFeatureKey}
                />
                 <FeatureKeyManager
                    title="خلاصه بازار (در تب تحلیل سهام)"
                    featureKey="marketSummary"
                    assignedKeys={marketSummaryKeys}
                    allEndpoints={endpoints}
                    onAddKey={handleAddFeatureKey}
                    onRemoveKey={handleRemoveFeatureKey}
                />
                <FeatureKeyManager
                    title="نوسان‌گیری"
                    featureKey="scalping"
                    assignedKeys={scalpingKeys}
                    allEndpoints={endpoints}
                    onAddKey={handleAddFeatureKey}
                    onRemoveKey={handleRemoveFeatureKey}
                />
                <FeatureKeyManager
                    title="شاخص بازار (در هدر)"
                    featureKey="marketIndex"
                    assignedKeys={marketIndexKeys}
                    allEndpoints={endpoints}
                    onAddKey={handleAddFeatureKey}
                    onRemoveKey={handleRemoveFeatureKey}
                />
            </div>
        </div>
    );
};

export default ApiKeysManagement;