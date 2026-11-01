/**
 * Resuelve la URL de un avatar contra el origen ACTUAL.
 *
 * Problema que resuelve: los avatares se guardaban como URL absoluta
 * (`https://tung.xnova.xyz/storage/v1/object/public/avatars/...`). Al cambiar
 * el dominio del juego, esas URLs quedaron apuntando a un host muerto y las
 * fotos dejaron de verse aunque el fichero sigue existiendo en el bucket.
 *
 * Esta funcion se queda solo con la ruta `/storage/...` y la reconstruye
 * contra la base de Supabase actual (o el origen del navegador en produccion,
 * donde Supabase se sirve desde el mismo dominio).
 */
const STORAGE_MARKER = '/storage/v1/object/';

function getSupabaseBase(): string {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function resolveAvatarUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const idx = trimmed.indexOf(STORAGE_MARKER);

  // No es un fichero de Supabase Storage: se deja tal cual (avatar externo).
  if (idx === -1) return trimmed;

  return `${getSupabaseBase()}${trimmed.slice(idx)}`;
}

/** Ruta relativa a guardar en base de datos, inmune a cambios de dominio. */
export function toStoragePath(publicUrl: string): string {
  const idx = publicUrl.indexOf(STORAGE_MARKER);
  return idx === -1 ? publicUrl : publicUrl.slice(idx);
}
