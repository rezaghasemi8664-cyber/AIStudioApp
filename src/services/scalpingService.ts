// src/services/scalpingService.ts
import apiClient from './apiClient';
import { ScalpingOpportunity, ScalpingSettings } from '../types';

export interface ScalpingSignalsResponse {
  signals: ScalpingOpportunity[];
  totalSignals: number;
  activeSignals: number;
  lastUpdate: string | null;
}

export interface ScalpingStatus {
  isRunning: boolean;
  lastRunId: number | null;
  lastStatus: string | null;
  lastUpdate: string | null;
  todayTrades: number;
  activePositions: number;
  todayPnL: number;
  marketStatus: {
    isOpen: boolean;
    available: boolean;
    source?: string;
    reason?: string;
  };
}

export interface ScalpingHistoryResult {
  items: Array<{
    id: number;
    userId: number;
    status: string;
    createdAt: string;
    finishedAt?: string | null;
    meta?: unknown;
    results: Array<{
      id: number;
      runId: number;
      symbol: string;
      signal: string;
      price: number;
      confidence: number;
      extra?: unknown;
    }>;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface StartScalpingResult {
  runId: number;
  status: string;
  count: number;
  actionableCount?: number;
  results: Array<{
    id: number;
    runId: number;
    symbol: string;
    signal: string;
    price: number;
    confidence: number;
    extra?: unknown;
  }>;
  errors: Array<{
    symbol: string;
    message: string;
  }>;
  marketStatus: {
    isOpen: boolean;
    available: boolean;
    source?: string;
    reason?: string;
  };
}

export interface StopScalpingResult {
  stopped: boolean;
  canStop: boolean;
  message: string;
  status: ScalpingStatus;
}

function unwrapData<T>(response: { data?: { data?: T } }, fallback: T): T {
  return response?.data?.data ?? fallback;
}

export const scalpingService = {
  async getScalpingSettings(): Promise<ScalpingSettings> {
    try {
      const response = await apiClient.get('/api/scalping/settings');
      return unwrapData<ScalpingSettings>(response, { symbols: [] } as ScalpingSettings);
    } catch (error) {
      console.error('Error fetching scalping settings:', error);
      return { symbols: [] } as ScalpingSettings;
    }
  },

  async updateScalpingSettings(
    payload: Partial<ScalpingSettings>
  ): Promise<ScalpingSettings> {
    try {
      const response = await apiClient.put('/api/scalping/settings', payload);
      return unwrapData<ScalpingSettings>(response, { symbols: [] } as ScalpingSettings);
    } catch (error) {
      console.error('Error updating scalping settings:', error);
      throw error;
    }
  },

  async getScalpingSignals(): Promise<ScalpingSignalsResponse> {
    try {
      const response = await apiClient.get('/api/scalping/signals');
      return unwrapData<ScalpingSignalsResponse>(response, {
        signals: [],
        totalSignals: 0,
        activeSignals: 0,
        lastUpdate: null
      });
    } catch (error) {
      console.error('Error fetching scalping signals:', error);
      return {
        signals: [],
        totalSignals: 0,
        activeSignals: 0,
        lastUpdate: null
      };
    }
  },

  async getScalpingOpportunities(): Promise<ScalpingOpportunity[]> {
    const result = await this.getScalpingSignals();
    return result.signals;
  },

  async createScalpingSignal(
    payload: Partial<ScalpingOpportunity>
  ): Promise<ScalpingOpportunity> {
    try {
      const response = await apiClient.post('/api/scalping/signals', payload);
      return unwrapData<ScalpingOpportunity>(response, {} as ScalpingOpportunity);
    } catch (error) {
      console.error('Error creating scalping signal:', error);
      throw error;
    }
  },

  async getScalpingStatus(): Promise<ScalpingStatus> {
    try {
      const response = await apiClient.get('/api/scalping/status');
      return unwrapData<ScalpingStatus>(response, {
        isRunning: false,
        lastRunId: null,
        lastStatus: null,
        lastUpdate: null,
        todayTrades: 0,
        activePositions: 0,
        todayPnL: 0,
        marketStatus: {
          isOpen: false,
          available: false
        }
      });
    } catch (error) {
      console.error('Error fetching scalping status:', error);
      return {
        isRunning: false,
        lastRunId: null,
        lastStatus: null,
        lastUpdate: null,
        todayTrades: 0,
        activePositions: 0,
        todayPnL: 0,
        marketStatus: {
          isOpen: false,
          available: false
        }
      };
    }
  },

  async getScalpingHistory(
    page = 1,
    limit = 20
  ): Promise<ScalpingHistoryResult> {
    try {
      const response = await apiClient.get('/api/scalping/history', {
        params: { page, limit }
      });

      return unwrapData<ScalpingHistoryResult>(response, {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      });
    } catch (error) {
      console.error('Error fetching scalping history:', error);
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      };
    }
  },

  async startScalping(): Promise<StartScalpingResult> {
    try {
      const response = await apiClient.post('/api/scalping/start');
      return unwrapData<StartScalpingResult>(response, {
        runId: 0,
        status: 'failed',
        count: 0,
        actionableCount: 0,
        results: [],
        errors: [],
        marketStatus: {
          isOpen: false,
          available: false
        }
      });
    } catch (error) {
      console.error('Error starting scalping engine:', error);
      throw error;
    }
  },

  async stopScalping(): Promise<StopScalpingResult> {
    try {
      const response = await apiClient.post('/api/scalping/stop');
      return unwrapData<StopScalpingResult>(response, {
        stopped: false,
        canStop: false,
        message: 'Unable to stop scalping engine',
        status: {
          isRunning: false,
          lastRunId: null,
          lastStatus: null,
          lastUpdate: null,
          todayTrades: 0,
          activePositions: 0,
          todayPnL: 0,
          marketStatus: {
            isOpen: false,
            available: false
          }
        }
      });
    } catch (error) {
      console.error('Error stopping scalping engine:', error);
      throw error;
    }
  }
};
