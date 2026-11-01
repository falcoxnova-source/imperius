import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';
import { LanguageSelector } from '../../components/ui/LanguageSelector';
import { SEO } from '../../components/ui/SEO';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const { sendPasswordResetEmail, isLoading, error, clearError } = useAuthStore();
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await sendPasswordResetEmail(email);
      setSuccess(true);
    } catch {
    }
  };

  if (success) {
    return (
      <>
      <SEO title="Correo Enviado | Xnova" description="Revisa tu bandeja de entrada para restablecer tu contraseña de Xnova." noIndex />
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat">
        <div className="absolute inset-0 bg-black/40" />

        <div className="absolute top-4 right-4 z-10">
          <LanguageSelector />
        </div>

        <div className="card-glass w-full max-w-md p-8 relative z-10">
          <div className="flex flex-col items-center mb-6">
            <CheckCircle className="w-16 h-16 text-cyber-green mb-4" />
            <h2 className="font-orbitron text-2xl text-white text-center">
              {t.auth.emailSent}
            </h2>
          </div>

          <p className="text-gray-400 text-center mb-8">
            {t.auth.emailSentDescription}
          </p>

          <Link
            to="/login"
            className="btn-cyber w-full flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t.auth.backToLogin}
          </Link>
        </div>
      </div>
    </>
    );
  }

  return (
    <>
      <SEO
        title="Recuperar Contraseña | Xnova"
        description="¿Olvidaste tu contraseña de Xnova? Ingresa tu email y te enviaremos un enlace para restablecerla."
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
            {t.auth.forgotPasswordTitle}
          </h1>
          <p className="text-gray-400 mt-2 text-center">
            {t.auth.forgotPasswordSubtitle}
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
              t.auth.sendResetEmail
            )}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-6">
          <Link to="/login" className="text-cyber-blue hover:underline flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t.auth.backToLogin}
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}
