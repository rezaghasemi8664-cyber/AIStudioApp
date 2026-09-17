import api from '../api/apiClient';

export interface SmartScoreComponent {
  label: string;
  score: number;
  details: string;
}

export interface SmartScoreResult {
  score: number;
  status: 'Bullish' | 'Neutral' | 'Bearish';
  components: SmartScoreComponent[];
  calculatedAt: string;
  source: string;
  ai: false;
}

export async function getSmartScore(symbol: string): Promise<SmartScoreResult> {
  const clean = symbol.trim().toUpperCase();
  if (!clean) throw new Error('نماد الزامی است.');
  const response = await api.get(`/smart-score/symbol/${encodeURIComponent(clean)}`);
  const data = response?.data?.data ?? response?.data;
  if (!data || typeof data.score !== 'number') throw new Error('پاسخ امتیاز هوشمند معتبر نیست.');
  return data as SmartScoreResult;
}
