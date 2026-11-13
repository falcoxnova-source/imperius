import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';
import { LanguageSelector } from '../../components/ui/LanguageSelector';
import { SEO } from '../../components/ui/SEO';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const { updatePasswordWithToken, isLoading, error, clearError } = useAuthStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!token) {
      return;
    }

    if (password !== confirmPassword) {
      return;
    }

    if (password.length < 6) {
      return;
    }

    try {
      await updatePasswordWithToken(token, password);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch {
    }
  };

  if (!token) {
    return (
      <>
      <SEO title="Enlace Inválido | Imperium" description="El enlace para restablecer tu contraseña no es válido o ha expirado." noIndex />
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat">
        <div className="absolute inset-0 bg-black/40" />
        <div className="card-glass w-full max-w-md p-8 text-center relative z-10">
          <AlertCircle className="w-16 h-16 text-cyber-red mx-auto mb-4" />
          <h2 className="font-orbitron text-xl text-white mb-4">Link Invalido</h2>
          <p className="text-gray-400 mb-6">
            El enlace de recuperacion es invalido. Por favor solicita uno nuevo.
          </p>
          <Link to="/forgot-password" className="btn-cyber inline-block">
            Solicitar Nuevo Enlace
          </Link>
        </div>
      </div>
    </>
    );
  }

  if (success) {
    return (
      <>
      <SEO title="Contraseña Actualizada | Imperium" description="Tu contraseña ha sido actualizada correctamente. Ya puedes iniciar sesión." noIndex />
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat">
        <div className="absolute inset-0 bg-black/40" />

        <div className="absolute top-4 right-4 z-10">
          <LanguageSelector />
        </div>

        <div className="card-glass w-full max-w-md p-8 relative z-10">
          <div className="flex flex-col items-center mb-6">
            <CheckCircle className="w-16 h-16 text-cyber-green mb-4" />
            <h2 className="font-orbitron text-2xl text-white text-center">
              {t.auth.passwordUpdated}
            </h2>
          </div>

          <p className="text-gray-400 text-center mb-6">
            {t.auth.passwordUpdatedDescription}
          </p>

          <Link to="/login" className="btn-cyber w-full inline-block text-center">
            {t.auth.login}
          </Link>
        </div>
      </div>
    </>
    );
  }

  return (
    <>
      <SEO
        title="Restablecer Contraseña | Imperium"
        description="Elige una nueva contraseña para tu cuenta de Imperium. Asegúrate de que sea segura y fácil de recordar."
        noIndex
      />
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat">
      <div className="absolute inset-0 bg-black/40" />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>

      <div className="card-glass w-full max-w-md p-8 relative">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-2">
            <div className="absolute inset-0 bg-cyber-blue/10 rounded-full blur-[60px] animate-pulse scale-150" />
              <img src="/Imagenes/Visuales/main_city.webp" alt="Imperium" className="w-28 h-28 object-cover rounded-full bg-stone-950 ring-4 ring-amber-500/60 relative z-10 shadow-[0_0_30px_rgba(245,158,11,0.4)]" draggable={false} />
          </div>
          <h1 className="font-orbitron text-2xl text-white glow-text">
            {t.auth.newPasswordTitle}
          </h1>
          <p className="text-gray-400 mt-2 text-center">
            {t.auth.newPasswordSubtitle}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-cyber-red flex-shrink-0" />
            <p className="text-cyber-red text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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
            disabled={isLoading || password !== confirmPassword || password.length < 6}
            className="btn-cyber w-full"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.common.loading}
              </span>
            ) : (
              t.auth.setNewPassword
            )}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-6">
          <Link to="/login" className="text-cyber-blue hover:underline">
            {t.auth.backToLogin}
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}
