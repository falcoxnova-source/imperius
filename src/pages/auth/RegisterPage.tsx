import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, CheckCircle, Gift, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { isValidEmail, isValidUsername } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { LanguageSelector } from '../../components/ui/LanguageSelector';
import { supabase } from '../../lib/supabase';
import { useRecaptcha } from '../../components/ui/ReCaptcha';
import { SEO } from '../../components/ui/SEO';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [requiresEmailConfirmation, setRequiresEmailConfirmation] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const { signUp, resendVerificationEmail, isLoading, error, clearError } = useAuthStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refFromUrl = searchParams.get('ref');

  // Codigo de referido efectivo: prioriza la URL, si no usa el guardado en cache.
  // Asi, si el invitado abre el link de referido y luego vuelve por un link normal,
  // se sigue contando al referidor cuando finalmente se registra.
  const [referralCode, setReferralCode] = useState<string | null>(() => {
    const fromUrl = refFromUrl ? refFromUrl.toUpperCase() : null;
    if (fromUrl) return fromUrl;
    try {
      return localStorage.getItem('xnova_referral_code');
    } catch {
      return null;
    }
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [referrerUsername, setReferrerUsername] = useState<string | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(true);
  const { enabled: recaptchaEnabled, executeRecaptcha } = useRecaptcha();

  // Cuando llega un ?ref= en la URL, lo persistimos en cache para que sobreviva
  // aunque el usuario cierre la web y vuelva mas tarde por un link normal.
  useEffect(() => {
    if (refFromUrl) {
      const code = refFromUrl.toUpperCase();
      try {
        localStorage.setItem('xnova_referral_code', code);
      } catch {
        // Ignorar si el navegador bloquea localStorage.
      }
      setReferralCode(code);
    }
  }, [refFromUrl]);

  useEffect(() => {
    if (referralCode) {
      supabase
        .from('profiles')
        .select('username')
        .eq('referral_code', referralCode.toUpperCase())
        .maybeSingle()
        .then(({ data }) => {
          if (data?.username) {
            setReferrerUsername(data.username);
          } else {
            // Codigo invalido/inexistente: limpiar cache para no arrastrar basura.
            setReferrerUsername(null);
          }
        });
    }
  }, [referralCode]);

  useEffect(() => {
    const checkRegistrationStatus = async () => {
      setIsCheckingRegistration(true);
      try {
        const { data, error } = await supabase.rpc('public_check_registration_status');

        if (error) throw error;

        if (data?.success !== undefined) {
          setRegistrationEnabled(data.enabled ?? true);
          setRegistrationMessage(data.message || null);
        }
      } catch (error) {
        console.error('Error checking registration status:', error);
      } finally {
        setIsCheckingRegistration(false);
      }
    };

    checkRegistrationStatus();
  }, []);

  const verifyRecaptcha = async (action: string): Promise<boolean> => {
    if (!recaptchaEnabled) return true;

    const token = await executeRecaptcha(action);
    if (!token) return true;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-recaptcha`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action }),
        }
      );
      const result = await res.json();
      return result.success === true;
    } catch {
      return true;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    const trimmedUsername = username.trim();
    if (!isValidUsername(trimmedUsername)) {
      setValidationError(t.auth.usernameRequirements);
      return;
    }

    if (!isValidEmail(email)) {
      setValidationError(t.auth.emailRequired);
      return;
    }

    if (password.length < 6) {
      setValidationError(t.auth.passwordRequired);
      return;
    }

    if (password !== confirmPassword) {
      setValidationError(t.auth.passwordMismatch);
      return;
    }

    const passed = await verifyRecaptcha('register');
    if (!passed) {
      setValidationError('Verificacion de seguridad fallida. Intenta de nuevo.');
      return;
    }

    try {
      const result = await signUp(email, password, trimmedUsername, referralCode?.toUpperCase() || undefined);

      // Registro exitoso: el referido ya quedo asignado, limpiar cache.
      try {
        localStorage.removeItem('xnova_referral_code');
      } catch {
        // Ignorar.
      }

      if (result.requiresEmailConfirmation) {
        setRequiresEmailConfirmation(true);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/game');
      }, 2000);
    } catch {
    }
  };

  const handleResendVerification = async () => {
    setResendSuccess(false);
    try {
      await resendVerificationEmail(email);
      setResendSuccess(true);
    } catch {
    }
  };

  if (requiresEmailConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat overflow-hidden">
        <div className="absolute inset-0 bg-black/40" />
        <div className="nebula-layer" aria-hidden="true" />
        <div className="stars-layer" aria-hidden="true" />
        <div className="stars-layer-2" aria-hidden="true" />
        <div className="shooting-stars" aria-hidden="true">
          <div className="shooting-star shooting-star-1" />
          <div className="shooting-star shooting-star-2" />
          <div className="shooting-star shooting-star-3" />
        </div>

        <div className="absolute top-4 right-4 z-10">
          <LanguageSelector />
        </div>

        <div className="card-glass w-full max-w-md p-8 text-center relative z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-cyber-blue/20 rounded-full blur-3xl animate-pulse" />
            <Mail className="w-20 h-20 text-cyber-blue mx-auto mb-4 relative z-10 animate-bounce" />
          </div>
          <h2 className="font-orbitron text-2xl text-white mb-4">{t.auth.verifyEmailTitle}</h2>
          <p className="text-gray-400 mb-6">{t.auth.verifyEmailDescription}</p>

          <div className="relative overflow-hidden rounded-xl p-4 mb-6 bg-gradient-to-r from-amber-500/10 via-cyber-blue/10 to-amber-500/10 border border-amber-500/30">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
            <div className="relative z-10">
              <p className="text-amber-300 text-sm leading-relaxed">
                <span className="text-lg">✨🚀</span> <span className="font-semibold text-white">¡No te preocupes, Comandante!</span> <span className="text-lg">🚀✨</span>
              </p>
              <p className="text-gray-300 text-sm mt-2 leading-relaxed">
                Si no recibes el correo de verificación, <span className="text-cyber-blue font-medium">nuestro equipo verificará tu cuenta manualmente</span> en menos de <span className="text-amber-400 font-bold">24 horas</span>.
              </p>
              <p className="text-gray-400 text-xs mt-3 flex items-center justify-center gap-1">
                <span>🛡️</span> Tu aventura galáctica está asegurada <span>🌟</span>
              </p>
            </div>
          </div>

          {resendSuccess && (
            <div className="flex items-center justify-center gap-2 p-3 mb-4 bg-cyber-green/20 border border-cyber-green/50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-cyber-green" />
              <p className="text-cyber-green text-sm">{t.auth.verificationSent}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleResendVerification}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-gray-300 hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {t.auth.resendVerification}
            </button>

            <Link
              to="/login"
              className="btn-cyber w-full inline-block text-center"
            >
              {t.auth.backToLogin}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat overflow-hidden">
        <div className="absolute inset-0 bg-black/40" />
        <div className="nebula-layer" aria-hidden="true" />
        <div className="stars-layer" aria-hidden="true" />
        <div className="stars-layer-2" aria-hidden="true" />
        <div className="shooting-stars" aria-hidden="true">
          <div className="shooting-star shooting-star-1" />
          <div className="shooting-star shooting-star-2" />
        </div>
        <div className="card-glass w-full max-w-md p-8 text-center relative z-10">
          <CheckCircle className="w-20 h-20 text-cyber-green mx-auto mb-4" />
          <h2 className="font-orbitron text-2xl text-white mb-2">{t.auth.registerSuccess}</h2>
          <p className="text-gray-400">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Registrarse | Imperium"
        description="Crea tu cuenta gratis en Imperium, el juego de estrategia espacial play-to-earn. Empieza a ganar criptomonedas jugando sin inversión. Registro rápido en 30 segundos."
      />
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat overflow-hidden">
      <div className="absolute inset-0 bg-black/40" />
      <div className="nebula-layer" aria-hidden="true" />
      <div className="stars-layer" aria-hidden="true" />
      <div className="stars-layer-2" aria-hidden="true" />
      <div className="stars-layer-3" aria-hidden="true" />
      <div className="shooting-stars" aria-hidden="true">
        <div className="shooting-star shooting-star-1" />
        <div className="shooting-star shooting-star-2" />
        <div className="shooting-star shooting-star-3" />
      </div>

      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>

      <div className="card-glass w-full max-w-md p-8 relative">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-2">
            <div className="absolute inset-0 bg-cyber-blue/10 rounded-full blur-[60px] animate-pulse scale-150" />
                <img src="/Imagenes/Visuales/main_city.webp" alt="Imperium" className="w-28 h-28 object-cover rounded-full bg-stone-950 ring-4 ring-amber-500/60 relative z-10 shadow-[0_0_30px_rgba(245,158,11,0.4)]" draggable={false} />
          </div>
          <p className="text-gray-400 mt-2">{t.auth.registerTitle}</p>
        </div>

        {(error || validationError) && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-cyber-red flex-shrink-0" />
            <p className="text-cyber-red text-sm">{validationError || error}</p>
          </div>
        )}

        {referrerUsername && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-amber-500/20 border border-amber-500/50 rounded-lg">
            <Gift className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <p className="text-amber-400 text-sm">
              Invitado por <span className="font-semibold">{referrerUsername}</span>
            </p>
          </div>
        )}

        {!registrationEnabled && registrationMessage && (
          <div className="flex items-center gap-3 p-4 mb-6 bg-red-900/30 border border-red-700/50 rounded-lg">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-300 font-semibold text-sm">Registro Cerrado</p>
              <p className="text-red-400 text-sm mt-1">{registrationMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.auth.username}</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-cyber pl-11"
                placeholder="Commander"
                required
                minLength={3}
                maxLength={20}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.auth.email}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-cyber pl-11"
                placeholder="you@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.auth.password}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-cyber pl-11"
                placeholder="********"
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.auth.confirmPassword}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`input-cyber pl-11 ${
                  confirmPassword && password !== confirmPassword
                    ? 'border-cyber-red'
                    : ''
                }`}
                placeholder="********"
                required
              />
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-cyber-red mt-1">{t.auth.passwordMismatch}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || password !== confirmPassword || !registrationEnabled || isCheckingRegistration}
            className="btn-cyber w-full"
          >
            {isCheckingRegistration ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Verificando...
              </span>
            ) : isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.common.loading}
              </span>
            ) : !registrationEnabled ? (
              'Registro Cerrado'
            ) : (
              t.auth.register
            )}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-6">
          {t.auth.hasAccount}{' '}
          <Link to="/login" className="text-cyber-blue hover:underline">
            {t.auth.login}
          </Link>
        </p>

        <div className="mt-8 pt-6 border-t border-space-700/50 space-y-2">
          <p className="text-center text-gray-500 text-xs leading-relaxed">
            Registrate gratis y empieza a ganar criptomonedas jugando.
              Imperium es un juego de estrategia espacial tipo OGame
            con recompensas blockchain play-to-earn. Gana cryptos sin inversion.
            Ganar bitcoin gratis, ganar ethereum, ganar USDT jugando videojuegos.
          </p>
          <p className="text-center text-gray-600 text-[10px] leading-relaxed">
            Mejor juego play-to-earn 2026 | Ganar dinero desde casa sin invertir |
            Apps para ganar criptomonedas | Free crypto game | Best P2E game |
            GameFi | Web3 gaming | Juego tipo OGame con blockchain
          </p>
        </div>
      </div>
    </div>
    </>
  );
}
