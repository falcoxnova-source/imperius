import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, RefreshCw, Loader2, Users, Trophy, ArrowDownCircle, ArrowUpCircle, BarChart3, Compass, Crown, Zap } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';
import { LanguageSelector } from '../../components/ui/LanguageSelector';
import { useRecaptcha } from '../../components/ui/ReCaptcha';
import { supabase } from '../../lib/supabase';
import { SEO } from '../../components/ui/SEO';
import { usePublicGameStats, formatUsdt } from '../../lib/publicStats';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const gameStats = usePublicGameStats();
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [loginCode, setLoginCode] = useState('');
  const { signIn, verifyLoginCode, cancel2FA, requires2FA, resendVerificationEmail, isLoading, error, clearError } = useAuthStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { enabled: recaptchaEnabled, executeRecaptcha } = useRecaptcha();

  // Online players count (poll every 60s)
  useEffect(() => {
    const fetchOnline = () => supabase.rpc('get_online_players_count').then(({ data, error }) => {
      if (error) console.error('online count error:', error);
      else if (data) {
        const count = typeof data === 'number' ? data : (typeof data?.online === 'number' ? data.online : 0);
        setOnlineCount(count);
      }
    }).catch(err => console.error('online count fetch error:', err));
    fetchOnline();
    const interval = setInterval(fetchOnline, 60000);
    return () => clearInterval(interval);
  }, []);

  const isEmailNotConfirmed = error?.toLowerCase().includes('email not confirmed') ||
                              error?.toLowerCase().includes('email_not_confirmed') ||
                              error?.includes('verificar tu email');

  const isServerError = error?.toLowerCase().includes('alta carga') ||
                        error?.toLowerCase().includes('servidor') ||
                        error?.toLowerCase().includes('503') ||
                        error?.toLowerCase().includes('504') ||
                        error?.toLowerCase().includes('timeout');

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
    setResendSuccess(false);
    setIsRetrying(false);

    const passed = await verifyRecaptcha('login');
    if (!passed) {
      useAuthStore.setState({ error: 'Verificacion de seguridad fallida. Intenta de nuevo.' });
      return;
    }

    try {
      await signIn(email, password);
      navigate('/game');
    } catch {
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    clearError();

    const passed = await verifyRecaptcha('login');
    if (!passed) {
      useAuthStore.setState({ error: 'Verificacion de seguridad fallida. Intenta de nuevo.' });
      setIsRetrying(false);
      return;
    }

    try {
      await signIn(email, password);
      navigate('/game');
    } catch {
    } finally {
      setIsRetrying(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail(email);
      setResendSuccess(true);
    } catch {
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await verifyLoginCode(loginCode);
      setLoginCode('');
      navigate('/game');
    } catch {
    }
  };

  const handleResendLoginCode = async () => {
    clearError();
    try {
      await signIn(email, password);
    } catch {
      // signIn lanza LOGIN_2FA_REQUIRED al reenviar el codigo; es esperado.
    }
  };

  const handleCancel2FA = () => {
    setLoginCode('');
    cancel2FA();
  };

  return (
    <>
      <SEO
        title="Iniciar Sesión | Imperium"
        description="Accede a tu cuenta de Imperium, el juego de estrategia espacial play-to-earn. Inicia sesión y continúa construyendo tu imperio galáctico."
        noIndex
      />
      <div className="relative min-h-screen bg-auth bg-cover bg-center bg-no-repeat overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 pointer-events-none" />
      <div className="nebula-layer" aria-hidden="true" />
      <div className="stars-layer" aria-hidden="true" />
      <div className="stars-layer-2" aria-hidden="true" />
      <div className="stars-layer-3" aria-hidden="true" />
      <div className="shooting-stars" aria-hidden="true">
        <div className="shooting-star shooting-star-1" />
        <div className="shooting-star shooting-star-2" />
        <div className="shooting-star shooting-star-3" />
      </div>

      {/* Stats bar - TOP (sticky) */}
      {gameStats && (
        <div className="sticky top-0 z-20 w-full bg-space-900/95 backdrop-blur-md border-b border-cyan-500/20">
          <div className="max-w-7xl mx-auto px-3 py-1.5">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-x-5 text-[9px] sm:text-xs">
              <div className="flex items-center gap-1 text-gray-300">
                <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyber-blue flex-shrink-0" />
                <span className="text-white font-semibold">{gameStats.total_players.toLocaleString()}</span>
                <span className="text-gray-500">Jugadores</span>
              </div>
              <div className="flex items-center gap-1 text-gray-300">
                <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400 flex-shrink-0" />
                <span className="text-white font-semibold">{gameStats.ranked_players.toLocaleString()}</span>
                <span className="text-gray-500">Ranking</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-space-600" />
              <div className="flex items-center gap-1 text-gray-300">
                <ArrowDownCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-400 flex-shrink-0" />
                <span className="text-green-400 font-semibold">{formatUsdt(gameStats.total_deposited)}</span>
                <span className="text-gray-500">Dep.</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-space-600" />
              <div className="flex items-center gap-1 text-gray-300">
                <ArrowUpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-400 flex-shrink-0" />
                <span className="text-purple-400 font-semibold">{formatUsdt(gameStats.total_withdrawn)}</span>
                <span className="text-gray-500">Ret.</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-space-600" />
              <div className="flex items-center gap-1 text-gray-300">
                <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-400 flex-shrink-0" />
                <span className="text-white font-semibold">{gameStats.market_transactions.toLocaleString()}</span>
                <span className="text-gray-500">P2P</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-space-600" />
              <div className="flex items-center gap-1 text-gray-300">
                <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-amber-400 font-semibold">{formatUsdt(gameStats.market_volume_usdt)}</span>
                <span className="text-gray-500">Vol. P2P</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-space-600" />
              <div className="flex items-center gap-1 text-gray-300">
                <Compass className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400 flex-shrink-0" />
                <span className="text-cyan-400 font-semibold">{formatUsdt(gameStats.expedition_pool_fxu * gameStats.tung_price_usd)}</span>
                <span className="text-gray-500">Exp.</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-space-600" />
              <div className="flex items-center gap-1 text-gray-300">
                <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400 flex-shrink-0" />
                <span className="text-yellow-400 font-semibold">{formatUsdt(gameStats.total_jackpot_usdt)}</span>
                <span className="text-gray-500">Jackpot</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-space-600" />
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${onlineCount !== null && onlineCount > 0 ? 'bg-green-400' : 'bg-gray-600'}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${onlineCount !== null && onlineCount > 0 ? 'bg-green-400' : 'bg-gray-600'}`} />
                </span>
                <span className={`font-semibold ${onlineCount !== null && onlineCount > 0 ? 'text-green-400' : 'text-gray-500'}`}>{onlineCount ?? '0'}</span>
                <span className="text-gray-500">Online</span>
              </div>
              {/* Language selector inline */}
              <div className="flex items-center ml-1">
                <LanguageSelector />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Language selector fallback when no stats */}
      {!gameStats && (
        <div className="absolute top-3 right-3 z-30">
          <LanguageSelector />
        </div>
      )}

      {/* Main content */}
      <div className="flex items-center justify-center px-4 py-8 relative min-h-[calc(100vh-40px)]">
        <div className="card-glass w-full max-w-lg sm:max-w-xl p-6 sm:p-8 relative">
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-3">
            <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-[60px] animate-pulse scale-150" />
            <img src="/Imagenes/Visuales/login.webp" alt="Imperium" className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full bg-white ring-4 ring-amber-500/70 shadow-[0_0_30px_rgba(245,158,11,0.45)]" draggable={false} />
          </div>
          <p className="text-amber-200/90 mt-1 text-sm font-serif">{t.auth.welcomeSubtitle}</p>
          <div className="flex items-center gap-3 mt-3">
            <a href="https://t.me/TrungTungMeme" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-space-800/60 border border-space-600/40 hover:border-[#26A5E4]/50 hover:bg-[#26A5E4]/10 transition-all duration-200 group" title="Telegram">
              <svg className="w-4 h-4 text-gray-400 group-hover:text-[#26A5E4] transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </a>
            <a href="https://x.com/FalcoX_universe" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-space-800/60 border border-space-600/40 hover:border-white/30 hover:bg-white/5 transition-all duration-200 group" title="X (Twitter)">
              <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
          </div>
        </div>

        {/* Swap + Jackpot row */}
        <div className="mb-5 flex flex-col sm:flex-row gap-2.5">
          {/* Falco-X Swap */}
          <a
            href="https://falcoxswap.com/?inputCurrency=BNB&outputCurrency=0x09514EcF8270C12101D077B5e8B034B164F71C5f"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-cyan-500/25 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 hover:from-cyan-500/15 hover:to-purple-500/15 hover:border-cyan-400/50 transition-all duration-300"
          >
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-1 bg-cyan-400/20 rounded-full blur-lg group-hover:bg-cyan-400/35 transition-all animate-pulse" />
              <img
                src="https://photos.pinksale.finance/file/pinksale-logo-upload/1773168759088-37559186946c9a3c11ccc8a2f5b77dcd.png"
                alt="Falco-X Swap"
                className="relative w-10 h-10 rounded-full ring-2 ring-cyan-400/50 group-hover:ring-cyan-300/80 shadow-[0_0_12px_rgba(34,211,238,0.25)] group-hover:scale-105 transition-all duration-300 bg-space-900"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-cyan-400 group-hover:text-cyan-300 transition-colors leading-tight">
                Falco-X Swap
              </p>
              <p className="text-[9px] text-gray-500 group-hover:text-gray-400 transition-colors leading-tight mt-0.5">
                ETH &amp; BNB · 33% fee referido
              </p>
            </div>
            <svg className="w-3.5 h-3.5 text-gray-600 group-hover:text-cyan-400 transition-colors flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          {/* Jackpot */}
          {gameStats && gameStats.total_jackpot_fxu > 0 && (
            <div className="flex-1 p-2.5 rounded-lg border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-yellow-500/10 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-transparent animate-pulse" />
              <div className="relative flex items-center gap-2.5">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-yellow-400 font-orbitron leading-tight">
                    🏆 {gameStats.total_jackpot_fxu.toLocaleString()} TUNG
                    <span className="text-yellow-500/70 font-normal ml-1 text-[10px]">({formatUsdt(gameStats.total_jackpot_usdt)})</span>
                  </p>
                  <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">
                    Fortaleza: {gameStats.fortress_pool_fxu.toLocaleString()} · Tesoro: {gameStats.treasure_pool_fxu.toLocaleString()} · Ranking: {gameStats.monthly_pool_fxu.toLocaleString()} · Exp: {gameStats.expedition_pool_fxu.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className={`flex flex-col gap-3 p-4 mb-6 rounded-lg ${
            isServerError
              ? 'bg-amber-500/20 border border-amber-500/50'
              : 'bg-cyber-red/20 border border-cyber-red/50'
          }`}>
            <div className="flex items-center gap-2">
              {isServerError ? (
                <Loader2 className="w-5 h-5 text-amber-400 flex-shrink-0 animate-spin" />
              ) : (
                <AlertCircle className="w-5 h-5 text-cyber-red flex-shrink-0" />
              )}
              <p className={`text-sm ${isServerError ? 'text-amber-400' : 'text-cyber-red'}`}>
                {isEmailNotConfirmed ? t.auth.emailNotConfirmed : error}
              </p>
            </div>
            {isServerError && email && password && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isLoading || isRetrying}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-500/20 border border-amber-500/50 rounded text-amber-400 text-sm hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Reintentando...' : 'Reintentar conexion'}
              </button>
            )}
            {isEmailNotConfirmed && email && (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-cyber-blue/20 border border-cyber-blue/50 rounded text-cyber-blue text-sm hover:bg-cyber-blue/30 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {t.auth.resendVerification}
              </button>
            )}
          </div>
        )}

        {resendSuccess && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-cyber-green/20 border border-cyber-green/50 rounded-lg">
            <Mail className="w-5 h-5 text-cyber-green flex-shrink-0" />
            <p className="text-cyber-green text-sm">{t.auth.verificationSent}</p>
          </div>
        )}

        {requires2FA ? (
          <form onSubmit={handleVerify2FA} className="space-y-6">
            <div className="p-4 rounded-lg bg-cyber-blue/10 border border-cyber-blue/30 flex items-start gap-2">
              <Mail className="w-5 h-5 text-cyber-blue mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-300">
                Enviamos un codigo de 6 digitos a tu correo. Introducelo para completar el inicio de sesion.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Codigo de verificacion</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input-cyber text-center tracking-[0.5em] font-orbitron text-xl"
                placeholder="000000"
                autoFocus
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || loginCode.trim().length !== 6}
              className="btn-cyber w-full disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.common.loading}
                </span>
              ) : (
                'Verificar e iniciar sesion'
              )}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleResendLoginCode}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-space-700/60 hover:bg-space-700 text-gray-300 border border-space-600 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                Reenviar codigo
              </button>
              <button
                type="button"
                onClick={handleCancel2FA}
                className="flex-1 px-4 py-2 bg-space-700/60 hover:bg-space-700 text-gray-300 border border-space-600 rounded-lg transition-colors text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-gray-400">{t.auth.password}</label>
              <Link
                to="/forgot-password"
                className="text-sm text-amber-400 hover:underline"
              >
                {t.auth.forgotPassword}
              </Link>
            </div>
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

          <button
            type="submit"
            disabled={isLoading}
            className="btn-cyber w-full"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.common.loading}
              </span>
            ) : (
              t.auth.login
            )}
          </button>
        </form>
        )}

        <p className="text-center text-gray-400 mt-6">
          {t.auth.noAccount}{' '}
          <Link to="/register" className="text-amber-400 hover:underline">
            {t.auth.register}
          </Link>
        </p>

        <div className="sr-only">
          <p>
              Imperium: juego de estrategia espacial tipo OGame donde generas ingresos gratis vendiendo tus recursos.
            Gana criptomonedas gratis jugando. Play-to-earn gratuito sin inversion.
            Ganar bitcoin, ethereum y USDT jugando. Mejor juego blockchain 2026.
          </p>
          <p>
            Juego crypto gratis | Ganar dinero por internet | Apps para ganar dinero |
            Best free crypto game | Games that pay real money | Earn crypto free
          </p>
        </div>


        </div>
      </div>
    </div>
    </>
  );
}
