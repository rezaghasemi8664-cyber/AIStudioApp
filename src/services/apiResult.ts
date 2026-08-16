import type { ApiResult } from '../types';

export async function safeApi<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unknown error',
    };
  }
}

