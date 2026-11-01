import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  nextRetry: number;
}

interface RequestQueueItem {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  nextRetry: 0,
};

let maintenanceMode = false;
let maintenanceModeUntil = 0;

export const isInMaintenanceMode = (): boolean => {
  if (!maintenanceMode) return false;
  if (Date.now() >= maintenanceModeUntil) {
    maintenanceMode = false;
    return false;
  }
  return true;
};

export const enterMaintenanceMode = (durationMs = 120000) => {
  maintenanceMode = true;
  maintenanceModeUntil = Date.now() + durationMs;
};

export const exitMaintenanceMode = () => {
  maintenanceMode = false;
  maintenanceModeUntil = 0;
  resetCircuitBreaker();
};

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 60000;
const MAX_CONCURRENT_REQUESTS = 2;
const REQUEST_TIMEOUT_MS = 10000;

let activeRequests = 0;
const requestQueue: RequestQueueItem[] = [];
let isProcessingQueue = false;

const processQueue = async () => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const item = requestQueue.shift();
    if (!item) break;

    activeRequests++;
    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      activeRequests--;
    }
  }

  isProcessingQueue = false;
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    processQueue();
  }
};

const enqueueRequest = <T>(execute: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
      activeRequests++;
      execute()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeRequests--;
          processQueue();
        });
    } else {
      requestQueue.push({
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    }
  });
};

const NETWORK_ERROR_INDICATORS = [
  'network',
  'fetch',
  'failed to fetch',
  'networkerror',
  'connection',
  'timeout',
  'abort',
  'err_network',
  'err_connection',
  'err_name_not_resolved',
  'err_empty_response',
  'err_internet_disconnected',
  'net::err_',
  'load failed',
  'socket',
  'pgrst002',
  'could not query the database',
  'upstream request timeout',
  '503',
  '504',
  '502',
  'gateway',
];

export const isNetworkError = (error: unknown): boolean => {
  if (!navigator.onLine) return true;
  if (!error || typeof error !== 'object') return false;

  const err = error as { message?: string; code?: string; name?: string; status?: number };
  const errorText = `${err.message || ''} ${err.code || ''} ${err.name || ''} ${err.status || ''}`.toLowerCase();

  return NETWORK_ERROR_INDICATORS.some((indicator) => errorText.includes(indicator));
};

export const isServiceUnavailable = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { status?: number; code?: string; message?: string };
  return (
    err.status === 503 ||
    err.status === 504 ||
    err.status === 502 ||
    err.code === 'PGRST002' ||
    err.message?.toLowerCase().includes('schema cache') ||
    err.message?.toLowerCase().includes('upstream request timeout')
  );
};

export const isRetryableDbError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; status?: number };
  return (
    err.code === '57014' ||
    err.code === '55P03' ||
    err.status === 500 && (
      err.message?.includes('statement timeout') ||
      err.message?.includes('lock timeout') ||
      err.message?.includes('canceling statement')
    )
  ) || isNetworkError(error);
};

export const isOnline = (): boolean => {
  return navigator.onLine;
};

const updateCircuitBreaker = (success: boolean) => {
  const now = Date.now();

  if (success) {
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
    return;
  }

  circuitBreaker.failures++;
  circuitBreaker.lastFailure = now;

  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    circuitBreaker.nextRetry = now + CIRCUIT_BREAKER_RESET_MS;
  }

  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD * 2) {
    enterMaintenanceMode(CIRCUIT_BREAKER_RESET_MS * 2);
  }
};

const isCircuitOpen = (): boolean => {
  if (!circuitBreaker.isOpen) return false;

  const now = Date.now();
  if (now >= circuitBreaker.nextRetry) {
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 2);
    return false;
  }

  return true;
};

export const getCircuitBreakerStatus = () => ({
  isOpen: circuitBreaker.isOpen,
  failures: circuitBreaker.failures,
  nextRetryIn: circuitBreaker.isOpen ? Math.max(0, circuitBreaker.nextRetry - Date.now()) : 0,
});

export const resetCircuitBreaker = () => {
  circuitBreaker.failures = 0;
  circuitBreaker.isOpen = false;
  circuitBreaker.lastFailure = 0;
  circuitBreaker.nextRetry = 0;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const calculateBackoff = (attempt: number): number => {
  const baseDelay = 3000;
  const maxDelay = 30000;
  const backoff = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return backoff + Math.random() * 2000;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
  global: {
    headers: {
      'x-client-info': 'falcox-universo',
    },
  },
});

export const handleSupabaseError = async (error: unknown): Promise<boolean> => {
  if (!error || typeof error !== 'object') return false;

  if (isNetworkError(error) || isServiceUnavailable(error)) {
    updateCircuitBreaker(false);
    return true;
  }

  const err = error as { status?: number; code?: string; message?: string };

  const isAuthError =
    err.status === 401 ||
    err.status === 403 ||
    err.code === 'PGRST303' ||
    err.message?.includes('JWT expired') ||
    err.message?.includes('refresh_token');

  if (isAuthError) {
    try {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !data.session) {
        await supabase.auth.signOut();
        window.location.href = '/login';
      }
    } catch {
      // Ignore
    }
    return true;
  }

  return false;
};

interface RetryOptions {
  maxRetries?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, shouldRetry = isNetworkError, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (isCircuitOpen()) {
      throw new Error('Service temporarily unavailable. Please try again later.');
    }

    try {
      const result = await fn();
      updateCircuitBreaker(true);
      return result;
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error) || attempt === maxRetries) {
        updateCircuitBreaker(false);
        throw error;
      }

      updateCircuitBreaker(false);

      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      const backoffMs = calculateBackoff(attempt);
      await delay(backoffMs);
    }
  }

  throw lastError;
}

export async function safeRpcCall<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
  fallback: T | null = null
): Promise<T | null> {
  if (!isOnline()) return fallback;
  if (isInMaintenanceMode()) return fallback;
  if (isCircuitOpen()) return fallback;

  try {
    const result = await withRetry(async () => {
      const { data, error } = await fn();
      if (error) {
        if (isServiceUnavailable(error) || isNetworkError(error)) {
          throw error;
        }
        throw error;
      }
      return data;
    });
    return result;
  } catch (error) {
    if (isNetworkError(error) || isServiceUnavailable(error)) {
      return fallback;
    }
    throw error;
  }
}

export async function resilientQuery<T>(
  queryFn: (client: SupabaseClient) => Promise<{ data: T | null; error: unknown }>
): Promise<{ data: T | null; error: unknown }> {
  if (!isOnline()) {
    return { data: null, error: new Error('No network connection') };
  }

  if (isInMaintenanceMode()) {
    return { data: null, error: new Error('Server is under maintenance. Please wait.') };
  }

  if (isCircuitOpen()) {
    const status = getCircuitBreakerStatus();
    return {
      data: null,
      error: new Error(`Service temporarily unavailable. Retry in ${Math.ceil(status.nextRetryIn / 1000)}s`),
    };
  }

  return enqueueRequest(async () => {
    try {
      const result = await withRetry(
        async () => {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT_MS)
          );

          const queryPromise = queryFn(supabase);
          const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

          if (error) {
            throw error;
          }

          return { data, error: null };
        },
        {
          maxRetries: 2,
          shouldRetry: (error) => isNetworkError(error) || isServiceUnavailable(error),
        }
      );

      return result;
    } catch (error) {
      return { data: null, error };
    }
  });
}

export async function healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
  const start = Date.now();

  try {
    const { error } = await supabase.from('game_settings').select('key').limit(1).single();

    if (error && !error.message?.includes('not found')) {
      return { healthy: false, latency: Date.now() - start, error: error.message };
    }

    resetCircuitBreaker();
    return { healthy: true, latency: Date.now() - start };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return { healthy: false, latency: Date.now() - start, error: errMsg };
  }
}

export async function waitForConnection(maxWaitMs = 30000): Promise<boolean> {
  if (isInMaintenanceMode()) {
    return false;
  }

  if (isCircuitOpen()) {
    const status = getCircuitBreakerStatus();
    if (status.nextRetryIn > 5000) {
      return false;
    }
  }

  const startTime = Date.now();
  let attempt = 0;
  const maxAttempts = 3;

  while (Date.now() - startTime < maxWaitMs && attempt < maxAttempts) {
    const result = await healthCheck();
    if (result.healthy) {
      return true;
    }

    attempt++;
    if (attempt >= maxAttempts) break;

    const backoff = calculateBackoff(attempt);
    await delay(Math.min(backoff, maxWaitMs - (Date.now() - startTime)));
  }

  return false;
}

export const getRequestQueueStatus = () => ({
  activeRequests,
  queuedRequests: requestQueue.length,
  maxConcurrent: MAX_CONCURRENT_REQUESTS,
});
