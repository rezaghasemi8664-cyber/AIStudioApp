import api from '../api/apiClient';
export interface DailyFilterRow{symbol:string;name?:string;buyPower:number;lastPrice:number;closingPrice:number;lastChangePercent:number;volume:number;value:number;realBuyVolume:number;realSellVolume:number;legalBuyVolume:number;legalSellVolume:number;realBuyCount:number;realSellCount:number;legalBuyCount:number;legalSellCount:number;pe:number;eps:number;volumeAvg1m?:number;volumeRatio1m?:number;buyQueueVolume:number;buyQueueCount:number;sellQueueVolume:number;sellQueueCount:number;aiScore?:number;aiReason?:string}
export interface DailyFilter{id:string;label:string;count:number;updatedAt:string|null;rows:DailyFilterRow[]}
export interface DailyFiltersResponse{success:boolean;marketStatus:{isOpen:boolean;reason?:string;source?:string};filters:DailyFilter[]}
export async function getDailyFilters(force=false):Promise<DailyFiltersResponse>{const r=await api.get('/daily-filters',{params:force?{force:1}:undefined});return r.data||r;}
