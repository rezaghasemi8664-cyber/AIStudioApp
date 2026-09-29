import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './config';

const TOKEN_KEYS = ['accessToken', 'token'];

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;

  for (const key of TOKEN_KEYS) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token && token.trim()) return token.trim();
  }

  return null;
};

function normalizeFundamentalAnalysisPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;

  const root = payload?.data && typeof payload.data === 'object'
    ? payload.data
    : payload?.result && typeof payload.result === 'object'
      ? payload.result
      : payload;

  if (!root || typeof root !== 'object') return payload;

  const scores = root.scores && typeof root.scores === 'object' ? { ...root.scores } : {};
  const fundamental = root.fundamentalAnalysis;
  const meta = root.fundamentalMeta;

  // For deterministic CODAL analysis, a completed nested Fundamental result
  // is canonical. Legacy top-level/scores fields may still contain 0 from the
  // old insufficient-data path, so they must not win over a calculated score.
  const canonicalFundamentalScore =
    fundamental && typeof fundamental === 'object' &&
    fundamental.scoreStatus === 'calculated'
      ? fundamental.score ?? fundamental.fundamentalScore
      : undefined;

  const candidates = root.deterministic === true
    ? [
        canonicalFundamentalScore,
        fundamental && typeof fundamental === 'object' ? fundamental.score : undefined,
        fundamental && typeof fundamental === 'object' ? fundamental.fundamentalScore : undefined,
        meta?.score,
        meta?.fundamentalScore,
        scores.fundamentalScore,
        scores.fundamental_score,
        root.fundamentalScore,
        root.fundamental_score,
      ]
    : [
        root.fundamentalScore,
        root.fundamental_score,
        scores.fundamentalScore,
        scores.fundamental_score,
        meta?.score,
        meta?.fundamentalScore,
        fundamental && typeof fundamental === 'object' ? fundamental.score : undefined,
        fundamental && typeof fundamental === 'object' ? fundamental.fundamentalScore : undefined,
      ];

  const numericScore = candidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value >= 0 && value <= 100);

  if (numericScore !== undefined) {
    root.fundamentalScore = numericScore;
    root.fundamental_score = numericScore;
    root.scores = { ...scores, fundamentalScore: numericScore };
  }

  const reasonCandidates = root.deterministic === true
    ? [
        fundamental && typeof fundamental === 'object' ? fundamental.reason : undefined,
        fundamental && typeof fundamental === 'object' ? fundamental.explanation : undefined,
        typeof fundamental === 'string' ? fundamental : undefined,
        root.fundamentalReason,
        root.fundamental_reason,
        meta?.reason,
      ]
    : [
        root.fundamentalReason,
        root.fundamental_reason,
        meta?.reason,
        fundamental && typeof fundamental === 'object' ? fundamental.reason : undefined,
        fundamental && typeof fundamental === 'object' ? fundamental.explanation : undefined,
      ];

  const reason = reasonCandidates.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );

  if (reason) {
    root.fundamentalReason = reason.trim();
    root.fundamental_reason = reason.trim();
  }

  return payload;
}

function normalizeMoneyFlowPayload(payload: any): any {
  const data = payload?.data;
  const market = data?.market ?? data?.marketData ?? payload?.marketData ?? data;
  if (!market || typeof market !== 'object') return payload;

  const realNet = Number(market.realMoneyFlow?.net ?? market.realMoneyFlow);
  const legalNet = Number(market.legalMoneyFlow?.net ?? market.legalMoneyFlow);

  if (!Number.isFinite(realNet) && !Number.isFinite(legalNet)) return payload;

  // Keep the three concepts separate:
  // total net = real net + legal net
  // real net = real flow only
  // legal net = legal flow only
  if (market.moneyFlow && typeof market.moneyFlow === 'object') {
    const current = { ...market.moneyFlow };
    if (Number.isFinite(realNet) && Number.isFinite(legalNet)) {
      current.net = realNet + legalNet;
    }
    market.moneyFlow = current;
  }

  if (Number.isFinite(realNet)) {
    market.netRealMoneyFlow = realNet;
    market.realMoneyFlowNet = realNet;
  }

  if (Number.isFinite(legalNet)) {
    market.netLegalMoneyFlow = legalNet;
    market.legalMoneyFlowNet = legalNet;
  }

  if (Number.isFinite(realNet) && Number.isFinite(legalNet)) {
    market.netMoneyFlow = realNet + legalNet;
    market.moneyFlowNet = realNet + legalNet;
  }

  return payload;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 90000,
  headers: {
    Accept: 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken();

    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);


function configIsStockAnalysis(url: string | undefined): boolean {
  if (!url) return false;
  return /\/analyze\/stock(?:\?|$)/i.test(url);
}


async function enrichStockAnalysisResponse(response: any): Promise<any> {
  if (!configIsStockAnalysis(response.config?.url)) return response;

  let requestData: any = response.config?.data;
  if (typeof requestData === 'string') {
    try { requestData = JSON.parse(requestData); } catch { requestData = null; }
  }

  const symbol = typeof requestData?.symbol === 'string' ? requestData.symbol.trim() : '';
  if (!symbol) return response;

  const root = response.data?.data && typeof response.data.data === 'object'
    ? response.data.data
    : response.data?.result && typeof response.data.result === 'object'
      ? response.data.result
      : response.data;

  const currentFundamental = root?.fundamentalAnalysis;
  const currentCalculated =
    currentFundamental &&
    typeof currentFundamental === 'object' &&
    currentFundamental.scoreStatus === 'calculated' &&
    Number.isFinite(Number(currentFundamental.score));

  if (currentCalculated) return response;

  try {
    // The StockAnalysis component uses this Axios client. Fetch the same
    // canonical CODAL data boundary here so a legacy 0 from /analyze/stock
    // cannot mask the calculated score returned by /analyze/stock-data.
    const supplementalResponse = await api.get(
      `/analyze/stock-data/${encodeURIComponent(symbol)}?historyCount=30`
    );
    const supplementalData = supplementalResponse.data?.data;
    const supplementalFundamental = supplementalData?.fundamentalAnalysis;

    if (
      !supplementalData ||
      !supplementalFundamental ||
      typeof supplementalFundamental !== 'object' ||
      supplementalFundamental.scoreStatus !== 'calculated' ||
      !Number.isFinite(Number(supplementalFundamental.score))
    ) {
      return response;
    }

    const supplementalScore = Number(supplementalFundamental.score);
    const mergedRoot = {
      ...(root || {}),
      fundamentalAnalysis: supplementalFundamental,
      fundamentalScore: supplementalScore,
      scores: {
        ...(root?.scores || {}),
        fundamentalScore: supplementalScore,
      },
      fundamentalReason:
        supplementalFundamental.reason ??
        supplementalFundamental.explanation ??
        root?.fundamentalReason,
    };

    if (response.data?.data && typeof response.data.data === 'object') {
      response.data = { ...response.data, data: mergedRoot };
    } else if (response.data?.result && typeof response.data.result === 'object') {
      response.data = { ...response.data, result: mergedRoot };
    } else {
      response.data = {
        ...response.data,
        ...mergedRoot,
        data: mergedRoot,
      };
    }

    response.data = normalizeFundamentalAnalysisPayload(response.data);
  } catch (error) {
    console.warn('[apiClient] stock analysis CODAL enrichment failed:', error);
  }

  return response;
}

api.interceptors.response.use(
  async (response) => {
    response.data = normalizeMoneyFlowPayload(response.data);
    response = await enrichStockAnalysisResponse(response);
    if (configIsStockAnalysis(response.config?.url)) {
      response.data = normalizeFundamentalAnalysisPayload(response.data);
    }
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    } else if (status === 403) {
      window.dispatchEvent(new CustomEvent('auth:forbidden'));
    } else if (!error.response) {
      window.dispatchEvent(
        new CustomEvent('network:error', {
          detail: { message: error.message || 'Network error' },
        })
      );
    }

    return Promise.reject(error);
  }
);

export default api;
