import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';
import { LanguageSelector } from '../../components/ui/LanguageSelector';
import { SEO } from '../../components/ui/SEO';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const { verifyEmailToken, error } = useAuthStore();
  const { t } = useI18n();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    // Evita ejecutar la verificacion mas de una vez (el token es de un solo uso).
    if (startedRef.current) return;
    startedRef.current = true;

    const verify = async () => {
      const success = await verifyEmailToken(token);
      setStatus(success ? 'success' : 'error');
    };

    verify();
  }, [token, verifyEmailToken]);

  // Al verificar correctamente, llevar al login automaticamente.
  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(() => navigate('/login', { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [status, navigate]);


  return (
    <>
      <SEO
        title="Verificar Email | Xnova"
        description="Verifica tu dirección de correo electrónico para activar tu cuenta de Xnova y empezar a jugar."
        noIndex
      />
      <div className="min-h-screen flex items-center justify-center p-4 bg-auth bg-cover bg-center bg-no-repeat">
      <div className="absolute inset-0 bg-black/40" />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>

      <div className="card-glass w-full max-w-md p-8 relative z-10">
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-2">
            <div className="absolute inset-0 bg-cyber-blue/10 rounded-full blur-[60px] animate-pulse scale-150" />
              <img src="/Imagenes/Visuales/main_city.webp" alt="Imperium" className="w-28 h-28 object-cover rounded-full bg-stone-950 ring-4 ring-amber-500/60 relative z-10 shadow-[0_0_30px_rgba(245,158,11,0.4)]" draggable={false} />
          </div>
        </div>

        {status === 'loading' && (
          <div className="text-center py-8">
            <Loader2 className="w-16 h-16 text-cyber-blue mx-auto mb-4 animate-spin" />
            <p className="text-gray-400">{t.common.loading}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-cyber-green mx-auto mb-4" />
            <h2 className="font-orbitron text-xl text-white mb-2">Email Verificado</h2>
            <p className="text-gray-400 mb-6">
              Tu cuenta ha sido activada exitosamente. Te llevaremos al inicio de sesion...
            </p>
            <Link to="/login" className="btn-cyber inline-block">
              {t.auth.login}
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-cyber-red mx-auto mb-4" />
            <h2 className="font-orbitron text-xl text-white mb-2">Error de Verificacion</h2>
            <p className="text-gray-400 mb-6">
              {error || 'El enlace de verificacion es invalido o ha expirado. Por favor solicita uno nuevo.'}
            </p>
            <Link to="/login" className="btn-cyber inline-block">
              {t.auth.backToLogin}
            </Link>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
