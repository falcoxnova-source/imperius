import { supabase } from './supabase';

/**
 * Llama a una RPC de Supabase con reintentos automáticos solo ante errores de red
 * (connection closed, fetch failed, timeout, 502/503/504).
 *
 * NO reintenta errores de lógica del servidor (p.ej. "Insufficient metal", "Not authorized"):
 * esos vuelven en el primer intento como data.success=false o con un code/PGRST/etc.
 *
 * Parámetros:
 *   fn: nombre de la RPC (string)
 *   params: argumentos nombrados de la RPC
 *   opts.maxAttempts: intentos totales (default 3)
 *   opts.delayMs: espera base entre intentos (default 500)
 *
 * Consumo: si la red va bien hace 1 petición, exactamente igual que supabase.rpc.
 * El coste extra solo existe cuando el pooler tira la conexión, y en ese caso
 * el reintento opera contra una conexión nueva sin ejecutar la transacción
 * anterior (Postgres hace rollback de transacciones huérfanas).
 */
export async function rpcWithRetry<T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  opts: { maxAttempts?: number; delayMs?: number } = {}
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.delayMs ?? 500;

  let lastErr: { message: string; code?: string } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await supabase.rpc(fn, params);
      // Éxito de red (sin importar data.success): devolvemos tal cual.
      // Los errores de lógica vienen en res.error con code PGRST*/42*/23* o en data.success=false,
      // y no deben reintentarse.
      if (!res.error) {
        return { data: res.data as T, error: null };
      }

      const err = res.error as { message?: string; code?: string; details?: string };
      const msg = (err.message || '').toLowerCase();
      const code = err.code || '';

      // Errores de red / infraestructura → reintentar
      const isNetworkError =
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('connection') ||
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('aborted') ||
        msg.includes('socket') ||
        msg.includes('econn') ||
        // PostgREST está recargando su caché de esquema (ventana de ~1-2s tras
        // una migración): la función existe pero temporalmente devuelve 404.
        // Reintentar hace que la llamada se auto-repare cuando termina la recarga.
        msg.includes('schema cache') ||
        msg.includes('find the function') ||
        code === 'PGRST202' || // función no encontrada en la caché (recarga en curso)
        code === '57P01' || // admin shutdown
        code === '57P02' || // crash shutdown
        code === '57P03' || // cannot connect now
        code === '08006' || // connection_failure
        code === '08001' || // sqlclient_unable_to_establish
        code === '08004' || // rejected
        code === 'XX000'; // ECHECKOUTTIMEOUT del pooler

      if (!isNetworkError) {
        // Error de lógica/permisos/validación → devolver sin reintentar
        return { data: null, error: { message: err.message || 'RPC error', code: err.code } };
      }

      lastErr = { message: err.message || 'Network error', code: err.code };
    } catch (e) {
      // Excepciones tipo TypeError: Failed to fetch, AbortError, etc.
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = { message: msg };
    }

    // No era el último intento: esperar antes de reintentar
    if (attempt < maxAttempts) {
      const wait = baseDelay * attempt; // backoff lineal: 500ms, 1000ms
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return {
    data: null,
    error: lastErr ?? { message: 'Unknown error after retries' },
  };
}
