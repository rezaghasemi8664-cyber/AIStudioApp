import type { ApiEndpoint } from '../types';
import { get, post, put } from './apiClient';

/**
 * ??????? ???????? ?? ???? ?????? ?????:
 * - routes/endpoints.routes.cjs
 * - routes/userPreference.routes.cjs
 *
 * ??? ?? ?????? ???? ???? ?????? ???? ??? ??? ?? ????? ?? ????? ???.
 */
const ENDPOINTS_BASE = '/endpoints';
const FEATURE_SELECTION_BASE = '/user-preference/feature-endpoints';

// ---------- Endpoints CRUD (Server-side only) ----------

export const getEndpoints = async (): Promise<ApiEndpoint[]> => {
  const res = await get<ApiEndpoint[]>(ENDPOINTS_BASE);

  if (!res.success) {
    throw new Error(res.message || 'Failed to fetch endpoints');
  }

  return Array.isArray(res.data) ? res.data : [];
};

export const saveEndpoints = async (endpoints: ApiEndpoint[]): Promise<ApiEndpoint[]> => {
  const res = await put<ApiEndpoint[]>(ENDPOINTS_BASE, { endpoints });

  if (!res.success) {
    throw new Error(res.message || 'Failed to save endpoints');
  }

  return Array.isArray(res.data) ? res.data : endpoints;
};

// ---------- Feature-specific selection (Server-side only) ----------

export const setSelectedEndpointsForFeature = async (
  featureKey: string,
  endpointNames: string[]
): Promise<void> => {
  const res = await post(
    `${FEATURE_SELECTION_BASE}/${encodeURIComponent(featureKey)}`,
    { endpointNames }
  );

  if (!res.success) {
    throw new Error(
      res.message || `Failed to save selected endpoints for feature '${featureKey}'`
    );
  }
};

export const getSelectedEndpointsForFeature = async (
  featureKey: string
): Promise<string[]> => {
  const res = await get<string[]>(
    `${FEATURE_SELECTION_BASE}/${encodeURIComponent(featureKey)}`
  );

  if (!res.success) {
    throw new Error(
      res.message || `Failed to fetch selected endpoints for feature '${featureKey}'`
    );
  }

  return Array.isArray(res.data) ? res.data.filter((x): x is string => typeof x === 'string') : [];
};

// ---------- Initialization ----------

/**
 * ?? ?????? Backend-Only ???????? ????? ???? ?? ?????? ????? ???
 * (seed/migration/startup hook). ?? ??? ???? no-op ???.
 */
export const initializeDefaults = async (): Promise<void> => {
  // no-op
  // ?? ???? ???? route ???????:
  // await post('/endpoints/initialize-defaults');
};

