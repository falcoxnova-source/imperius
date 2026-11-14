import { useState, useEffect, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { NotificationSystem } from '../ui/NotificationSystem';
import { NetworkStatus } from '../ui/NetworkStatus';
import { AIAssistant } from '../ui/AIAssistant';
import { BroadcastModal } from '../ui/BroadcastModal';
import { AttackCooldownBanner } from '../ui/AttackCooldownBanner';
import { VacationBanner } from '../ui/VacationBanner';
import { ColonySaleLock } from '../ui/ColonySaleLock';
import { OccupationLock } from '../ui/OccupationLock';
import { LoadingScreen } from '../ui/LoadingScreen';
import { TutorialOverlay } from '../tutorial/TutorialOverlay';
import { supabase } from '../../lib/supabase';

export function GameLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const badges = document.querySelectorAll('.grecaptcha-badge');
    badges.forEach(badge => {
      const container = badge.parentElement;
      if (container) container.remove();
      else badge.remove();
    });
    const recaptchaScripts = document.querySelectorAll('script[src*="recaptcha"]');
    recaptchaScripts.forEach(s => s.remove());
  }, []);

  // Heartbeat — marca al usuario como online cada 60s
  useEffect(() => {
    const ping = () => supabase.rpc('heartbeat').then(({ error }) => {
      if (error) console.error('heartbeat error:', error);
    });
    ping();
    const interval = setInterval(ping, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-space-900 overflow-x-clip">
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-[0.07] pointer-events-none z-0"
        style={{ backgroundImage: 'url("/Imagenes/Visuales/xd.webp")' }}
        aria-hidden="true"
      />
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(214,170,85,0.08),transparent_60%)]" aria-hidden="true" />
      <NetworkStatus />
      <div className="flex relative z-10 w-full max-w-full">
        <div
          className={`fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity duration-300 ${
            sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setSidebarOpen(false)}
        />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-h-screen lg:ml-64 min-w-0">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-5 overflow-auto min-w-0">
            <VacationBanner />
            <AttackCooldownBanner />
            <ColonySaleLock>
              <OccupationLock>
                <Suspense fallback={<LoadingScreen />}>
                  <Outlet />
                </Suspense>
              </OccupationLock>
            </ColonySaleLock>
          </main>
        </div>
      </div>
      <NotificationSystem />

      <AIAssistant />
      <BroadcastModal />
      <TutorialOverlay onOpenSidebar={() => setSidebarOpen(true)} />
    </div>
  );
}
