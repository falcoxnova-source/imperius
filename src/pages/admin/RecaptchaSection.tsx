import { useState, useEffect } from 'react';
import { useAdminStore } from '../../store/adminStore';
import {
  Shield,
  Save,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

export function RecaptchaSection() {
  const {
    recaptchaSettings,
    isLoading,
    fetchRecaptchaSettings,
    updateRecaptchaSettings,
  } = useAdminStore();

  const [siteKey, setSiteKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [minScore, setMinScore] = useState(0.5);
  const [showSecret, setShowSecret] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchRecaptchaSettings();
  }, [fetchRecaptchaSettings]);

  useEffect(() => {
    if (recaptchaSettings) {
      setSiteKey(recaptchaSettings.site_key);
      setSecretKey(recaptchaSettings.secret_key);
      setEnabled(recaptchaSettings.enabled);
      setMinScore(recaptchaSettings.min_score);
    }
  }, [recaptchaSettings]);

  const handleSave = async () => {
    setMessage(null);

    if (enabled && (!siteKey.trim() || !secretKey.trim())) {
      setMessage({ type: 'error', text: 'Debes configurar ambas claves antes de activar reCAPTCHA' });
      return;
    }

    const result = await updateRecaptchaSettings({
      site_key: siteKey.trim(),
      secret_key: secretKey.trim(),
      enabled,
      min_score: minScore,
    });

    if (result.success) {
      setMessage({ type: 'success', text: 'Configuracion de reCAPTCHA guardada correctamente' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Error al guardar' });
    }

    setTimeout(() => setMessage(null), 5000);
  };

  const hasKeys = siteKey.trim().length > 0 && secretKey.trim().length > 0;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Google reCAPTCHA</h2>
            <p className="text-sm text-slate-400">Proteccion anti-bots en formularios de login y registro</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (!hasKeys && !enabled) {
              setMessage({ type: 'error', text: 'Configura las claves primero' });
              setTimeout(() => setMessage(null), 3000);
              return;
            }
            setEnabled(!enabled);
          }}
          className="flex items-center gap-2"
        >
          {enabled ? (
            <ToggleRight className="w-10 h-10 text-emerald-400" />
          ) : (
            <ToggleLeft className="w-10 h-10 text-slate-500" />
          )}
          <span className={`text-sm font-medium ${enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
            {enabled ? 'Activo' : 'Inactivo'}
          </span>
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Como configurar:</h3>
        <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
          <li>
            Ve a{' '}
            <a
              href="https://www.google.com/recaptcha/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              Google reCAPTCHA Admin Console
              <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>Crea un nuevo sitio seleccionando <span className="text-white font-medium">reCAPTCHA v3</span></li>
          <li>Agrega el dominio de tu aplicacion</li>
          <li>Copia la <span className="text-white font-medium">Clave del sitio</span> y la <span className="text-white font-medium">Clave secreta</span></li>
          <li>Pegalas aqui abajo y guarda</li>
        </ol>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-emerald-500/20 border border-emerald-500/50'
            : 'bg-red-500/20 border border-red-500/50'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          )}
          <p className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Clave del Sitio (Site Key)
          </label>
          <input
            type="text"
            value={siteKey}
            onChange={(e) => setSiteKey(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono text-sm"
            placeholder="6Lc..."
          />
          <p className="text-xs text-slate-500 mt-1">Clave publica que se usa en el frontend</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Clave Secreta (Secret Key)
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono text-sm"
              placeholder="6Lc..."
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
            >
              {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">Clave privada que se usa en el servidor para verificar</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Puntuacion Minima (reCAPTCHA v3)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minScore}
              onChange={(e) => setMinScore(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-white font-mono text-lg w-12 text-center">{minScore.toFixed(1)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1 px-1">
            <span>0.0 (Todos pasan)</span>
            <span>0.5 (Recomendado)</span>
            <span>1.0 (Bloquea a todos)</span>
          </div>
          {minScore > 0.7 && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-amber-900/30 border border-amber-700/50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-400">
                Score mayor a 0.7 puede bloquear usuarios reales. Google reCAPTCHA v3 raramente da score de 1.0 incluso a humanos.
              </p>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            Google recomienda 0.5 para la mayoria de sitios. Score tipico de un humano real: 0.7-0.9.
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${
          enabled && hasKeys
            ? 'bg-emerald-900/20 border-emerald-700/50'
            : !hasKeys
            ? 'bg-amber-900/20 border-amber-700/50'
            : 'bg-slate-900/30 border-slate-700/30'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
              enabled && hasKeys ? 'bg-emerald-400 animate-pulse' : !hasKeys ? 'bg-amber-400' : 'bg-slate-500'
            }`} />
            <div>
              <p className={`text-sm font-medium ${
                enabled && hasKeys ? 'text-emerald-400' : !hasKeys ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {enabled && hasKeys
                  ? 'reCAPTCHA esta activo y protegiendo los formularios de autenticacion'
                  : !hasKeys
                  ? 'Configura ambas claves para poder activar la proteccion'
                  : 'reCAPTCHA esta configurado pero desactivado'}
              </p>
              {enabled && hasKeys && (
                <p className="text-xs text-slate-500 mt-1">
                  Se verificara en: Login, Registro
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
        >
          <Save className="w-5 h-5" />
          {isLoading ? 'Guardando...' : 'Guardar Configuracion'}
        </button>
      </div>
    </div>
  );
}
