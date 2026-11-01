import { Link } from 'react-router-dom';
import { SEO } from '../../components/ui/SEO';

export function PrivacyPage() {
  return (
    <>
      <SEO
        title="Política de Privacidad | Xnova"
        description="Política de privacidad de Xnova. Cómo recopilamos, usamos y protegemos tus datos personales en nuestro juego de estrategia espacial play-to-earn."
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
            Política de Privacidad
          </h1>
          <div className="text-slate-300 leading-relaxed space-y-6">
            <p><strong className="text-white">Última actualización:</strong> 29 de mayo de 2026</p>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">1. Información que Recopilamos</h2>
              <p>Recopilamos la siguiente información cuando usas Xnova:</p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-slate-400">
                <li><strong className="text-white">Datos de registro:</strong> correo electrónico, nombre de usuario, contraseña (cifrada).</li>
                <li><strong className="text-white">Datos del juego:</strong> actividad, progreso, transacciones, alianzas, comunicaciones en el chat.</li>
                <li><strong className="text-white">Datos técnicos:</strong> dirección IP, tipo de navegador, sistema operativo, páginas visitadas.</li>
                <li><strong className="text-white">Datos de wallet:</strong> dirección de billetera cripto (solo para retiros).</li>
                <li><strong className="text-white">Cookies:</strong> utilizamos cookies para mantener tu sesión y analizar el tráfico (Google Analytics).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">2. Cómo Usamos tu Información</h2>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>Operar y mantener el juego y tu cuenta.</li>
                <li>Procesar retiros de tokens TUNG.</li>
                <li>Enviar notificaciones importantes sobre el servicio.</li>
                <li>Mejorar la experiencia de juego y detectar trampas.</li>
                <li>Cumplir con obligaciones legales y prevenir fraudes.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">3. Google Analytics</h2>
              <p>Utilizamos Google Analytics (ID: G-P3ES38PVG2) para analizar el tráfico y comportamiento de los usuarios. Google puede usar cookies para recopilar datos anónimos. Puedes optar por no participar usando el complemento de inhabilitación de Google Analytics.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">4. Almacenamiento y Seguridad</h2>
              <p>Tus datos se almacenan en servidores seguros de Supabase (PostgreSQL) con cifrado en tránsito y en reposo. Implementamos medidas de seguridad como autenticación de dos factores y monitoreo continuo.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">5. Compartición de Datos</h2>
              <p>No vendemos tus datos personales. Compartimos información solo cuando sea necesario para operar el servicio (proveedores de hosting, blockchain para transacciones) o cuando la ley lo requiera.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">6. Tus Derechos</h2>
              <p>Tienes derecho a acceder, corregir, eliminar tus datos y exportarlos. Puedes solicitar la eliminación de tu cuenta en cualquier momento contactando a <span className="text-cyan-400">support@falcoxnova.com</span>.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">7. Retención de Datos</h2>
              <p>Conservamos tus datos mientras mantengas tu cuenta activa. Después de eliminar tu cuenta, podemos retener ciertos datos por hasta 90 días por obligaciones legales.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">8. Cookies</h2>
              <p>Usamos cookies esenciales para el funcionamiento del juego y cookies analíticas (Google Analytics). Puedes configurar tu navegador para rechazar cookies, aunque algunas funciones podrían no funcionar correctamente.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">9. Cambios en esta Política</h2>
              <p>Actualizaremos esta política cuando sea necesario. Te notificaremos de cambios significativos a través del sitio web o correo electrónico.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">10. Contacto</h2>
              <p>Para cualquier consulta sobre privacidad: <span className="text-cyan-400">support@falcoxnova.com</span></p>
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
              <Link to="/terms" className="hover:text-cyan-400">Términos</Link>
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
