import { useEffect, useState, useRef, useCallback, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import { useAdminStore } from './store/adminStore';
import { I18nProvider } from './lib/i18n/I18nProvider';
import { useI18n } from './lib/i18n';
import { startIdleLogout } from './lib/idleLogout';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { GameLayout } from './components/layout/GameLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';

// Lazy loaded game pages (code-split for performance)
const OverviewPage = lazy(() => import('./pages/game/OverviewPage').then(m => ({ default: m.OverviewPage })));
const BuildingsPage = lazy(() => import('./pages/game/BuildingsPage').then(m => ({ default: m.BuildingsPage })));
const ResourcesPage = lazy(() => import('./pages/game/ResourcesPage').then(m => ({ default: m.ResourcesPage })));
const ResearchPage = lazy(() => import('./pages/game/ResearchPage').then(m => ({ default: m.ResearchPage })));
const ShipyardPage = lazy(() => import('./pages/game/ShipyardPage').then(m => ({ default: m.ShipyardPage })));
const DefensePage = lazy(() => import('./pages/game/DefensePage').then(m => ({ default: m.DefensePage })));
const FleetPage = lazy(() => import('./pages/game/FleetPage').then(m => ({ default: m.FleetPage })));
const GalaxyPage = lazy(() => import('./pages/game/GalaxyPage').then(m => ({ default: m.GalaxyPage })));
const AlliancePage = lazy(() => import('./pages/game/AlliancePage').then(m => ({ default: m.AlliancePage })));
const FortressPage = lazy(() => import('./pages/game/FortressPage').then(m => ({ default: m.FortressPage })));
const TreasurePlanetPage = lazy(() => import('./pages/game/TreasurePlanetPage').then(m => ({ default: m.TreasurePlanetPage })));
const RankingPage = lazy(() => import('./pages/game/RankingPage').then(m => ({ default: m.RankingPage })));
const MessagesPage = lazy(() => import('./pages/game/MessagesPage').then(m => ({ default: m.MessagesPage })));
const ChatPage = lazy(() => import('./pages/game/ChatPage').then(m => ({ default: m.ChatPage })));
const OfficersPage = lazy(() => import('./pages/game/OfficersPage').then(m => ({ default: m.OfficersPage })));
const SettingsPage = lazy(() => import('./pages/game/SettingsPage').then(m => ({ default: m.SettingsPage })));
const RequirementsPage = lazy(() => import('./pages/game/RequirementsPage').then(m => ({ default: m.RequirementsPage })));
const MarketPage = lazy(() => import('./pages/game/MarketPage').then(m => ({ default: m.MarketPage })));
const ReferralPage = lazy(() => import('./pages/game/ReferralPage').then(m => ({ default: m.ReferralPage })));
const WalletPage = lazy(() => import('./pages/game/WalletPage').then(m => ({ default: m.WalletPage })));
const TasksPage = lazy(() => import('./pages/game/TasksPage').then(m => ({ default: m.TasksPage })));
const DailyMissionsPage = lazy(() => import('./pages/game/DailyMissionsPage').then(m => ({ default: m.DailyMissionsPage })));
const PremiumMissionsPage = lazy(() => import('./pages/game/PremiumMissionsPage').then(m => ({ default: m.PremiumMissionsPage })));
const HeroShipPage = lazy(() => import('./pages/game/HeroShipPage').then(m => ({ default: m.HeroShipPage })));
const CasinoPage = lazy(() => import('./pages/game/CasinoPage').then(m => ({ default: m.CasinoPage })));
const RoulettePage = lazy(() => import('./pages/game/RoulettePage').then(m => ({ default: m.RoulettePage })));
const SlotsPage = lazy(() => import('./pages/game/SlotsPage').then(m => ({ default: m.SlotsPage })));
const DicePage = lazy(() => import('./pages/game/DicePage').then(m => ({ default: m.DicePage })));
const BattleshipPage = lazy(() => import('./pages/game/BattleshipPage').then(m => ({ default: m.BattleshipPage })));
const SportsBettingPage = lazy(() => import('./pages/game/SportsBettingPage').then(m => ({ default: m.SportsBettingPage })));
const HallOfFamePage = lazy(() => import('./pages/game/HallOfFamePage').then(m => ({ default: m.HallOfFamePage })));
const OccupationsPage = lazy(() => import('./pages/game/OccupationsPage').then(m => ({ default: m.OccupationsPage })));
const RecordsPage = lazy(() => import('./pages/game/RecordsPage').then(m => ({ default: m.RecordsPage })));
const TopBattlesPage = lazy(() => import('./pages/game/TopBattlesPage').then(m => ({ default: m.TopBattlesPage })));
const CombatSimulatorPage = lazy(() => import('./pages/game/CombatSimulatorPage').then(m => ({ default: m.CombatSimulatorPage })));
const VipPage = lazy(() => import('./pages/game/VipPage').then(m => ({ default: m.VipPage })));
const LotteryPage = lazy(() => import('./pages/game/LotteryPage').then(m => ({ default: m.LotteryPage })));
const RafflePage = lazy(() => import('./pages/game/RafflePage').then(m => ({ default: m.RafflePage })));
const P2PPage = lazy(() => import('./pages/game/P2PPage').then(m => ({ default: m.P2PPage })));
const KYCPage = lazy(() => import('./pages/game/KYCPage').then(m => ({ default: m.KYCPage })));
const ForumPage = lazy(() => import('./pages/game/ForumPage').then(m => ({ default: m.ForumPage })));
const AllianceWarsPage = lazy(() => import('./pages/game/AllianceWarsPage').then(m => ({ default: m.AllianceWarsPage })));
const CosmeticsPage = lazy(() => import('./pages/game/CosmeticsPage').then(m => ({ default: m.CosmeticsPage })));
const AdminPage = lazy(() => import('./pages/admin/AdminPage').then(m => ({ default: m.AdminPage })));
import { LandingPage } from './pages/public/LandingPage';
import { BlogPage } from './pages/public/BlogPage';
import { BlogArticlePage } from './pages/public/BlogArticlePage';
import { AboutPage } from './pages/public/AboutPage';
import { RoadmapPage } from './pages/public/RoadmapPage';
import { TermsPage } from './pages/public/TermsPage';
import { PrivacyPage } from './pages/public/PrivacyPage';
import { NotFoundPage } from './pages/public/NotFoundPage';
import {
  GanarCriptomonedasPage,
  JuegosPlayToEarnPage,
  AlternativaOGamePage,
  GanarDineroJugandoPage,
  CincoPasosPage,
  GenerarIngresosGratisPage,
  VenderRecursosPage,
} from './pages/public/SEOLandingPages';
import { COUNTRY_LANDINGS, CountryLandingPage } from './pages/public/CountryLandingPages';
import {
  healthCheck,
  waitForConnection,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
} from './lib/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Navigate to="/game" replace />;
  }

  return <>{children}</>;
}

type LoadingPhase =
  | 'checking_connection'
  | 'waiting_server'
  | 'loading_profile'
  | 'loading_config'
  | 'loading_planets'
  | 'loading_game_data'
  | 'complete'
  | 'error';

interface LoadingState {
  phase: LoadingPhase;
  message: string;
  progress: number;
  retryCount: number;
}

function ConnectionRecoveryScreen({
  state,
  onRetry,
  onLogout
}: {
  state: LoadingState;
  onRetry: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const circuitStatus = getCircuitBreakerStatus();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            {state.phase === 'waiting_server' ? (
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {state.phase === 'waiting_server' ? t.app.connectingToServer : t.app.connectionProblem}
          </h2>
          <p className="text-slate-400 text-sm mb-4">{state.message}</p>

          {state.retryCount > 0 && (
            <p className="text-slate-500 text-xs mb-4">
              {t.app.reconnectionAttempts}: {state.retryCount}
            </p>
          )}

          {circuitStatus.isOpen && (
            <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-3 mb-4">
              <p className="text-amber-400 text-sm">
                {t.app.serverHighLoad}
                {t.app.retryingIn} {Math.ceil(circuitStatus.nextRetryIn / 1000)}s...
              </p>
            </div>
          )}
        </div>

        <div className="w-full bg-slate-700 rounded-full h-2 mb-6">
          <div
            className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${state.progress}%` }}
          />
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={onRetry}
            className="px-6 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors"
          >
            {t.app.retry}
          </button>
          <button
            onClick={onLogout}
            className="px-6 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
          >
            {t.app.logout}
          </button>
        </div>
      </div>
    </div>
  );
}

function GameInitializer({ children }: { children: React.ReactNode }) {
  const { user, profile, fetchProfile, signOut, refreshProfile } = useAuthStore();
  const {
    fetchPlanets,
    fetchBuildingTypes,
    fetchTechnologyTypes,
    fetchShipTypes,
    fetchDefenseTypes,
    fetchFleets,
    fetchTechnologies,
    fetchResources,
    fetchBuildings,
    fetchBuildingQueue,
    fetchShips,
    fetchDefenses,
    fetchShipyardQueue,
    refreshOfficers,
    updateResources,
    saveResourcesToDatabase,
    checkBuildingCompletion,
    checkShipyardCompletion,
    checkResearchCompletion,
    checkFleetArrivals,
    fullReconnectSync,
  } = useGameStore();
  const { fetchSpeeds, checkAdminStatus } = useAdminStore();
  const { t } = useI18n();

  const [loadingState, setLoadingState] = useState<LoadingState>({
    phase: 'checking_connection',
    message: t.app.verifyingConnection,
    progress: 0,
    retryCount: 0,
  });
  const [initialized, setInitialized] = useState(false);
  const initAttemptRef = useRef(0);

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const updateLoadingState = useCallback((phase: LoadingPhase, message: string, progress: number) => {
    setLoadingState(prev => ({ ...prev, phase, message, progress }));
  }, []);

  const loadWithRetry = useCallback(async <T,>(
    fn: () => Promise<T>,
    maxRetries = 3
  ): Promise<T | null> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    return null;
  }, []);

  const initGame = useCallback(async () => {
    if (!user) return;

    initAttemptRef.current++;
    const currentAttempt = initAttemptRef.current;

    try {
      updateLoadingState('checking_connection', t.app.verifyingServerConnection, 5);

      const health = await healthCheck();
      if (!health.healthy) {
        updateLoadingState('waiting_server', t.app.serverStarting, 10);
        setLoadingState(prev => ({ ...prev, retryCount: prev.retryCount + 1 }));

        const connected = await waitForConnection(45000);
        if (!connected) {
          updateLoadingState('error', t.app.couldNotConnect, 0);
          return;
        }
      }

      if (currentAttempt !== initAttemptRef.current) return;
      resetCircuitBreaker();

      updateLoadingState('loading_profile', t.app.loadingProfile, 20);

      if (!profile) {
        await loadWithRetry(() => fetchProfile());
        await new Promise(resolve => setTimeout(resolve, 300));

        const currentProfile = useAuthStore.getState().profile;
        if (!currentProfile) {
          updateLoadingState('error', t.app.couldNotLoadProfile, 0);
          return;
        }
      }

      if (currentAttempt !== initAttemptRef.current) return;

      updateLoadingState('loading_config', t.app.loadingGameConfig, 30);
      await loadWithRetry(() => fetchSpeeds());
      await loadWithRetry(() => checkAdminStatus());

      if (currentAttempt !== initAttemptRef.current) return;

      updateLoadingState('loading_planets', t.app.loadingPlanetsFleets, 45);
      await Promise.all([
        loadWithRetry(() => fetchPlanets(user.id)),
        loadWithRetry(() => fetchFleets(user.id)),
      ]);

      if (currentAttempt !== initAttemptRef.current) return;

      updateLoadingState('loading_game_data', t.app.loadingGameData, 60);

      const batch1 = await Promise.allSettled([
        loadWithRetry(() => fetchBuildingTypes()),
        loadWithRetry(() => fetchTechnologyTypes()),
      ]);

      if (currentAttempt !== initAttemptRef.current) return;
      updateLoadingState('loading_game_data', t.app.loadingShipsDefenses, 75);

      const batch2 = await Promise.allSettled([
        loadWithRetry(() => fetchShipTypes()),
        loadWithRetry(() => fetchDefenseTypes()),
      ]);

      if (currentAttempt !== initAttemptRef.current) return;
      updateLoadingState('loading_game_data', t.app.loadingResearchOfficers, 90);

      const batch3 = await Promise.allSettled([
        loadWithRetry(() => fetchTechnologies(user.id)),
        loadWithRetry(() => refreshOfficers(user.id)),
      ]);

      const allResults = [...batch1, ...batch2, ...batch3];
      const failedCount = allResults.filter(r => r.status === 'rejected').length;

      if (failedCount > 2) {
        console.warn(`${failedCount} game data loads failed, but continuing with partial data`);
      }

      if (currentAttempt !== initAttemptRef.current) return;

      updateLoadingState('complete', t.app.loadComplete, 100);
      setInitialized(true);

    } catch (err) {
      console.error('Error initializing game:', err);
      updateLoadingState(
        'error',
        t.app.errorLoadingGame,
        0
      );
    }
  }, [
    user,
    profile,
    fetchProfile,
    fetchPlanets,
    fetchBuildingTypes,
    fetchTechnologyTypes,
    fetchShipTypes,
    fetchDefenseTypes,
    fetchFleets,
    fetchTechnologies,
    refreshOfficers,
    fetchSpeeds,
    checkAdminStatus,
    updateLoadingState,
    loadWithRetry,
  ]);

  const handleRetry = useCallback(() => {
    resetCircuitBreaker();
    setLoadingState({
      phase: 'checking_connection',
      message: t.app.retryingConnection,
      progress: 0,
      retryCount: loadingState.retryCount,
    });
    initGame();
  }, [initGame, loadingState.retryCount, t]);

  useEffect(() => {
    if (!user || initialized) return;
    initGame();
  }, [user, initialized, initGame]);

  // [IDLE10] Cierre de sesion tras 10 min sin actividad del jugador
  useEffect(() => {
    if (!user) return;
    return startIdleLogout();
  }, [user]);

  useEffect(() => {
    if (!initialized || !user) return;

    let isVisible = document.visibilityState === 'visible';
    let isOnline = navigator.onLine;
    let networkErrorCount = 0;
    const MAX_NETWORK_ERRORS = 3;
    const NETWORK_ERROR_RESET_MS = 30000;
    let networkErrorResetTimer: ReturnType<typeof setTimeout> | null = null;

    let resourceTickId: ReturnType<typeof setInterval>;
    let smartCheckId: ReturnType<typeof setInterval>;
    let fleetCheckId: ReturnType<typeof setInterval>;
    let saveId: ReturnType<typeof setInterval>;
    let syncId: ReturnType<typeof setInterval>;

    let lastBuildingCheck = 0;
    let lastShipyardCheck = 0;
    let lastResearchCheck = 0;

    const resetNetworkErrors = () => {
      networkErrorCount = 0;
    };

    const handleNetworkError = () => {
      networkErrorCount++;
      if (networkErrorResetTimer) clearTimeout(networkErrorResetTimer);
      networkErrorResetTimer = setTimeout(resetNetworkErrors, NETWORK_ERROR_RESET_MS);
    };

    const shouldSkipNetworkCall = () => {
      const circuitStatus = getCircuitBreakerStatus();
      return !isOnline || !isVisible || networkErrorCount >= MAX_NETWORK_ERRORS || circuitStatus.isOpen;
    };

    const getNextCompletionTime = (queue: Array<{ end_time?: string | null; current_unit_end_time?: string | null }>, timeField: 'end_time' | 'current_unit_end_time') => {
      const now = Date.now();
      let nearest = Infinity;
      for (const item of queue) {
        const time = item[timeField];
        if (time) {
          const remaining = new Date(time).getTime() - now;
          if (remaining > 0 && remaining < nearest) {
            nearest = remaining;
          }
        }
      }
      return nearest === Infinity ? null : nearest;
    };

    resourceTickId = setInterval(() => {
      if (!isVisible) return;
      updateResources();
    }, 1000);

    smartCheckId = setInterval(async () => {
      if (shouldSkipNetworkCall()) return;

      const now = Date.now();
      const state = useGameStore.getState();
      const { buildingQueue, shipyardQueue, technologies } = state;

      const TOLERANCE_MS = 3000;
      const MIN_CHECK_INTERVAL = 5000;

      const hasExpiredBuilding = buildingQueue.some(q =>
        q.end_time && new Date(q.end_time).getTime() <= now
      );
      const nextBuildingCompletion = getNextCompletionTime(buildingQueue, 'end_time');
      const needsBuildingCheck = buildingQueue.length > 0 && (
        hasExpiredBuilding ||
        (nextBuildingCompletion !== null && nextBuildingCompletion <= TOLERANCE_MS) ||
        buildingQueue.some(q => q.queue_position === 1 && !q.end_time)
      );

      if (needsBuildingCheck && (now - lastBuildingCheck) >= MIN_CHECK_INTERVAL) {
        try {
          await checkBuildingCompletion();
          lastBuildingCheck = now;
          resetNetworkErrors();
        } catch {
          handleNetworkError();
        }
      }

      const hasExpiredShipyard = shipyardQueue.some(q =>
        q.current_unit_end_time && new Date(q.current_unit_end_time).getTime() <= now
      );
      const hasStuckShipyard = shipyardQueue.some(q =>
        q.queue_position === 1 && !q.current_unit_end_time
      );
      const nextShipyardCompletion = getNextCompletionTime(shipyardQueue, 'current_unit_end_time');
      const needsShipyardCheck = shipyardQueue.length > 0 && (
        hasExpiredShipyard ||
        hasStuckShipyard ||
        (nextShipyardCompletion !== null && nextShipyardCompletion <= TOLERANCE_MS)
      );

      if (needsShipyardCheck && (now - lastShipyardCheck) >= MIN_CHECK_INTERVAL) {
        try {
          await checkShipyardCompletion();
          lastShipyardCheck = now;
          resetNetworkErrors();
        } catch {
          handleNetworkError();
        }
      }

      const activeResearch = technologies.find(t => t.is_researching);
      if (activeResearch && activeResearch.research_end_time) {
        const researchRemaining = new Date(activeResearch.research_end_time).getTime() - now;
        if (researchRemaining <= TOLERANCE_MS && (now - lastResearchCheck) >= MIN_CHECK_INTERVAL) {
          try {
            await checkResearchCompletion(user.id);
            lastResearchCheck = now;
            resetNetworkErrors();
          } catch {
            handleNetworkError();
          }
        }
      }

    }, 3000);

    fleetCheckId = setInterval(async () => {
      if (shouldSkipNetworkCall()) return;
      const { fleets } = useGameStore.getState();
      if (fleets.length === 0) return;

      const now = Date.now();
      const TOLERANCE_MS = 5000;
      const hasArrivingOrExpiredFleet = fleets.some(f => {
        if (!f.arrival_time) return false;
        const arrivalTime = new Date(f.arrival_time).getTime();
        return arrivalTime <= now + TOLERANCE_MS;
      });

      if (!hasArrivingOrExpiredFleet) return;

      try {
        await checkFleetArrivals(user.id, refreshProfile);
        resetNetworkErrors();
      } catch {
        handleNetworkError();
      }
    }, 5000);

    saveId = setInterval(() => {
      if (!isOnline) return;
      const state = useGameStore.getState();
      const timeSinceLastSync = Date.now() - state.lastServerSync.getTime();
      if (timeSinceLastSync >= 55000) {
        saveResourcesToDatabase();
      }
    }, 60000);

    syncId = setInterval(async () => {
      if (shouldSkipNetworkCall()) return;
      const state = useGameStore.getState();
      const planet = state.currentPlanet;
      if (!planet) return;

      const timeSinceLastSync = Date.now() - state.lastServerSync.getTime();
      if (timeSinceLastSync < 25000) return;

      try {
        await fetchResources(planet.id);
        resetNetworkErrors();
      } catch {
        handleNetworkError();
      }
    }, 30000);

    const handleVisibilityChange = async () => {
      const wasVisible = isVisible;
      isVisible = document.visibilityState === 'visible';

      if (isVisible && isOnline) {
        resetNetworkErrors();

        const health = await healthCheck();
        if (!health.healthy) {
          return;
        }

        const planet = useGameStore.getState().currentPlanet;
        if (planet) {
          try {
            await fullReconnectSync(planet.id);
          } catch {
            handleNetworkError();
            try {
              await fetchResources(planet.id);
              await fetchTechnologies(user.id);
            } catch {
              // Ignore secondary fetch errors
            }
          }
        }
        const { fleets } = useGameStore.getState();
        if (fleets.length > 0) {
          checkFleetArrivals(user.id, refreshProfile);
        }
      } else if (!isVisible && wasVisible) {
        try {
          await saveResourcesToDatabase();
        } catch {
          // Ignore errors when going to background
        }
      }
    };

    const handleOnline = async () => {
      isOnline = true;
      resetNetworkErrors();

      const health = await healthCheck();
      if (health.healthy) {
        resetCircuitBreaker();
      }
    };

    const handleOffline = () => {
      isOnline = false;
    };

    const handleBeforeUnload = () => {
      saveResourcesToDatabase();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(resourceTickId);
      clearInterval(smartCheckId);
      clearInterval(fleetCheckId);
      clearInterval(saveId);
      clearInterval(syncId);
      if (networkErrorResetTimer) clearTimeout(networkErrorResetTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [
    initialized,
    user,
    updateResources,
    checkBuildingCompletion,
    checkShipyardCompletion,
    checkResearchCompletion,
    checkFleetArrivals,
    saveResourcesToDatabase,
    fetchResources,
    fetchBuildings,
    fetchBuildingQueue,
    fetchShips,
    fetchDefenses,
    fetchShipyardQueue,
    fetchTechnologies,
    fullReconnectSync,
    refreshProfile,
  ]);

  if (loadingState.phase === 'error' || loadingState.phase === 'waiting_server') {
    return (
      <ConnectionRecoveryScreen
        state={loadingState}
        onRetry={handleRetry}
        onLogout={handleLogout}
      />
    );
  }

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
        <div className="text-center p-8 max-w-md w-full">
          <div className="relative mx-auto mb-6 w-36 h-36">
            <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-[60px] animate-pulse scale-150" />
            <img src="/Imagenes/Visuales/main_city.webp" alt="Imperium" className="w-36 h-36 object-cover rounded-full bg-stone-950 ring-4 ring-amber-500/60 relative z-10 shadow-[0_0_30px_rgba(245,158,11,0.45)] animate-float" draggable={false} />
          </div>
          <p className="text-slate-400 text-sm mb-4">{loadingState.message}</p>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${loadingState.progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      {/* ===== RUTAS PÚBLICAS (SEO Indexables) ===== */}
      <Route
        path="/"
        element={
          user ? <Navigate to="/game" replace /> : <LandingPage />
        }
      />

      {/* Blog */}
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogArticlePage />} />

      {/* Landing Pages por Keyword */}
      <Route path="/ganar-criptomonedas-jugando" element={<GanarCriptomonedasPage />} />
      <Route path="/juegos-play-to-earn-gratis" element={<JuegosPlayToEarnPage />} />
      <Route path="/alternativa-ogame-crypto" element={<AlternativaOGamePage />} />
      <Route path="/ganar-dinero-jugando" element={<GanarDineroJugandoPage />} />
      <Route path="/5-pasos-para-ganar-criptomonedas" element={<CincoPasosPage />} />
      <Route path="/generar-ingresos-gratis" element={<GenerarIngresosGratisPage />} />
      <Route path="/vender-recursos-ganar-dinero" element={<VenderRecursosPage />} />

      {/* Landing Pages por pais */}
      {COUNTRY_LANDINGS.map((country) => (
        <Route
          key={country.slug}
          path={`/${country.slug}`}
          element={<CountryLandingPage data={country} />}
        />
      ))}

      {/* About */}
      <Route path="/about" element={<AboutPage />} />

      {/* Roadmap */}
      <Route path="/roadmap" element={<RoadmapPage />} />

      {/* Legal */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* ===== RUTAS DE AUTENTICACIÓN ===== */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* ===== RUTAS DEL JUEGO (Protegidas) ===== */}
      <Route
        path="/game"
        element={
          <ProtectedRoute>
            <GameInitializer>
              <GameLayout />
            </GameInitializer>
          </ProtectedRoute>
        }
      >
          <Route index element={<OverviewPage />} />
          <Route path="buildings" element={<BuildingsPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="research" element={<ResearchPage />} />
          <Route path="shipyard" element={<ShipyardPage />} />
          <Route path="defense" element={<DefensePage />} />
          <Route path="fleet" element={<FleetPage />} />
          <Route path="galaxy" element={<GalaxyPage />} />
          <Route path="occupations" element={<OccupationsPage />} />
          <Route path="requirements" element={<RequirementsPage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="alliance" element={<AlliancePage />} />
          <Route path="fortress" element={<FortressPage />} />
          <Route path="treasure-planet" element={<TreasurePlanetPage />} />
          <Route path="ranking" element={<RankingPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="officers" element={<OfficersPage />} />
          <Route path="referral" element={<ReferralPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="p2p" element={<P2PPage />} />
          <Route path="kyc" element={<KYCPage />} />
          <Route path="vip" element={<VipPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="daily-missions" element={<DailyMissionsPage />} />
          <Route path="premium-missions" element={<PremiumMissionsPage />} />
          <Route path="hero-ship" element={<HeroShipPage />} />
          <Route path="casino" element={<CasinoPage />} />
          <Route path="roulette" element={<RoulettePage />} />
          <Route path="slots" element={<SlotsPage />} />
          <Route path="dice" element={<DicePage />} />
          <Route path="battleship" element={<BattleshipPage />} />
          <Route path="sports" element={<SportsBettingPage />} />
          <Route path="hall-of-fame" element={<HallOfFamePage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="top-battles" element={<TopBattlesPage />} />
          <Route path="combat-simulator" element={<CombatSimulatorPage />} />
          <Route path="lottery" element={<LotteryPage />} />
          <Route path="raffle" element={<RafflePage />} />
          <Route path="forum" element={<ForumPage />} />
          <Route path="alliance-wars" element={<AllianceWarsPage />} />
          <Route path="cosmetics" element={<CosmeticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<AdminPage />} />
      </Route>

      {/* ===== 404 ===== */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <HelmetProvider>
      <I18nProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </I18nProvider>
    </HelmetProvider>
  );
}

export default App;
