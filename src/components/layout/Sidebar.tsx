import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Globe,
  Building2,
  Microscope,
  Rocket,
  Shield,
  Send,
  Map,
  Users,
  Trophy,
  Mail,
  Crown,
  Settings,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  BookOpen,
  Store,
  Gift,
  ShieldAlert,
  Wallet,
  ClipboardList,
  Award,
  Medal,
  Star,
  TrendingUp,
  ArrowLeftRight,
  Sword,
  Swords,
  Newspaper,
  MessageCircle,
  MessagesSquare,
  ShoppingBag,
  IdCard,
  Dices,
  Flag,
  Lock,
  Home,
  Landmark,
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useOccupationStore, type OwnerOccupiedPlanet } from '../../store/occupationStore';
import { occViewSegment } from '../game/OccupiedPlanetView';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import { formatCoordinates, getPlanetImage } from '../../lib/utils';
import { useI18n, translatePlanetName } from '../../lib/i18n';
import { JackpotDisplay } from '../ui/JackpotDisplay';
import { RankBadge } from '../ui/RankBadge';
import { useHeroAccess } from '../../lib/casino';
import { SpqrBanner } from '../ui/RomanOrnaments';

type MenuKey = 'overview' | 'publicChat' | 'buildings' | 'resources' | 'research' | 'shipyard' | 'defense' | 'fleet' | 'galaxy' | 'requirements' | 'market' | 'p2p' | 'kyc' | 'alliance' | 'allianceWars' | 'ranking' | 'hallOfFame' | 'records' | 'topBattles' | 'messages' | 'officers' | 'referral' | 'wallet' | 'vip' | 'tasks' | 'dailyMissions' | 'premiumMissions' | 'combatSimulator' | 'lottery' | 'raffle' | 'heroShip' | 'casino' | 'forum' | 'cosmetics' | 'occupations';

const menuItems: { icon: typeof Globe; key: MenuKey; path: string }[] = [
  { icon: Globe, key: 'overview', path: '/game' },
  { icon: MessagesSquare, key: 'publicChat', path: '/game/chat' },
  { icon: Building2, key: 'buildings', path: '/game/buildings' },
  { icon: TrendingUp, key: 'resources', path: '/game/resources' },
  { icon: Microscope, key: 'research', path: '/game/research' },
  { icon: Rocket, key: 'shipyard', path: '/game/shipyard' },
  { icon: Shield, key: 'defense', path: '/game/defense' },
  { icon: Swords, key: 'combatSimulator', path: '/game/combat-simulator' },
  { icon: Send, key: 'fleet', path: '/game/fleet' },
  { icon: Map, key: 'galaxy', path: '/game/galaxy' },
  { icon: Flag, key: 'occupations', path: '/game/occupations' },
  { icon: BookOpen, key: 'requirements', path: '/game/requirements' },
  { icon: Store, key: 'market', path: '/game/market' },
  { icon: ArrowLeftRight, key: 'p2p', path: '/game/p2p' },
  { icon: IdCard, key: 'kyc', path: '/game/kyc' },
  { icon: Wallet, key: 'wallet', path: '/game/wallet' },
  { icon: Star, key: 'vip', path: '/game/vip' },
  { icon: Users, key: 'alliance', path: '/game/alliance' },
  { icon: Swords, key: 'allianceWars', path: '/game/alliance-wars' },
  { icon: Trophy, key: 'ranking', path: '/game/ranking' },
  { icon: Award, key: 'hallOfFame', path: '/game/hall-of-fame' },
  { icon: Medal, key: 'records', path: '/game/records' },
  { icon: Swords, key: 'topBattles', path: '/game/top-battles' },
  { icon: Mail, key: 'messages', path: '/game/messages' },
  { icon: Crown, key: 'officers', path: '/game/officers' },
  { icon: Gift, key: 'referral', path: '/game/referral' },
  { icon: ClipboardList, key: 'tasks', path: '/game/tasks' },
  { icon: Star, key: 'dailyMissions', path: '/game/daily-missions' },
  { icon: Sword, key: 'heroShip', path: '/game/hero-ship' }, // [CASINO1] solo visible con acceso (servidor)
  { icon: Dices, key: 'casino', path: '/game/casino' }, // Loteria y Rifa ahora son cards dentro del Casino
  { icon: MessageCircle, key: 'forum', path: '/game/forum' },
  { icon: ShoppingBag, key: 'cosmetics', path: '/game/cosmetics' },
];

const HIDDEN_KEYS: MenuKey[] = ['hallOfFame', 'topBattles', 'dailyMissions', 'combatSimulator', 'cosmetics'];

// Secciones del menu: cada una es un cartel; las de varias opciones se despliegan
const menuGroups: { id: string; icon: typeof Globe; es: string; en: string; keys: MenuKey[] }[] = [
  { id: 'home', icon: Home, es: 'Inicio', en: 'Home', keys: ['overview'] },
  { id: 'city', icon: Landmark, es: 'Ciudad', en: 'City', keys: ['buildings', 'resources', 'requirements', 'officers'] },
  { id: 'army', icon: Swords, es: 'Ejército', en: 'Army', keys: ['shipyard', 'defense', 'fleet', 'occupations', 'heroShip', 'combatSimulator'] },
  { id: 'alliance', icon: Users, es: 'Alianza', en: 'Alliance', keys: ['alliance', 'allianceWars', 'publicChat', 'messages', 'forum'] },
  { id: 'map', icon: Map, es: 'Mapa', en: 'Map', keys: ['galaxy'] },
  { id: 'research', icon: Microscope, es: 'Investigación', en: 'Research', keys: ['research'] },
  { id: 'market', icon: Store, es: 'Mercado', en: 'Market', keys: ['market', 'p2p', 'wallet', 'vip', 'kyc', 'cosmetics'] },
  { id: 'events', icon: Trophy, es: 'Eventos', en: 'Events', keys: ['casino', 'ranking', 'records', 'hallOfFame', 'topBattles'] },
  { id: 'missions', icon: ClipboardList, es: 'Misiones', en: 'Missions', keys: ['tasks', 'dailyMissions', 'referral'] },
];

const isPathActive = (pathname: string, path: string) =>
  path === '/game'
    ? pathname === '/game' || pathname === '/game/'
    : pathname === path || pathname.startsWith(`${path}/`);

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { currentPlanet, planets, selectPlanet } = useGameStore();
  const { asOccupier, asOwner, activeOccupationId, enter: enterOccupation, exit: exitOccupation } = useOccupationStore();
  const activeOcc = activeOccupationId ? asOccupier.find((o) => o.occupation_id === activeOccupationId) : undefined;
  const location = useLocation();
  const { profile } = useAuthStore();
  const { isAdmin, isFinancialViewer } = useAdminStore();
  const heroAccess = useHeroAccess(profile?.id);
  const { t, language } = useI18n();
  const es = language === 'es';
  const showPlanetList = planets.length > 1 || asOccupier.length > 0;
  const navigate = useNavigate();
  const [isPlanetListOpen, setIsPlanetListOpen] = useState(false);
  const planetSelectorRef = useRef<HTMLDivElement>(null);

  const groups = menuGroups
    .map((g) => ({
      ...g,
      items: g.keys
        .filter((k) => !HIDDEN_KEYS.includes(k) && (k !== 'heroShip' || heroAccess === true))
        .map((k) => menuItems.find((m) => m.key === k)!)
        .filter(Boolean),
    }))
    .filter((g) => g.items.length > 0);
  const activeGroupId = groups.find((g) => g.items.some((i) => isPathActive(location.pathname, i.path)))?.id ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupId);

  useEffect(() => {
    if (activeGroupId) setOpenGroup(activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (planetSelectorRef.current && !planetSelectorRef.current.contains(event.target as Node)) {
        setIsPlanetListOpen(false);
      }
    };

    if (isPlanetListOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPlanetListOpen]);

  const handlePlanetClick = () => {
    navigate('/game');
    onClose();
  };

  const handleSelectPlanet = async (planetId: string) => {
    exitOccupation();
    await selectPlanet(planetId);
    setIsPlanetListOpen(false);
    onClose();
  };

  // [OCUPA2] Colonia ocupada del dueño: atacar la guarnición desde un planeta libre
  const handleRecover = async (o: OwnerOccupiedPlanet) => {
    exitOccupation();
    const occupiedIds = new Set(asOwner.map((x) => x.planet_id));
    if (!currentPlanet || occupiedIds.has(currentPlanet.id)) {
      const base = planets.find((p) => p.is_main_planet && !occupiedIds.has(p.id))
        || planets.find((p) => !occupiedIds.has(p.id));
      if (base) await selectPlanet(base.id);
    }
    setIsPlanetListOpen(false);
    onClose();
    navigate(`/game/fleet?galaxy=${o.galaxy}&system=${o.solar_system}&position=${o.position}&mission=attack`);
  };

  // [OCUPA3] Seleccionar el planeta ocupado: las secciones del planeta lo muestran como propio
  const handleOpenOccupation = (occupationId: string) => {
    setIsPlanetListOpen(false);
    onClose();
    if (occViewSegment(location.pathname) === null) navigate('/game');
    enterOccupation(occupationId);
  };

  return (
    <aside className={`fixed lg:fixed top-0 left-0 h-full w-64 border-r-2 border-[#6b5026] shadow-[inset_-5px_0_0_#0a0705,inset_-6px_0_0_rgba(214,170,85,0.35),6px_0_28px_rgba(0,0,0,0.6)] bg-[linear-gradient(180deg,#17110b_0%,#0d0906_45%,#080604_100%)] flex flex-col z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <NavLink
        to="/game"
        onClick={onClose}
        className="hidden lg:flex flex-col items-center justify-center pt-3 pb-2 flex-shrink-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(214,170,85,0.12),transparent_70%)]"
      >
        <SpqrBanner className="w-[124px] h-[156px]" />
      </NavLink>
      <div className="rm-divider mx-4 hidden lg:block" />
      <div className="p-3 border-b border-[#d6aa55]/20 relative" ref={planetSelectorRef}>
        <div className="flex items-center justify-between lg:hidden mb-3">
          <span className="font-serif text-lg text-amber-100">Menu</span>
          <button onClick={onClose} className="p-1.5 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-sm border border-[#8a6a32] bg-[linear-gradient(180deg,#1e160d,#0c0806)] shadow-[inset_0_0_0_2px_rgba(0,0,0,0.6),inset_0_0_0_3px_rgba(201,158,78,0.22)]">
          <div
            data-tour="planet-selector"
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handlePlanetClick}
            title="Ir a Vista General"
          >
            <div className={`w-11 h-11 rounded-full overflow-hidden border-2 flex-shrink-0 ${activeOcc ? 'border-red-500/70 shadow-[0_0_12px_rgba(239,68,68,0.45)]' : 'border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.35)]'}`}>
              {activeOcc ? (
                <img
                  src={getPlanetImage(activeOcc.temp_max ?? 0, activeOcc.image_id ?? undefined)}
                  alt={activeOcc.planet_name}
                  className="w-full h-full object-cover"
                />
              ) : currentPlanet && (
                <div className="w-full h-full bg-stone-950">
                  <img
                    src="/Imagenes/Visuales/main_city.webp"
                    alt={translatePlanetName(currentPlanet.name)}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {activeOcc ? (
                <>
                  <h3 className="font-serif text-sm text-red-200 truncate flex items-center gap-1">
                    <Flag className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="truncate">{activeOcc.planet_name}</span>
                  </h3>
                  <p className="text-[11px] text-red-300 truncate">
                    {formatCoordinates(activeOcc.galaxy, activeOcc.solar_system, activeOcc.position)} · {es ? 'de' : 'of'} {activeOcc.owner_name || '?'}
                  </p>
                </>
              ) : (
                <>
              <h3 className="font-serif text-sm text-amber-100 truncate hover:text-amber-300 transition-colors">
                {currentPlanet ? translatePlanetName(currentPlanet.name) : 'Sin ciudad'}
              </h3>
              {currentPlanet && (
                <p className="text-[11px] text-amber-300">
                  {formatCoordinates(
                    currentPlanet.galaxy,
                    currentPlanet.solar_system,
                    currentPlanet.position
                  )}
                </p>
              )}
                </>
              )}
            </div>
          </div>

          {showPlanetList && (
            <button
              onClick={() => setIsPlanetListOpen(!isPlanetListOpen)}
              className="p-2 hover:bg-space-600 rounded-lg transition-colors flex-shrink-0"
              title={isPlanetListOpen ? 'Ocultar ciudades' : 'Ver todas las ciudades'}
            >
              {isPlanetListOpen ? (
                <ChevronUp className="w-5 h-5 text-amber-300" />
              ) : (
                <ChevronDown className="w-5 h-5 text-amber-300" />
              )}
            </button>
          )}
        </div>

        {showPlanetList && isPlanetListOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 mx-2 bg-[#241a0e] border border-amber-700/50 rounded-lg shadow-lg shadow-black/50 z-50 max-h-80 overflow-y-auto">
            <div className="p-2 space-y-1">
              {planets.map((planet) => {
                const ownerOcc = asOwner.find((o) => o.planet_id === planet.id);
                if (ownerOcc) {
                  return (
                    <div
                      key={planet.id}
                      className="w-full flex items-center gap-2 p-2 rounded-lg border border-red-500/30 bg-red-950/30"
                      title={es ? 'Colonia ocupada: no puedes entrar hasta recuperarla' : 'Occupied colony: you cannot enter until you recover it'}
                    >
                      <div className="relative w-8 h-8 flex-shrink-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-red-500/40 opacity-40 grayscale">
                          <img
                            src={getPlanetImage(planet.temp_max, planet.image_id)}
                            alt={translatePlanetName(planet.name)}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Lock className="absolute inset-0 m-auto w-4 h-4 text-red-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-gray-400 line-through decoration-red-500/60">{translatePlanetName(planet.name)}</p>
                        <p className="text-[10px] text-red-300 truncate flex items-center gap-1">
                          <Flag className="w-3 h-3 flex-shrink-0" />
                          {es ? 'Ocupado por' : 'Occupied by'} {ownerOcc.occupier_name || '?'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRecover(ownerOcc)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold flex-shrink-0"
                        title={es ? 'Atacar la guarnición del ocupante para recuperar la colonia' : 'Attack the occupier garrison to recover the colony'}
                      >
                        <Swords className="w-3 h-3" />
                        {es ? 'Recuperar' : 'Recover'}
                      </button>
                    </div>
                  );
                }
                const isSel = !activeOcc && planet.id === currentPlanet?.id;
                return (
                <button
                  key={planet.id}
                  onClick={() => handleSelectPlanet(planet.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left ${
                    isSel
                      ? 'bg-amber-500/20 border border-amber-500/40'
                      : 'hover:bg-amber-500/10'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-amber-500/40 flex-shrink-0 bg-stone-950">
                    <img
                      src="/Imagenes/Visuales/main_city.webp"
                      alt={translatePlanetName(planet.name)}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate flex items-center gap-1.5 ${
                      isSel ? 'text-amber-300' : 'text-white'
                    }`}>
                      <span
                        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                          planet.autopilot_role === 'miner' ? 'bg-emerald-400' :
                          planet.autopilot_role === 'military' ? 'bg-red-400' :
                          planet.autopilot_role === 'research' ? 'bg-sky-400' :
                          planet.autopilot_role === 'colonizer' ? 'bg-fuchsia-400' :
                          'bg-gray-500'
                        }`}
                        title={planet.autopilot_role || 'balanced'}
                      />
                      <span className="truncate">{translatePlanetName(planet.name)}</span>
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatCoordinates(planet.galaxy, planet.solar_system, planet.position)}
                    </p>
                  </div>
                  {isSel && (
                    <Check className="w-4 h-4 text-amber-300 flex-shrink-0" />
                  )}
                </button>
                );
              })}

              {asOccupier.length > 0 && (
                <>
                  <p className="pt-2 pb-1 px-1 text-[10px] font-orbitron uppercase tracking-wider text-red-300 flex items-center gap-1 border-t border-red-500/20">
                    <Flag className="w-3 h-3" /> {es ? 'Ciudades ocupadas' : 'Occupied planets'}
                  </p>
                  {asOccupier.map((o) => (
                    <button
                      key={o.occupation_id}
                      onClick={() => handleOpenOccupation(o.occupation_id)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left border ${o.occupation_id === activeOccupationId ? 'border-red-500 bg-red-900/40' : 'border-red-500/30 bg-red-950/20 hover:bg-red-900/30'}`}
                      title={es ? 'Seleccionar: ver la ciudad, producir tropas/defensas y transportar recursos' : 'Select: view the planet, build ships/defenses and transport resources'}
                    >
                      <div className="relative w-8 h-8 flex-shrink-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-red-500/50">
                          <img
                            src={getPlanetImage(o.temp_max ?? 0, o.image_id ?? undefined)}
                            alt={o.planet_name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Flag className="absolute -top-1 -right-1 w-3.5 h-3.5 text-red-400 drop-shadow" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-red-200">{o.planet_name}</p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {formatCoordinates(o.galaxy, o.solar_system, o.position)} · {es ? 'de' : 'of'} {o.owner_name || '?'}
                        </p>
                      </div>
                      {o.occupation_id === activeOccupationId && (
                        <Check className="w-4 h-4 text-red-300 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Player Rank Badge */}
      {profile && (
        <div className="px-3 py-2 border-b border-[#d6aa55]/20">
          <RankBadge pointsTotal={profile.points_total} variant="compact" />
        </div>
      )}

      <nav className="flex-1 pl-2 pr-6 py-2 overflow-y-auto overflow-x-hidden">
        {groups.map((g) => {
          const label = es ? g.es : g.en;
          const groupActive = g.id === activeGroupId;
          const iconCls = `w-6 h-6 flex-shrink-0 ${groupActive ? 'text-[#f6e2a8] drop-shadow-[0_0_6px_rgba(246,226,168,0.5)]' : 'text-[#d6aa55]'}`;

          if (g.items.length === 1) {
            const item = g.items[0];
            return (
              <NavLink
                key={g.id}
                to={item.path}
                end={item.path === '/game'}
                onClick={onClose}
                data-tour={`nav-${item.key}`}
                title={t.nav[item.key]}
                className={`rm-plaque ${groupActive ? 'active' : ''}`}
              >
                <g.icon strokeWidth={1.6} className={iconCls} />
                <span className="rm-plaque-label">{label}</span>
              </NavLink>
            );
          }

          const isOpen = openGroup === g.id;
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : g.id)}
                aria-expanded={isOpen}
                data-tour={isOpen ? `nav-group-${g.id}` : `nav-${g.items[0].key}`}
                className={`rm-plaque ${groupActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}
              >
                <g.icon strokeWidth={1.6} className={iconCls} />
                <span className="rm-plaque-label">{label}</span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 text-[#d6aa55] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="rm-subpanel">
                  {g.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/game'}
                      onClick={onClose}
                      data-tour={`nav-${item.key}`}
                      title={t.nav[item.key]}
                      className={({ isActive }) =>
                        `rm-sub group last:odd:col-span-2 ${isActive ? 'active' : ''} ${item.key === 'vip' ? 'vip' : ''}`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon strokeWidth={1.6} className={`w-5 h-5 flex-shrink-0 ${item.key === 'vip' ? 'text-yellow-400' : isActive ? 'text-[#f6e2a8]' : 'text-[#d6aa55] group-hover:text-[#f3dfae]'}`} />
                          <span className={`rm-sub-label ${item.key === 'vip' ? '!text-yellow-300' : ''}`}>{t.nav[item.key]}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <JackpotDisplay />

      <div className="pl-2 pr-5 py-1.5 border-t border-[#d6aa55]/20">
        {(isAdmin || isFinancialViewer) && (
          <NavLink
            to="/game/admin"
            onClick={onClose}
            className={({ isActive }) =>
              `menu-item py-1.5 ${isActive ? 'active bg-red-900/20' : ''}`
            }
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            <span className="text-red-300 text-xs">{isFinancialViewer ? 'Finanzas' : 'Admin'}</span>
          </NavLink>
        )}
        <NavLink
          to="/game/settings"
          onClick={onClose}
          className={({ isActive }) =>
            `menu-item py-1.5 ${isActive ? 'active' : ''}`
          }
        >
          <Settings className="w-3.5 h-3.5 text-amber-200/60" />
          <span className="text-amber-200/70 text-xs">{t.nav.settings}</span>
        </NavLink>
        <div className="mt-1.5 pt-1.5 border-t border-[#d6aa55]/20 text-center">
          <span className="text-[9px] text-gray-600 font-mono">v1.0</span>
        </div>
      </div>
    </aside>
  );
}
