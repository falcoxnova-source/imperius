import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
      render: (container: string | HTMLElement, options: Record<string, unknown>) => number;
    };
    onRecaptchaLoad?: () => void;
  }
}

interface RecaptchaConfig {
  siteKey: string;
  enabled: boolean;
}

let globalConfig: RecaptchaConfig | null = null;
let configPromise: Promise<RecaptchaConfig> | null = null;
let configFetchedAt = 0;
let scriptLoaded = false;
let scriptLoading = false;
let activeHookCount = 0;

const CONFIG_TTL_MS = 5 * 60 * 1000;

async function fetchRecaptchaConfig(): Promise<RecaptchaConfig> {
  const now = Date.now();
  if (globalConfig && (now - configFetchedAt) < CONFIG_TTL_MS) return globalConfig;

  if (configPromise && (now - configFetchedAt) < CONFIG_TTL_MS) return configPromise;

  configPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc('public_get_recaptcha_config');
      if (error) throw error;

      globalConfig = {
        siteKey: data?.site_key || '',
        enabled: data?.enabled === true || data?.enabled === 'true',
      };
      configFetchedAt = Date.now();
      return globalConfig;
    } catch {
      globalConfig = { siteKey: '', enabled: false };
      configFetchedAt = Date.now();
      return globalConfig;
    }
  })();

  return configPromise;
}

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (scriptLoaded) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  scriptLoading = true;

  return new Promise((resolve) => {
    window.onRecaptchaLoad = () => {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}&onload=onRecaptchaLoad`;
    script.async = true;
    script.defer = true;
    script.id = 'recaptcha-script';
    document.head.appendChild(script);
  });
}

function removeRecaptcha() {
  const script = document.getElementById('recaptcha-script');
  if (script) script.remove();

  const badges = document.querySelectorAll('.grecaptcha-badge');
  badges.forEach(badge => {
    const container = badge.parentElement;
    if (container) container.remove();
    else badge.remove();
  });

  const recaptchaScripts = document.querySelectorAll('script[src*="recaptcha"]');
  recaptchaScripts.forEach(s => s.remove());

  delete window.onRecaptchaLoad;
  scriptLoaded = false;
  scriptLoading = false;
}

export function useRecaptcha() {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const configRef = useRef<RecaptchaConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    activeHookCount++;

    (async () => {
      const config = await fetchRecaptchaConfig();
      if (cancelled) return;

      configRef.current = config;
      setEnabled(config.enabled);

      if (config.enabled && config.siteKey) {
        await loadRecaptchaScript(config.siteKey);
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      activeHookCount--;
      if (activeHookCount <= 0) {
        activeHookCount = 0;
        removeRecaptcha();
      }
    };
  }, []);

  const executeRecaptcha = useCallback(async (action: string): Promise<string | null> => {
    const config = configRef.current;
    if (!config?.enabled || !config.siteKey) return null;
    if (!window.grecaptcha) return null;

    try {
      return await new Promise<string>((resolve, reject) => {
        window.grecaptcha.ready(() => {
          window.grecaptcha
            .execute(config.siteKey, { action })
            .then(resolve)
            .catch(reject);
        });
      });
    } catch {
      return null;
    }
  }, []);

  return { ready, enabled, executeRecaptcha };
}
