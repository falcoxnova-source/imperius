import { create } from 'zustand';
import { supabase, withRetry, isNetworkError, isServiceUnavailable } from '../lib/supabase';
import type { Profile } from '../types/game';
import type { User, Session } from '@supabase/supabase-js';

// Persistent device ID stored in localStorage (survives browser restarts)
function getOrCreateDeviceId(): string {
  const key = 'xnova_device_id';
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    // Generate a random persistent ID
    deviceId = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    try {
      localStorage.setItem(key, deviceId);
    } catch {
      // localStorage might be disabled
    }
  }
  return deviceId;
}

// Detect installed fonts (different devices have different fonts)
function detectFonts(): string {
  const testFonts = [
    'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
    'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'MS Gothic',
    'MS PGothic', 'MS UI Gothic', 'Meiryo', 'Yu Gothic', 'Malgun Gothic',
    'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Helvetica Neue'
  ];
  
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testString = 'mmmmmmmmmmlli';
  const testSize = '72px';
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'no-canvas';
  
  const detected: string[] = [];
  
  for (const font of testFonts) {
    let isAvailable = false;
    for (const baseFont of baseFonts) {
      ctx.font = `${testSize} ${baseFont}`;
      const baseWidth = ctx.measureText(testString).width;
      ctx.font = `${testSize} "${font}", ${baseFont}`;
      const testWidth = ctx.measureText(testString).width;
      if (baseWidth !== testWidth) {
        isAvailable = true;
        break;
      }
    }
    if (isAvailable) {
      detected.push(font);
    }
  }
  
  return detected.join(',');
}

function generateBrowserFingerprint(): string {
  // Persistent device ID (very important for multi-account detection)
  const deviceId = getOrCreateDeviceId();
  
  // Canvas fingerprint
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let canvasHash = '';
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Xnova🚀', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Xnova🚀', 4, 17);
    canvasHash = canvas.toDataURL();
  }

  // WebGL fingerprint
  let webglHash = '';
  let webglParams = '';
  try {
    const glCanvas = document.createElement('canvas');
    const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
    if (gl) {
      const glContext = gl as WebGLRenderingContext;
      const debugInfo = glContext.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        webglHash = glContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) + '~' +
                    glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
      // Additional WebGL parameters
      webglParams = [
        glContext.getParameter(glContext.MAX_VERTEX_ATTRIBS),
        glContext.getParameter(glContext.MAX_VERTEX_UNIFORM_VECTORS),
        glContext.getParameter(glContext.MAX_FRAGMENT_UNIFORM_VECTORS),
        glContext.getParameter(glContext.MAX_TEXTURE_SIZE),
        glContext.getParameter(glContext.MAX_RENDERBUFFER_SIZE),
      ].join('-');
    }
  } catch {
    webglHash = 'no-webgl';
  }

  // Audio fingerprint
  let audioHash = '';
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (AudioContext) {
      const context = new AudioContext();
      audioHash = context.sampleRate + '-' + context.destination.maxChannelCount;
      context.close();
    }
  } catch {
    audioHash = 'no-audio';
  }

  // Font detection
  const fonts = detectFonts();

  // Screen details (more granular)
  const screenInfo = [
    screen.width,
    screen.height,
    screen.availWidth,
    screen.availHeight,
    screen.colorDepth,
    screen.pixelDepth,
    window.devicePixelRatio || 1,
  ].join('x');

  // Storage quota (if available)
  let storageInfo = '';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      // Async but we'll use a sync approximation
      storageInfo = 'storage-available';
    }
  } catch {
    storageInfo = 'no-storage';
  }

  // Connection info
  let connectionInfo = '';
  try {
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    if (conn) {
      connectionInfo = `${conn.effectiveType || ''}-${conn.downlink || ''}-${conn.rtt || ''}`;
    }
  } catch {
    connectionInfo = 'no-connection';
  }

  const components = [
    deviceId, // Persistent ID - survives across sessions
    navigator.userAgent,
    navigator.language,
    navigator.languages?.join(',') || '',
    screenInfo,
    new Date().getTimezoneOffset(),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.hardwareConcurrency || 0,
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0,
    navigator.maxTouchPoints || 0,
    canvasHash,
    webglHash,
    webglParams,
    audioHash,
    fonts,
    navigator.platform || '',
    navigator.plugins?.length || 0,
    navigator.cookieEnabled ? 1 : 0,
    typeof window.indexedDB !== 'undefined' ? 1 : 0,
    typeof window.sessionStorage !== 'undefined' ? 1 : 0,
    storageInfo,
    connectionInfo,
    // PDF viewer
    navigator.pdfViewerEnabled ? 1 : 0,
  ];

  // Create a robust hash using djb2 algorithm
  let hash = 5381;
  const str = components.join('|||');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  
  // Include deviceId in output for guaranteed persistence
  const hashPart = Math.abs(hash).toString(36);
  const devicePart = deviceId.substring(4, 12); // Part of device ID
  return `${hashPart}-${devicePart}-${str.length.toString(36)}`;
}

const isServerOverloaded = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { status?: number; code?: string; message?: string };
  return (
    err.status === 503 ||
    err.status === 504 ||
    err.status === 502 ||
    err.code === 'PGRST002' ||
    err.message?.toLowerCase().includes('schema cache') ||
    err.message?.toLowerCase().includes('upstream request timeout') ||
    err.message?.toLowerCase().includes('gateway timeout') ||
    isNetworkError(error) ||
    isServiceUnavailable(error)
  );
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 5000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isServerOverloaded(error) || attempt === maxRetries) {
        throw error;
      }

      const backoffMs = baseDelay * Math.pow(2, attempt) + Math.random() * 3000;
      await delay(backoffMs);
    }
  }

  throw lastError;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  requires2FA: boolean;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, username: string, referralCode?: string) => Promise<{ requiresEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  verifyLoginCode: (code: string) => Promise<void>;
  cancel2FA: () => void;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  clearError: () => void;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  updatePasswordWithToken: (token: string, newPassword: string) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  verifyEmailToken: (token: string) => Promise<boolean>;
}

// Credenciales temporales retenidas en memoria durante el reto 2FA de login.
// No se persisten y se limpian al verificar o cancelar.
let pending2faEmail: string | null = null;
let pending2faPassword: string | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  error: null,
  requires2FA: false,

  initialize: async () => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 15000);
      });

      const sessionPromise = retryWithBackoff(async () => {
        const result = await supabase.auth.getSession();
        if (result.error) throw result.error;
        return result;
      }, 3, 1500);

      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

      if (session) {
        set({ user: session.user, session });
        await get().fetchProfile();
      }

      supabase.auth.onAuthStateChange((event, session) => {
        (async () => {
          set({ user: session?.user ?? null, session });
          if (session) {
            await get().fetchProfile();
          } else {
            set({ profile: null });
            if ((event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) && window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
          }
        })();
      });
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email: string, password: string, username: string, referralCode?: string) => {
    set({ isLoading: true, error: null });
    try {
      const existingUser = await retryWithBackoff(async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle();
        if (error && !isServerOverloaded(error)) throw error;
        return data;
      });

      if (existingUser) {
        throw new Error('Este nombre de usuario ya esta en uso');
      }

      const metadata: Record<string, string> = { username };
      if (referralCode) {
        metadata.referral_code = referralCode;
      }

      const { data, error } = await retryWithBackoff(async () => {
        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: metadata,
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (result.error) throw result.error;
        return result;
      });

      if (error) {
        let friendlyMessage = error.message;
        if (error.message.includes('User already registered') || error.message.includes('already been registered')) {
          friendlyMessage = 'Este email ya esta registrado. Intenta iniciar sesion.';
        } else if (error.message.includes('Password')) {
          friendlyMessage = 'La contrasena debe tener al menos 6 caracteres.';
        } else if (error.message.includes('email')) {
          friendlyMessage = 'El formato del email no es valido.';
        } else if (error.status === 422) {
          friendlyMessage = 'No se pudo completar el registro. Verifica tus datos e intenta de nuevo.';
        }
        throw new Error(friendlyMessage);
      }

      if (data.user) {
        let autoVerified = false;
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-verification-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              user_id: data.user.id,
              username,
              redirect_url: window.location.origin,
            }),
          });
          const emailResult = await emailResp.json().catch(() => ({}));
          if (emailResult.auto_verified === true) {
            autoVerified = true;
          }
        } catch (emailError) {
          console.error('Error sending verification email:', emailError);
        }

        if (autoVerified) {
          // SMTP disabled: account is already verified, sign in automatically
          try {
            const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (!signInError && sessionData.session) {
              set({ user: sessionData.user, session: sessionData.session, isAuthenticated: true });
            }
          } catch (signInErr) {
            console.error('Auto sign-in after registration failed:', signInErr);
          }
          return { requiresEmailConfirmation: false };
        }

        if (data.session) {
          await supabase.auth.signOut();
        }
        return { requiresEmailConfirmation: true };
      }

      return { requiresEmailConfirmation: false };
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : 'Error al registrarse';
      if (isServerOverloaded(error)) {
        message = 'El servidor esta experimentando alta carga. Por favor, espera unos segundos e intenta de nuevo.';
      }
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      let emailVerified = true;
      let accountBanned = false;

      try {
        const verificationResult = await retryWithBackoff(async () => {
          const { data, error } = await supabase.rpc('check_email_verified_by_email', {
            p_email: email,
          });
          if (error) throw error;
          return data;
        }, 3, 2000);

        if (verificationResult && verificationResult.banned) {
          accountBanned = true;
        }
        if (verificationResult && !verificationResult.verified) {
          emailVerified = false;
        }
      } catch (verifyError) {
        if (isServerOverloaded(verifyError)) {
          console.warn('Email verification check skipped due to server load, proceeding with login');
          emailVerified = true;
        } else {
          throw verifyError;
        }
      }

      if (accountBanned) {
        throw new Error('ACCOUNT_BANNED');
      }

      if (!emailVerified) {
        throw new Error('EMAIL_NOT_VERIFIED');
      }

      const { error } = await retryWithBackoff(async () => {
        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error) throw result.error;
        return result;
      }, 4, 2500);

      if (error) throw error;

      // 2FA opcional de inicio de sesion (solo correo)
      let twoFAEnabled = false;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('two_factor_login_enabled')
            .eq('id', user.id)
            .maybeSingle();
          twoFAEnabled = !!prof?.two_factor_login_enabled;
        }
      } catch {
        twoFAEnabled = false;
      }

      if (twoFAEnabled) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-login-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: '{}',
          });
        } catch (e) {
          console.error('Error sending login code:', e);
        }
        pending2faEmail = email;
        pending2faPassword = password;
        // Cerramos la sesion hasta que el codigo sea verificado.
        await supabase.auth.signOut();
        set({ requires2FA: true });
        throw new Error('LOGIN_2FA_REQUIRED');
      }

      const fingerprint = generateBrowserFingerprint();
      supabase.rpc('log_login_session', {
        p_ip_address: 'client',
        p_user_agent: navigator.userAgent,
        p_fingerprint: fingerprint,
        p_country_code: null,
      }).catch(() => {});
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : 'Error al iniciar sesion';
      if (message === 'LOGIN_2FA_REQUIRED') {
        // No es un error real: es el reto 2FA. No mostramos mensaje de error.
        throw error;
      }
      if (message === 'EMAIL_NOT_VERIFIED') {
        message = 'Debes verificar tu email antes de iniciar sesion. Revisa tu bandeja de entrada.';
      } else if (message === 'ACCOUNT_BANNED') {
        message = 'Esta cuenta ha sido suspendida. Contacta con el soporte si crees que es un error.';
      } else if (message.includes('Invalid login credentials')) {
        message = 'Email o contrasena incorrectos';
      } else if (isServerOverloaded(error)) {
        message = 'El servidor esta experimentando alta carga. Por favor, espera unos segundos e intenta de nuevo.';
      }
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  verifyLoginCode: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!pending2faEmail || !pending2faPassword) {
        throw new Error('La sesion de verificacion expiro. Inicia sesion de nuevo.');
      }
      if (!/^\d{6}$/.test((code || '').trim())) {
        throw new Error('Ingresa el codigo de 6 digitos enviado a tu correo');
      }
      // Reautenticamos para obtener una sesion valida y verificar el codigo.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: pending2faEmail,
        password: pending2faPassword,
      });
      if (signInErr) throw signInErr;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/verify-login-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: (code || '').trim() }),
      });
      const result = await resp.json().catch(() => ({ success: false }));

      if (!result.success) {
        // Codigo incorrecto: cerramos la sesion para mantener el bloqueo.
        await supabase.auth.signOut();
        throw new Error(result.error || 'Codigo incorrecto o expirado');
      }

      // Codigo correcto: mantenemos la sesion iniciada.
      pending2faEmail = null;
      pending2faPassword = null;
      set({ requires2FA: false });

      const fingerprint = generateBrowserFingerprint();
      supabase.rpc('log_login_session', {
        p_ip_address: 'client',
        p_user_agent: navigator.userAgent,
        p_fingerprint: fingerprint,
        p_country_code: null,
      }).catch(() => {});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al verificar el codigo';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  cancel2FA: () => {
    pending2faEmail = null;
    pending2faPassword = null;
    set({ requires2FA: false, error: null });
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null, session: null, profile: null });
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const data = await retryWithBackoff(async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      }, 3, 1500);

      if (data) {
        if (data.is_banned) {
          await supabase.auth.signOut();
          set({
            user: null,
            session: null,
            profile: null,
            isAuthenticated: false,
            error: 'Esta cuenta ha sido suspendida. Contacta con el soporte si crees que es un error.',
          });
          return;
        }
        set({ profile: data });
        // Track player activity for inactive accounts detection
        supabase.rpc('update_player_activity').then(() => {}).catch(() => {});
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  },

  refreshProfile: async () => {
    await get().fetchProfile();
  },

  updateProfile: async (updates: Partial<Profile>) => {
    const { user } = get();
    if (!user) return;

    try {
      await retryWithBackoff(async () => {
        const { error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id);
        if (error) throw error;
      });
      await get().fetchProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  },

  clearError: () => set({ error: null }),

  sendPasswordResetEmail: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await retryWithBackoff(async () => {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-password-reset-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            redirect_url: window.location.origin,
          }),
        });
        if (res.status === 503 || res.status === 504) {
          throw new Error('Server overloaded');
        }
        return res;
      });

      const result = await response.json();

      if (!response.ok && !result.success) {
        throw new Error(result.error || 'Error al enviar el correo');
      }
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : 'Error al enviar el correo';
      if (isServerOverloaded(error)) {
        message = 'El servidor esta experimentando alta carga. Por favor, espera unos segundos e intenta de nuevo.';
      }
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  updatePasswordWithToken: async (token: string, newPassword: string) => {
    set({ isLoading: true, error: null });
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await retryWithBackoff(async () => {
        const res = await fetch(`${supabaseUrl}/functions/v1/update-user-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            new_password: newPassword,
          }),
        });
        if (res.status === 503 || res.status === 504) {
          throw new Error('Server overloaded');
        }
        return res;
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Error al actualizar la contrasena');
      }
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : 'Error al actualizar la contrasena';
      if (isServerOverloaded(error)) {
        message = 'El servidor esta experimentando alta carga. Por favor, espera unos segundos e intenta de nuevo.';
      }
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  resendVerificationEmail: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await retryWithBackoff(async () => {
        const res = await fetch(`${supabaseUrl}/functions/v1/resend-verification-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            redirect_url: window.location.origin,
          }),
        });
        if (res.status === 503 || res.status === 504) {
          throw new Error('Server overloaded');
        }
        return res;
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al reenviar el correo');
      }
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : 'Error al reenviar el correo';
      if (isServerOverloaded(error)) {
        message = 'El servidor esta experimentando alta carga. Por favor, espera unos segundos e intenta de nuevo.';
      }
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  verifyEmailToken: async (token: string) => {
    // IMPORTANTE: no tocar el `isLoading` GLOBAL aqui. AppRoutes muestra el
    // LoadingScreen de toda la app cuando isLoading=true, lo que desmonta la
    // pagina /verify-email; al terminar la RPC se vuelve a montar y se repite
    // la verificacion en bucle (sintoma: "cargando" infinito). La pagina
    // /verify-email maneja su propio estado de carga local.
    set({ error: null });
    try {
      const data = await retryWithBackoff(async () => {
        const { data, error } = await supabase.rpc('verify_email_token', {
          p_token: token,
        });
        if (error) throw error;
        return data;
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Token invalido o expirado');
      }

      return true;
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : 'Error al verificar el email';
      if (isServerOverloaded(error)) {
        message = 'El servidor esta experimentando alta carga. Por favor, espera unos segundos e intenta de nuevo.';
      }
      set({ error: message });
      return false;
    }
  },
}));
