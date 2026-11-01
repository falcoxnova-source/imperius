import { Link } from 'react-router-dom';
import { SEO } from '../../components/ui/SEO';

export function TermsPage() {
  return (
    <>
      <SEO
        title="Términos y Condiciones | Xnova"
        description="Términos y condiciones de uso de Xnova, el juego de estrategia espacial play-to-earn. Lee nuestras políticas antes de jugar."
        noIndex
      />

      <div className="min-h-screen bg-[#0a0e17] text-white font-['Rajdhani']">
        <nav className="sticky top-0 z-50 bg-[#0a0e17]/90 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center gap-3">
                <img src="/navbar-logo.png" alt="Xnova" className="h-10 w-10 object-contain" />
                <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent" style={{ fontFamily: 'Orbitron, sans-serif' }}>XNOVA</span>
              </Link>
              <Link to="/register" className="px-5 py-2 text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all">Regístrate</Link>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h1 className="text-3xl sm:text-4xl font-bold mb-8" style={{ fontFamily: 'Orbitron, sans-serif' }}>
            Términos y Condiciones
          </h1>
          <div className="text-slate-300 leading-relaxed space-y-6">
            <p><strong className="text-white">Última actualización:</strong> 29 de mayo de 2026</p>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">1. Aceptación de los Términos</h2>
              <p>Al acceder y utilizar Xnova (falcoxnova.com), aceptas cumplir con estos términos y condiciones. Si no estás de acuerdo, no utilices el servicio.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">2. Descripción del Servicio</h2>
              <p>Xnova es un juego de estrategia espacial multijugador masivo en línea (MMORTS) con mecánicas play-to-earn. Los jugadores construyen imperios, forman alianzas y compiten por recursos mientras ganan tokens TUNG como recompensa por su actividad en el juego.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">3. Elegibilidad</h2>
              <p>Debes tener al menos 13 años para usar Xnova. Si eres menor de edad, necesitas consentimiento parental. No está permitido el uso por parte de personas en jurisdicciones donde las criptomonedas estén prohibidas.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">4. Cuentas de Usuario</h2>
              <p>Eres responsable de mantener la confidencialidad de tu cuenta y contraseña. No puedes compartir tu cuenta, usar bots, scripts automatizados ni cualquier forma de trampa que proporcione ventajas injustas.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">5. Tokens TUNG y Criptomonedas</h2>
              <p>Los tokens TUNG se ganan mediante la actividad en el juego. El valor de los tokens puede fluctuar. Xnova no garantiza un valor mínimo ni la convertibilidad a dinero fiduciario. Los retiros están sujetos a límites y verificación de seguridad.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">6. Propiedad Intelectual</h2>
              <p>Todo el contenido de Xnova, incluyendo código, gráficos, diseños y marcas, es propiedad de Xnova Studios. No está permitida la reproducción, distribución o modificación sin autorización expresa.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">7. Limitación de Responsabilidad</h2>
              <p>Xnova se proporciona "tal cual". No garantizamos disponibilidad continua, ausencia de errores ni la precisión de las recompensas. No somos responsables por pérdidas derivadas del uso del servicio, incluyendo pérdidas de criptomonedas.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">8. Modificaciones</h2>
              <p>Podemos modificar estos términos en cualquier momento. Los cambios serán notificados en el sitio web. El uso continuado después de los cambios constituye aceptación.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">9. Contacto</h2>
              <p>Para consultas sobre estos términos, contáctanos en: <span className="text-cyan-400">support@falcoxnova.com</span></p>
            </section>
          </div>
        </div>

        <footer className="py-8 border-t border-white/5 text-center">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-500 mb-4">
              <Link to="/" className="hover:text-cyan-400">Inicio</Link>
              <span>·</span>
              <Link to="/about" className="hover:text-cyan-400">Sobre Nosotros</Link>
              <span>·</span>
              <Link to="/privacy" className="hover:text-cyan-400">Privacidad</Link>
              <span>·</span>
              <Link to="/blog" className="hover:text-cyan-400">Blog</Link>
            </div>
            <p className="text-xs text-slate-600">© {new Date().getFullYear()} Xnova. Todos los derechos reservados.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
