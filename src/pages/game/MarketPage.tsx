import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Store, Coins, Package, Plus, X, ShoppingCart, History, AlertCircle, Sparkles, Filter, ChevronLeft, ChevronRight, Search, ExternalLink, MessageCircle, Box, Loader2, Clock, CheckCircle, Tag, Crown, Trophy, Swords, Gem, Globe, Moon, Building2, Gift } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { COLONY_LISTING_CHANGED_EVENT } from '../../components/ui/ColonySaleLock';
import { InstantShipyardTab } from '../../components/game/InstantShipyardTab';
import { GiftItemModal } from '../../components/game/GiftItemModal';
import { HeroItemsMarketTab } from '../../components/game/HeroItemsMarketTab';
import { useHeroAccess } from '../../lib/casino';
import { ColonySellSection, ColonyDepositsInfo, COLONY_DEPOSIT_COLUMNS, toColonyDeposits, type ColonyDeposits } from '../../components/game/ColonySellSection';
import { ColonyBuildingsModal } from '../../components/game/ColonyBuildingsModal';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { useAdminStore } from '../../store/adminStore';
import { formatNumber, getPlanetImage } from '../../lib/utils';
import { RESOURCE_IMAGES } from '../../lib/resourceImages';
import { ShipIcon } from '../../components/ui/ShipIcon';
import { GameMedia } from '../../components/ui/GameMedia';
import { useI18n, translatePlanetName, getShipImage, translateShipName } from '../../lib/i18n';
import { useNavigate } from 'react-router-dom';
import { useIsUserPlus } from '../../hooks/useIsUserPlus';

interface MarketListing {
  id: string;
  seller_id: string;
  listing_type: 'resource' | 'ship' | 'dark_matter' | 'blueprint' | 'colony';
  item_code: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  planet_id: string | null;
  status: string;
  created_at: string;
  purchasable_at: string;
  seller?: { username: string; rank_position?: number };
  seller_fee_percent?: number;
  seller_is_plus?: boolean;
}

interface BuyOffer {
  id: string;
  buyer_id: string;
  listing_type: 'resource' | 'ship' | 'dark_matter';
  item_code: string;
  quantity: number;
  quantity_filled: number;
  price_per_unit: number;
  total_price: number;
  status: string;
  created_at: string;
  buyer?: { username: string; rank_position?: number };
  buyer_is_plus?: boolean;
}

interface ShipType {
  id: number;
  code: string;
  name: string;
  category: string;
  image_url?: string;
  metal_cost?: number;
  crystal_cost?: number;
  deuterium_cost?: number;
}

type TabType = 'browse' | 'sell' | 'buy_offers' | 'create_buy_offer' | 'supply_boxes' | 'blueprints' | 'shipyard' | 'hero_items' | 'my_listings' | 'history';
type ListingType = 'resource' | 'ship' | 'dark_matter';

// Paleta por tipo de item para las tarjetas del mercado
const LISTING_ACCENTS: Record<string, {
  label: string; card: string; orb: string; tile: string; ring: string; text: string; badge: string; btn: string;
}> = {
  resource: {
    label: 'Recurso',
    card: 'border-amber-500/25 hover:border-amber-400/70 hover:shadow-[0_0_28px_-6px_rgba(245,158,11,0.55)]',
    orb: 'bg-amber-500/25',
    tile: 'from-amber-500/30 to-amber-500/5',
    ring: 'ring-amber-400/30',
    text: 'text-amber-300',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    btn: 'from-amber-500 to-orange-600 shadow-[0_0_18px_-4px_rgba(245,158,11,0.8)]',
  },
  ship: {
    label: 'Soldados',
    card: 'border-red-500/25 hover:border-red-400/70 hover:shadow-[0_0_28px_-6px_rgba(220,38,38,0.55)]',
    orb: 'bg-red-500/25',
    tile: 'from-red-500/30 to-red-500/5',
    ring: 'ring-red-400/30',
    text: 'text-red-300',
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    btn: 'from-red-500 to-rose-700 shadow-[0_0_18px_-4px_rgba(220,38,38,0.8)]',
  },
  dark_matter: {
    label: 'Materia Oscura',
    card: 'border-purple-500/25 hover:border-purple-400/70 hover:shadow-[0_0_28px_-6px_rgba(168,85,247,0.55)]',
    orb: 'bg-purple-500/25',
    tile: 'from-purple-500/30 to-purple-500/5',
    ring: 'ring-purple-400/30',
    text: 'text-purple-300',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    btn: 'from-purple-500 to-fuchsia-600 shadow-[0_0_18px_-4px_rgba(168,85,247,0.8)]',
  },
  blueprint: {
    label: 'Plano',
    card: 'border-amber-500/25 hover:border-amber-400/70 hover:shadow-[0_0_28px_-6px_rgba(251,191,36,0.55)]',
    orb: 'bg-amber-500/25',
    tile: 'from-amber-500/30 to-amber-500/5',
    ring: 'ring-amber-400/30',
    text: 'text-amber-300',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    btn: 'from-amber-500 to-orange-600 shadow-[0_0_18px_-4px_rgba(251,191,36,0.8)]',
  },
  colony: {
    label: 'Sub-Ciudad',
    card: 'border-emerald-500/25 hover:border-emerald-400/70 hover:shadow-[0_0_28px_-6px_rgba(52,211,153,0.55)]',
    orb: 'bg-emerald-500/25',
    tile: 'from-emerald-500/30 to-emerald-500/5',
    ring: 'ring-emerald-400/30',
    text: 'text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    btn: 'from-emerald-500 to-teal-700 shadow-[0_0_18px_-4px_rgba(52,211,153,0.8)]',
  },
};

// [COLMKT1] Datos visibles de una colonia en venta (solo para mostrar; el servidor valida todo)
interface ColonyInfo {
  name: string;
  galaxy: number;
  solar_system: number;
  position: number;
  temp_max: number;
  image_id: number;
  fields_used: number;
  fields_max: number;
  has_moon: boolean;
  deposits: ColonyDeposits;
}

// Imagenes de recursos (las mismas de la seccion de produccion de recursos)
const BLUEPRINT_IMAGE = '/Imagenes/planos/Planos.webp';

interface SupplyBox {
  id: number;
  name: string;
  code: string;
  description: string;
  metal_amount: number;
  crystal_amount: number;
  deuterium_amount: number;
  price_fxu: number;
  price_usdt: number;
}
type FilterType = 'all' | 'resource' | 'ship' | 'dark_matter' | 'blueprint' | 'colony';
type SortType = 'newest' | 'price_low' | 'price_high';

const ITEMS_PER_PAGE_MOBILE = 4;
const ITEMS_PER_PAGE_DESKTOP = 10;

// Prioridad de aparicion en el mercado:
//   1) Ofertas de usuarios VIP (Plus) primero
//   2) Luego por posicion en el ranking (numero mas bajo = mejor puesto)
// Los usuarios sin posicion de ranking van al final.
function comparePriority(
  aPlus: boolean,
  aRank: number | null | undefined,
  bPlus: boolean,
  bRank: number | null | undefined
): number {
  if (aPlus !== bPlus) return aPlus ? -1 : 1;
  const ra = aRank && aRank > 0 ? aRank : Number.MAX_SAFE_INTEGER;
  const rb = bRank && bRank > 0 ? bRank : Number.MAX_SAFE_INTEGER;
  return ra - rb;
}

export function MarketPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuthStore();
  const isPlus = useIsUserPlus();
  const { currentPlanet, resources, ships, fetchResources, fetchShips, fetchPlanets } = useGameStore();
  const { feeSettings, fetchFeeSettings } = useAdminStore();
  const [myFeeInfo, setMyFeeInfo] = useState<{ fee_percent: number; is_plus: boolean; rank: number } | null>(null);
  const MARKET_FEE_PERCENT = myFeeInfo?.fee_percent ?? feeSettings.market_fee_percent;
  const heroAccess = useHeroAccess(profile?.id);
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'hero_items' ? 'hero_items' : 'browse');
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [shipTypes, setShipTypes] = useState<ShipType[]>([]);
  const [blueprintTypes, setBlueprintTypes] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(true);
  const [supplyBoxes, setSupplyBoxes] = useState<SupplyBox[]>([]);
  const [purchasingBox, setPurchasingBox] = useState<string | null>(null);
  const purchasingBoxRef = useRef(false);
  const [giftBox, setGiftBox] = useState<SupplyBox | null>(null);
  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
  const [colonyInfo, setColonyInfo] = useState<Record<string, ColonyInfo>>({});
  const [buildingsListing, setBuildingsListing] = useState<MarketListing | null>(null);
  const closeBuildingsModal = useCallback(() => setBuildingsListing(null), []);
  // [COLMKT7] Plazas de planeta del comprador segun Astrofisica (el servidor lo valida igual)
  const [colonySlots, setColonySlots] = useState<{ owned: number; max: number; astro: number } | null>(null);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(
    typeof window !== 'undefined' && window.innerWidth < 640 ? ITEMS_PER_PAGE_MOBILE : ITEMS_PER_PAGE_DESKTOP
  );

  useEffect(() => {
    const updateItemsPerPage = () => {
      setItemsPerPage(window.innerWidth < 640 ? ITEMS_PER_PAGE_MOBILE : ITEMS_PER_PAGE_DESKTOP);
    };
    window.addEventListener('resize', updateItemsPerPage);
    return () => window.removeEventListener('resize', updateItemsPerPage);
  }, []);

  const [newListing, setNewListing] = useState({
    type: 'resource' as ListingType,
    itemCode: 'metal',
    quantity: 0,
    pricePerUnit: 1,
  });
  // [COLMKT2] "Colonia" como opcion de Tipo de Item en la pestana de venta
  const [sellColonyMode, setSellColonyMode] = useState(false);
  const [priceInputStr, setPriceInputStr] = useState('1');
  const [priceRef, setPriceRef] = useState<{
    reference_avg: number | null;
    min_price: number;
    max_price: number | null;
    suggested_price: number;
    sample_count: number;
    absolute_floor: number;
    tung_price_usd: number | null;
    floor_basis: string | null;
    shipyard_usd: number | null;
  } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Consulta el precio de referencia del mercado (promedio de otros vendedores)
  // y precarga el precio sugerido cuando cambia el tipo/item a vender.
  useEffect(() => {
    let cancelled = false;
    if (newListing.type !== 'resource' && newListing.type !== 'ship') {
      setPriceRef(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc('get_market_price_reference', {
        p_listing_type: newListing.type,
        p_item_code: newListing.itemCode,
      });
      if (cancelled || error || !data) return;
      const ref = {
        reference_avg: data.reference_avg != null ? Number(data.reference_avg) : null,
        min_price: Number(data.min_price),
        max_price: data.max_price != null ? Number(data.max_price) : null,
        suggested_price: Number(data.suggested_price),
        sample_count: Number(data.sample_count) || 0,
        absolute_floor: Number(data.absolute_floor),
        tung_price_usd: data.tung_price_usd != null ? Number(data.tung_price_usd) : null,
        floor_basis: data.floor_basis ?? null,
        shipyard_usd: data.shipyard_usd != null ? Number(data.shipyard_usd) : null,
      };
      setPriceRef(ref);
      setNewListing((prev) => ({ ...prev, pricePerUnit: ref.suggested_price }));
      setPriceInputStr(String(ref.suggested_price));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newListing.type, newListing.itemCode]);

  const [buyOffers, setBuyOffers] = useState<BuyOffer[]>([]);
  const [myBuyOffers, setMyBuyOffers] = useState<BuyOffer[]>([]);
  const [monthlySales, setMonthlySales] = useState<{
    enabled: boolean;
    vip_unlimited: boolean;
    monthly_limit: number;
    user_points: number;
    fxu_spent: number;
    fxu_earned: number;
    fxu_credit: number;
    metal_sold: number;
    crystal_sold: number;
    deuterium_sold: number;
    metal_remaining: number;
    crystal_remaining: number;
    deuterium_remaining: number;
    ships_value_sold: number;
    ships_value_remaining: number;
    fxu_limit: number;
    fxu_value_sold: number;
    fxu_value_remaining: number;
    week_resets_at: string | null;
    has_credit: boolean;
    fxu_exhausted: boolean;
  } | null>(null);
  const [monthlySalesLoading, setMonthlySalesLoading] = useState(true);
  const [newBuyOffer, setNewBuyOffer] = useState({
    type: 'resource' as ListingType,
    itemCode: 'metal',
    quantity: 0,
    pricePerUnit: 1,
  });
  const [buyOfferPriceStr, setBuyOfferPriceStr] = useState('1');
  const [buyPriceRef, setBuyPriceRef] = useState<{
    reference_avg: number | null;
    min_price: number;
    max_price: number | null;
    suggested_price: number;
    sample_count: number;
    floor_basis: string | null;
  } | null>(null);

  // Precio de referencia del mercado para ofertas de COMPRA (mismo promedio que las ventas).
  useEffect(() => {
    let cancelled = false;
    if (newBuyOffer.type !== 'resource' && newBuyOffer.type !== 'ship') {
      setBuyPriceRef(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc('get_market_price_reference', {
        p_listing_type: newBuyOffer.type,
        p_item_code: newBuyOffer.itemCode,
      });
      if (cancelled || error || !data) return;
      const ref = {
        reference_avg: data.reference_avg != null ? Number(data.reference_avg) : null,
        min_price: Number(data.min_price),
        max_price: data.max_price != null ? Number(data.max_price) : null,
        suggested_price: Number(data.suggested_price),
        sample_count: Number(data.sample_count) || 0,
        floor_basis: data.floor_basis ?? null,
      };
      setBuyPriceRef(ref);
      setNewBuyOffer((prev) => ({ ...prev, pricePerUnit: ref.suggested_price }));
      setBuyOfferPriceStr(String(ref.suggested_price));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newBuyOffer.type, newBuyOffer.itemCode]);
  const [fulfillModal, setFulfillModal] = useState<{
    offer: BuyOffer;
    quantity: number;
    monthlyRemaining: number | null;
    monthlyLimit: number | null;
    monthlySold: number | null;
  } | null>(null);

  const [buyModal, setBuyModal] = useState<{
    listing: MarketListing;
    quantity: number;
  } | null>(null);

  const RESOURCE_LABELS: Record<string, string> = {
    metal: t.resources.metal,
    crystal: t.resources.crystal,
    deuterium: t.resources.deuterium,
  };

  const loadMyMarketFee = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_my_market_fee');
      if (data) setMyFeeInfo(data);
    } catch (e) {
      console.error('Error loading market fee:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
    fetchFeeSettings();
    checkTelegramStatus();
    loadMonthlySales();
    loadMyMarketFee();
  }, []);

  useEffect(() => {
    const hasCooldown = listings.some(l => new Date(l.purchasable_at).getTime() > Date.now());
    if (!hasCooldown) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [listings]);

  const checkTelegramStatus = async () => {
    // Temporalmente desactivado - mercado abierto para todos sin Telegram
    setTelegramLinked(true);
  };

  useEffect(() => {
    if (activeTab === 'browse') loadListings();
    else if (activeTab === 'sell') loadMonthlySales();
    else if (activeTab === 'buy_offers') loadBuyOffers();
    else if (activeTab === 'supply_boxes') loadSupplyBoxes();
    else if (activeTab === 'my_listings') { loadMyListings(); loadMyBuyOffers(); }
    else if (activeTab === 'history') loadTransactions();
  }, [activeTab]);

  useEffect(() => {
    if (!profile) return;

    const soldListingsRef = { ids: new Set<string>(), initialized: false };

    const checkMarketUpdates = async () => {
      const { data: myListingsData } = await supabase
        .from('market_listings')
        .select('id, total_price, status')
        .eq('seller_id', profile.id)
        .eq('status', 'sold');

      if (myListingsData) {
        for (const listing of myListingsData) {
          if (!soldListingsRef.ids.has(listing.id)) {
            if (soldListingsRef.initialized) {
              const receivedAmount = listing.total_price * (1 - MARKET_FEE_PERCENT / 100);
              setSuccess(`${t.market.listingSold} ${formatNumber(receivedAmount)} ${t.market.fxuCurrency}`);
              refreshProfile();
              loadTransactions();
            }
            soldListingsRef.ids.add(listing.id);
          }
        }
        soldListingsRef.initialized = true;
      }
      loadListings();
      if (activeTab === 'my_listings') loadMyListings();
    };

    checkMarketUpdates();
    const interval = setInterval(checkMarketUpdates, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [profile, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: shipsData } = await supabase
        .from('ship_types')
        .select('id, code, name, category, image_url, metal_cost, crystal_cost, deuterium_cost')
        .order('id');

      setShipTypes((shipsData || []).filter((s) => s.code !== 'falco_x_clasica'));

      const { data: bpData } = await supabase
        .from('ship_blueprints')
        .select('code, name')
        .order('id');

      setBlueprintTypes(bpData || []);
      await loadListings();
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debe coincidir EXACTAMENTE con get_market_fee_for_user(uuid) de la BD (lo que realmente se cobra al vendedor).
  const getSellerFeePercent = (rankPosition: number | null | undefined, isPlus: boolean): number => {
    if (isPlus) return 10;
    const rank = rankPosition ?? 9999;
    if (rank <= 50) return 20;
    if (rank <= 100) return 30;
    if (rank <= 200) return 40;
    return 50;
  };

  // [COLMKT1] Carga imagen/coordenadas/campos y si tiene luna de las colonias en venta
  const loadColonyInfo = async (rows: { listing_type: string; planet_id: string | null; seller_id: string }[]) => {
    const colonyRows = rows.filter(r => r.listing_type === 'colony' && r.planet_id);
    if (colonyRows.length === 0) return;
    const planetIds = [...new Set(colonyRows.map(r => r.planet_id as string))];
    const { data: planetsData } = await supabase
      .from('planets')
      .select(`id, user_id, name, galaxy, solar_system, position, temp_max, image_id, fields_used, fields_max, ${COLONY_DEPOSIT_COLUMNS}`)
      .in('id', planetIds);
    if (!planetsData || planetsData.length === 0) return;
    const ownerIds = [...new Set(planetsData.map(p => p.user_id))];
    const { data: moonsData } = await supabase
      .from('planets')
      .select('user_id, galaxy, solar_system, position')
      .eq('planet_type', 'moon')
      .in('user_id', ownerIds);
    const info: Record<string, ColonyInfo> = {};
    for (const p of planetsData) {
      info[p.id] = {
        name: p.name,
        galaxy: p.galaxy,
        solar_system: p.solar_system,
        position: p.position,
        temp_max: p.temp_max,
        image_id: p.image_id,
        fields_used: p.fields_used,
        fields_max: p.fields_max,
        has_moon: (moonsData || []).some(m =>
          m.user_id === p.user_id && m.galaxy === p.galaxy && m.solar_system === p.solar_system && m.position === p.position
        ),
        deposits: toColonyDeposits(p),
      };
    }
    setColonyInfo(prev => ({ ...prev, ...info }));
  };

  const getColonyImage = (listing: { listing_type: string; planet_id: string | null }): string | undefined => {
    if (listing.listing_type !== 'colony' || !listing.planet_id) return undefined;
    const c = colonyInfo[listing.planet_id];
    return c ? getPlanetImage(c.temp_max, c.image_id) : undefined;
  };

  // [MKTANON1] Mercado anonimo: el servidor no expone seller_id ni nombre del vendedor.
  const loadListings = async () => {
    const { data } = await supabase.rpc('get_market_listings_public');
    const rows = (Array.isArray(data) ? data : []) as Array<Omit<MarketListing, 'seller_id'> & { is_mine: boolean; priority: number }>;
    const mapped: MarketListing[] = rows.map(l => ({
      ...l,
      seller_id: l.is_mine && profile ? profile.id : '',
      purchasable_at: l.purchasable_at || l.created_at,
      seller: { username: l.is_mine ? 'Tú' : 'Anónimo', rank_position: l.priority },
      seller_is_plus: !!l.seller_is_plus,
      seller_fee_percent: Number(l.seller_fee_percent ?? getSellerFeePercent(null, false)),
    }));
    setListings(mapped);
    loadColonyInfo(mapped);
  };

  const loadMyListings = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('market_listings')
      .select('*')
      .eq('seller_id', profile.id)
      // La materia oscura fue retirada del mercado: no se muestra en Mis Listados
      .neq('listing_type', 'dark_matter')
      .order('created_at', { ascending: false });

    setMyListings(data || []);
    loadColonyInfo(data || []);
  };

  const loadTransactions = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('market_transactions')
      .select('*')
      .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    setTransactions(data || []);
  };

  const loadSupplyBoxes = useCallback(async () => {
    const [{ data }, { data: priceData }, { data: quoteData }] = await Promise.all([
      supabase
        .from('supply_boxes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.rpc('get_live_tung_price_usd'),
      supabase.rpc('get_supply_box_quotes'),
    ]);

    // [MKTFLOOR1] Recursos dinamicos: el servidor calcula lo que da cada caja al precio actual.
    const quotes = new Map<string, { metal: number; crystal: number; deuterium: number }>(
      ((quoteData?.boxes as { code: string; metal: number; crystal: number; deuterium: number }[]) || [])
        .map((q) => [q.code, q])
    );
    setSupplyBoxes((data || []).map((box: SupplyBox) => {
      const q = quotes.get(box.code);
      return q
        ? { ...box, metal_amount: Number(q.metal), crystal_amount: Number(q.crystal), deuterium_amount: Number(q.deuterium) }
        : box;
    }));
    if (priceData != null) setTungPriceUsd(Number(priceData));
  }, []);

  // TUNG cost of a box: dynamic from USDT price when set, else fixed price_fxu.
  const boxTungCost = useCallback((box: SupplyBox): number | null => {
    if (box.price_usdt > 0) {
      if (!tungPriceUsd || tungPriceUsd <= 0) return null;
      return Math.ceil(box.price_usdt / tungPriceUsd);
    }
    return box.price_fxu;
  }, [tungPriceUsd]);

  const loadMonthlySales = async () => {
    setMonthlySalesLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_monthly_market_sales');
      if (error) {
        console.error('Error loading weekly sales limits:', error);
        setMonthlySales(null);
        return;
      }
      const result = data as Record<string, unknown> | null;
      if (result?.success && result?.vip_unlimited) {
        setMonthlySales({
          enabled: true,
          vip_unlimited: true,
          monthly_limit: 0,
          user_points: 0,
          fxu_spent: 0,
          fxu_earned: 0,
          fxu_credit: 0,
          metal_sold: 0,
          crystal_sold: 0,
          deuterium_sold: 0,
          metal_remaining: 999999999,
          crystal_remaining: 999999999,
          deuterium_remaining: 999999999,
          ships_value_sold: 0,
          ships_value_remaining: 999999999,
          fxu_limit: 0,
          fxu_value_sold: 0,
          fxu_value_remaining: 999999999,
          week_resets_at: null,
          has_credit: false,
          fxu_exhausted: false,
        });
      } else if (result?.success && result?.monthly_limit_enabled) {
        setMonthlySales({
          enabled: true,
          vip_unlimited: false,
          monthly_limit: (result.monthly_limit as number) ?? 0,
          user_points: (result.user_points as number) || 0,
          fxu_spent: (result.fxu_spent as number) || 0,
          fxu_earned: (result.fxu_earned as number) || 0,
          fxu_credit: (result.fxu_credit as number) || 0,
          metal_sold: (result.metal_sold as number) || 0,
          crystal_sold: (result.crystal_sold as number) || 0,
          deuterium_sold: (result.deuterium_sold as number) || 0,
          metal_remaining: (result.metal_remaining as number) || 0,
          crystal_remaining: (result.crystal_remaining as number) || 0,
          deuterium_remaining: (result.deuterium_remaining as number) || 0,
          ships_value_sold: (result.ships_value_sold as number) || 0,
          ships_value_remaining: (result.ships_value_remaining as number) || 0,
          fxu_limit: (result.fxu_limit as number) || 0,
          fxu_value_sold: (result.fxu_value_sold as number) || 0,
          fxu_value_remaining: (result.fxu_value_remaining as number) || 0,
          week_resets_at: (result.week_resets_at as string) || null,
          has_credit: (result.has_credit as boolean) || false,
          fxu_exhausted: (result.fxu_exhausted as boolean) || false,
        });
      } else if (result?.success && result?.monthly_limit_enabled === false) {
        setMonthlySales({
          enabled: false,
          vip_unlimited: false,
          monthly_limit: 0,
          user_points: 0,
          fxu_spent: 0,
          fxu_earned: 0,
          fxu_credit: 0,
          metal_sold: 0,
          crystal_sold: 0,
          deuterium_sold: 0,
          metal_remaining: 0,
          crystal_remaining: 0,
          deuterium_remaining: 0,
          ships_value_sold: 0,
          ships_value_remaining: 0,
          fxu_limit: 0,
          fxu_value_sold: 0,
          fxu_value_remaining: 0,
          week_resets_at: null,
          has_credit: false,
          fxu_exhausted: false,
        });
      } else {
        setMonthlySales(null);
      }
    } catch (err) {
      console.error('Exception loading weekly sales limits:', err);
      setMonthlySales(null);
    } finally {
      setMonthlySalesLoading(false);
    }
  };

  const loadBuyOffers = async () => {
    // [MKTANON1] Ofertas de compra anonimas
    const { data } = await supabase.rpc('get_market_buy_offers_public');
    const rows = (Array.isArray(data) ? data : []) as Array<Omit<BuyOffer, 'buyer_id'> & { is_mine: boolean; priority: number }>;
    const offers: BuyOffer[] = rows.map(o => ({
      ...o,
      buyer_id: o.is_mine && profile ? profile.id : '',
      buyer: { username: o.is_mine ? 'Tú' : 'Anónimo', rank_position: o.priority },
      buyer_is_plus: !!o.buyer_is_plus,
    }));

    // Orden: VIP primero, luego mejor ranking, luego mas recientes
    offers.sort(
      (a, b) =>
        comparePriority(
          !!a.buyer_is_plus,
          a.buyer?.rank_position,
          !!b.buyer_is_plus,
          b.buyer?.rank_position
        ) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    );

    setBuyOffers(offers);
  };

  const loadMyBuyOffers = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('market_buy_offers')
      .select('*')
      .eq('buyer_id', profile.id)
      .order('created_at', { ascending: false });

    setMyBuyOffers(data || []);
  };

  const purchaseSupplyBox = async (boxCode: string) => {
    if (!currentPlanet || !profile) {
      setError(t.common.selectPlanet);
      return;
    }
    if (purchasingBoxRef.current) return;
    purchasingBoxRef.current = true;

    setPurchasingBox(boxCode);
    setError(null);

    try {
      // Refresh live TUNG price so the displayed/charged cost is up to date.
      const { data: priceData } = await supabase.rpc('get_live_tung_price_usd');
      if (priceData != null) setTungPriceUsd(Number(priceData));

      const { data, error: rpcError } = await supabase.rpc('purchase_supply_box', {
        p_box_code: boxCode,
        p_planet_id: currentPlanet.id
      });

      if (rpcError) throw rpcError;

      if (data?.success) {
        setSuccess(data.message);
        refreshProfile();
        fetchResources();
        loadSupplyBoxes();
      } else {
        setError(data?.error || t.market.errorPurchasing || 'Error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.market.errorPurchasing || 'Error');
    } finally {
      purchasingBoxRef.current = false;
      setPurchasingBox(null);
      setTimeout(() => { setSuccess(null); setError(null); }, 5000);
    }
  };

  const getItemName = (type: string, code: string): string => {
    if (type === 'resource') return RESOURCE_LABELS[code] || code;
    if (type === 'dark_matter') return t.market.darkMatter;
    if (type === 'colony') return code;
    if (type === 'blueprint') {
      const bp = blueprintTypes.find(b => b.code === code);
      return bp?.name || code;
    }
    const ship = shipTypes.find(s => s.code === code);
    return ship ? translateShipName(t, code, ship.name) : code;
  };

  const getShipImageUrl = (code: string): string | undefined => {
    const ship = shipTypes.find(s => s.code === code);
    return getShipImage(code, ship?.image_url) || undefined;
  };

  // Imagen del item segun su tipo (recurso / nave / plano)
  const getItemImageUrl = (type: string, code: string): string | undefined => {
    if (type === 'resource') return RESOURCE_IMAGES[code];
    if (type === 'blueprint') return BLUEPRINT_IMAGE;
    if (type === 'ship') return getShipImageUrl(code);
    return undefined;
  };

  const getShipResourceValue = (code: string): number => {
    const ship = shipTypes.find(s => s.code === code);
    if (!ship) return 0;
    return (ship.metal_cost || 0) + (ship.crystal_cost || 0) + (ship.deuterium_cost || 0);
  };

  // Minimum price per unit (anti-dump). For resources & ships the floor is the
  // dynamic market reference (20% below the average of other active listings).
  const isBelowMinPrice = (): boolean => {
    if (newListing.type !== 'resource' && newListing.type !== 'ship') return false;
    if (!priceRef) return false;
    return newListing.pricePerUnit > 0 && newListing.pricePerUnit < priceRef.min_price;
  };

  // Igual que isBelowMinPrice pero para el formulario de ofertas de compra.
  const isBuyOfferBelowMinPrice = (): boolean => {
    if (newBuyOffer.type !== 'resource' && newBuyOffer.type !== 'ship') return false;
    if (!buyPriceRef) return false;
    return newBuyOffer.pricePerUnit > 0 && newBuyOffer.pricePerUnit < buyPriceRef.min_price;
  };

  // Maximum price per unit (anti-inflation). Only applies when there is a market
  // reference (20% above the average of other active listings).
  const isAboveMaxPrice = (): boolean => {
    if (newListing.type !== 'resource' && newListing.type !== 'ship') return false;
    if (!priceRef || priceRef.max_price == null) return false;
    return newListing.pricePerUnit > 0 && newListing.pricePerUnit > priceRef.max_price;
  };

  // Igual que isAboveMaxPrice pero para el formulario de ofertas de compra.
  const isBuyOfferAboveMaxPrice = (): boolean => {
    if (newBuyOffer.type !== 'resource' && newBuyOffer.type !== 'ship') return false;
    if (!buyPriceRef || buyPriceRef.max_price == null) return false;
    return newBuyOffer.pricePerUnit > 0 && newBuyOffer.pricePerUnit > buyPriceRef.max_price;
  };

  const getMonthlyRemaining = (): number | null => {
    if (!monthlySales || !monthlySales.enabled) return null;
    if (monthlySales.vip_unlimited) return null;
    // Credit mode with remaining TUNG: no unit limit, only TUNG credit limit applies
    if (monthlySales.has_credit && !monthlySales.fxu_exhausted) return null;
    if (newListing.type === 'resource') {
      const key = newListing.itemCode as 'metal' | 'crystal' | 'deuterium';
      return monthlySales[`${key}_remaining`] ?? null;
    }
    if (newListing.type === 'ship') {
      const shipValue = getShipResourceValue(newListing.itemCode);
      if (shipValue <= 0) return null;
      return Math.floor(monthlySales.ships_value_remaining / shipValue);
    }
    return null;
  };

  const getMonthlySold = (): number | null => {
    if (!monthlySales || !monthlySales.enabled) return null;
    if (newListing.type === 'resource') {
      const key = newListing.itemCode as 'metal' | 'crystal' | 'deuterium';
      return monthlySales[`${key}_sold`] ?? null;
    }
    if (newListing.type === 'ship') {
      const shipValue = getShipResourceValue(newListing.itemCode);
      if (shipValue <= 0) return null;
      return Math.floor(monthlySales.ships_value_sold / shipValue);
    }
    return null;
  };

  const getAvailableQuantity = (): number => {
    if (newListing.type === 'dark_matter') {
      return profile?.dark_matter || 0;
    }

    if (!currentPlanet || !resources) return 0;

    if (newListing.type === 'resource') {
      switch (newListing.itemCode) {
        case 'metal': return Math.floor(resources.metal);
        case 'crystal': return Math.floor(resources.crystal);
        case 'deuterium': return Math.floor(resources.deuterium);
        default: return 0;
      }
    } else {
      const ship = ships.find(s => s.ship_type?.code === newListing.itemCode);
      return ship?.quantity || 0;
    }
  };

  const getCreditMaxQuantity = (): number | null => {
    if (!monthlySales || !monthlySales.enabled || !monthlySales.has_credit) return null;
    if (monthlySales.vip_unlimited) return null;
    if (newListing.pricePerUnit <= 0) return null;
    const fxuRemaining = monthlySales.fxu_value_remaining;
    return Math.floor(fxuRemaining / newListing.pricePerUnit);
  };

  const getEffectiveMaxQuantity = (): number => {
    const available = getAvailableQuantity();
    const monthlyRem = getMonthlyRemaining();
    const creditMax = getCreditMaxQuantity();
    
    // When TUNG credit is exhausted, both modes apply - user can use EITHER
    if (monthlySales?.fxu_exhausted && monthlyRem !== null) {
      // Credit exhausted: use unit limit (creditMax would be 0)
      return Math.min(available, monthlyRem);
    }
    
    if (monthlyRem !== null && creditMax !== null) {
      // Both modes: use the LARGER allowance
      return Math.min(available, Math.max(monthlyRem, creditMax));
    }
    if (monthlyRem !== null) return Math.min(available, monthlyRem);
    if (creditMax !== null) return Math.min(available, creditMax);
    return available;
  };

  const getAvailableStock = (listingType: string, itemCode: string): number => {
    if (listingType === 'dark_matter') {
      return profile?.dark_matter || 0;
    }
    if (!currentPlanet || !resources) return 0;
    if (listingType === 'resource') {
      switch (itemCode) {
        case 'metal': return Math.floor(resources.metal);
        case 'crystal': return Math.floor(resources.crystal);
        case 'deuterium': return Math.floor(resources.deuterium);
        default: return 0;
      }
    }
    const ship = ships.find(s => s.ship_type?.code === itemCode);
    return ship?.quantity || 0;
  };

  const getCooldownRemaining = useCallback((listing: MarketListing): number => {
    const purchasableTime = new Date(listing.purchasable_at).getTime();
    return Math.max(0, Math.ceil((purchasableTime - nowTick) / 1000));
  }, [nowTick]);

  const formatCooldown = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const filteredListings = useMemo(() => {
    // La materia oscura fue retirada del juego: no se muestra en el mercado
    let result = listings.filter(l => l.listing_type !== 'dark_matter');

    if (filterType !== 'all') {
      result = result.filter(l => l.listing_type === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(l => {
        const itemName = getItemName(l.listing_type, l.item_code).toLowerCase();
        return itemName.includes(query);
      });
    }

    const byPriority = (a: MarketListing, b: MarketListing) =>
      comparePriority(
        !!a.seller_is_plus,
        a.seller?.rank_position,
        !!b.seller_is_plus,
        b.seller?.rank_position
      );

    if (sortType === 'price_low') {
      result.sort((a, b) => (a.price_per_unit - b.price_per_unit) || byPriority(a, b));
    } else if (sortType === 'price_high') {
      result.sort((a, b) => (b.price_per_unit - a.price_per_unit) || byPriority(a, b));
    } else {
      // [MKTORD1] Orden por defecto: VIP primero; dentro de cada grupo, las mas nuevas primero
      result.sort(
        (a, b) =>
          (a.seller_is_plus === b.seller_is_plus ? 0 : a.seller_is_plus ? -1 : 1) ||
          (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      );
    }

    return result;
  }, [listings, filterType, searchQuery, sortType, shipTypes, blueprintTypes, t]);

  const totalPages = Math.ceil(filteredListings.length / itemsPerPage);
  const paginatedListings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredListings.slice(start, start + itemsPerPage);
  }, [filteredListings, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, searchQuery, sortType, itemsPerPage]);

  const handleCreateListing = async () => {
    if (!profile) return;

    // [MKTSELL1] Naves solo VIP cuando los limites semanales estan activos (igual que el backend)
    if (newListing.type === 'ship' && !isPlus && monthlySales?.enabled === true) {
      setError(t.market.shipVipRequiredDesc);
      return;
    }

    setProcessing(true);
    setError(null);

    // El precio enviado es SIEMPRE el que el jugador tiene escrito en el campo.
    const parsedPrice = parseFloat(priceInputStr.replace(',', '.'));
    const priceToSend = Number.isFinite(parsedPrice) ? parsedPrice : newListing.pricePerUnit;

    try {
      const { data, error: rpcError } = await supabase.rpc('create_market_listing', {
        p_listing_type: newListing.type,
        p_item_code: newListing.itemCode,
        p_quantity: newListing.quantity,
        p_price_per_unit: priceToSend,
        p_planet_id: newListing.type === 'dark_matter' ? null : currentPlanet?.id,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; message?: string; requires_telegram?: boolean };

      if (!result.success) {
        if (result.requires_telegram) {
          setTelegramLinked(false);
        }
        setError(result.error || t.market.unknownError);
        return;
      }

      setSuccess(result.message || t.market.listingCreatedSuccess);
      // [MKTSELL1] Si el item no cambia, el efecto de precio no se re-ejecuta: reusar el sugerido
      const keepRef = newListing.type === 'resource' && newListing.itemCode === 'metal' && priceRef;
      const resetPrice = keepRef ? priceRef.suggested_price : 1;
      setNewListing({ type: 'resource', itemCode: 'metal', quantity: 0, pricePerUnit: resetPrice });
      setPriceInputStr(String(resetPrice));
      refreshProfile();
      if (currentPlanet) {
        fetchResources(currentPlanet.id);
        fetchShips(currentPlanet.id);
      }
      loadListings();
      loadMonthlySales();
    } catch (err) {
      console.error('Error creating listing:', err);
      setError(t.market.errorCreatingListing);
    } finally {
      setProcessing(false);
    }
  };

  // [COLMKT7] Misma regla que validate_fleet_mission: max = 1 + FLOOR((astrofisica + 1) / 2)
  const loadColonySlots = async (userId: string) => {
    try {
      const [planetsRes, techRes] = await Promise.all([
        supabase.from('planets').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('planet_type', 'planet').eq('is_destroyed', false),
        supabase.from('user_technologies').select('level, technology_type:technology_types(code)')
          .eq('user_id', userId),
      ]);
      if (planetsRes.error || techRes.error || planetsRes.count === null) return;
      const techs = (techRes.data || []) as unknown as { level: number | null; technology_type: { code: string } | null }[];
      const astro = techs.find((r) => r.technology_type?.code === 'astrophysics')?.level || 0;
      setColonySlots({ owned: planetsRes.count, max: 1 + Math.floor((astro + 1) / 2), astro });
    } catch (err) {
      console.error('Error loading colony slots:', err);
    }
  };

  const openBuyModal = (listing: MarketListing) => {
    setBuyModal({
      listing,
      quantity: listing.quantity,
    });
    setColonySlots(null);
    if (listing.listing_type === 'colony' && profile) loadColonySlots(profile.id);
  };

  const handleBuyListing = async () => {
    if (!profile || !currentPlanet || !buyModal) return;

    const { listing, quantity } = buyModal;

    setProcessing(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('purchase_market_listing', {
        p_listing_id: listing.id,
        p_quantity: quantity,
        p_buyer_planet_id: currentPlanet?.id || null,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; message?: string; quantity?: number; total_price?: number; requires_telegram?: boolean };

      if (!result.success) {
        if (result.requires_telegram) {
          setTelegramLinked(false);
        }
        setError(result.error || t.market.unknownError);
        loadListings();
        setBuyModal(null);
        return;
      }

      setSuccess(listing.listing_type === 'colony' ? (result.message || 'Sub-Ciudad comprada') : t.market.purchaseSuccess);
      refreshProfile();
      fetchResources(currentPlanet.id);
      fetchShips(currentPlanet.id);
      if (listing.listing_type === 'colony') fetchPlanets(profile.id);
      loadListings();
      setBuyModal(null);
    } catch (err) {
      console.error('Error buying listing:', err);
      setError(t.market.errorPurchasing);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelListing = async (listing: MarketListing) => {
    if (!profile) return;

    setProcessing(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_market_listing', {
        p_listing_id: listing.id,
        p_return_planet_id: listing.planet_id || currentPlanet?.id || null,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        setError(result.error || t.market.unknownError);
        loadMyListings();
        return;
      }

      setSuccess(result.message || t.market.listingCancelledSuccess);
      if (listing.listing_type === 'colony') window.dispatchEvent(new Event(COLONY_LISTING_CHANGED_EVENT));
      refreshProfile();
      if (currentPlanet) {
        fetchResources(currentPlanet.id);
        fetchShips(currentPlanet.id);
      }
      loadMyListings();
      loadMonthlySales();
    } catch (err) {
      console.error('Error cancelling listing:', err);
      setError(t.market.errorCancellingListing);
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateBuyOffer = async () => {
    if (!profile) return;

    setProcessing(true);
    setError(null);

    // El precio enviado es SIEMPRE el que el jugador tiene escrito en el campo.
    const parsedBuyPrice = parseFloat(buyOfferPriceStr.replace(',', '.'));
    const buyPriceToSend = Number.isFinite(parsedBuyPrice) ? parsedBuyPrice : newBuyOffer.pricePerUnit;

    try {
      const { data, error: rpcError } = await supabase.rpc('create_buy_offer', {
        p_listing_type: newBuyOffer.type,
        p_item_code: newBuyOffer.itemCode,
        p_quantity: newBuyOffer.quantity,
        p_price_per_unit: buyPriceToSend,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; message?: string; requires_telegram?: boolean };

      if (!result.success) {
        if (result.requires_telegram) setTelegramLinked(false);
        setError(result.error || t.market.unknownError);
        return;
      }

      setSuccess(result.message || t.market.buyOfferCreated);
      setNewBuyOffer({ type: 'resource', itemCode: 'metal', quantity: 0, pricePerUnit: 1 });
      setBuyOfferPriceStr('1');
      refreshProfile();
      loadBuyOffers();
    } catch (err) {
      console.error('Error creating buy offer:', err);
      setError(t.market.errorCreatingBuyOffer);
    } finally {
      setProcessing(false);
    }
  };

  const handleFulfillBuyOffer = async () => {
    if (!profile || !currentPlanet || !fulfillModal) return;

    const { offer, quantity } = fulfillModal;

    setProcessing(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('fulfill_buy_offer', {
        p_offer_id: offer.id,
        p_quantity: quantity,
        p_planet_id: offer.listing_type === 'dark_matter' ? null : currentPlanet.id,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; requires_telegram?: boolean; fxu_received?: number; quantity_filled?: number; was_capped?: boolean; weekly_remaining?: number | null };

      if (!result.success) {
        if (result.requires_telegram) setTelegramLinked(false);
        setError(result.error || t.market.unknownError);
        loadBuyOffers();
        setFulfillModal(null);
        return;
      }

      let msg = t.market.fulfillSuccess;
      if (result.fxu_received) msg += ` (+${formatNumber(result.fxu_received)} TUNG)`;
      if (result.was_capped && result.quantity_filled) msg += ` - ${t.market.partialSale}: ${formatNumber(result.quantity_filled)}`;
      setSuccess(msg);
      refreshProfile();
      fetchResources(currentPlanet.id);
      fetchShips(currentPlanet.id);
      loadBuyOffers();
      loadMonthlySales();
      setFulfillModal(null);
    } catch (err) {
      console.error('Error fulfilling buy offer:', err);
      setError(t.market.errorFulfilling);
    } finally {
      setProcessing(false);
    }
  };

  const openFulfillModal = async (offer: BuyOffer) => {
    const stock = getAvailableStock(offer.listing_type, offer.item_code);
    const remainingQty = offer.quantity - offer.quantity_filled;
    let monthlyRemaining: number | null = null;
    let monthlyLimit: number | null = null;
    let monthlySold: number | null = null;

    let creditMaxQty: number | null = null;

    if (offer.listing_type === 'resource' || offer.listing_type === 'ship') {
      const { data } = await supabase.rpc('get_my_monthly_market_sales');
      const result = data as { success?: boolean; monthly_limit_enabled?: boolean; vip_unlimited?: boolean; has_credit?: boolean; fxu_exhausted?: boolean; fxu_value_remaining?: number; [key: string]: unknown } | null;
      if (result?.success && result?.vip_unlimited) {
        // VIP Plus: no limits, skip all caps
      } else if (result?.success && result?.monthly_limit_enabled) {
        if (result?.has_credit && !result?.fxu_exhausted) {
          // Credit mode with remaining: cap by TUNG remaining / price
          const fxuRem = (result.fxu_value_remaining as number) ?? 0;
          if (offer.price_per_unit > 0) {
            creditMaxQty = Math.floor(fxuRem / offer.price_per_unit);
          }
        } else if (offer.listing_type === 'resource') {
          // No credit or credit exhausted: use unit limit
          const key = offer.item_code as 'metal' | 'crystal' | 'deuterium';
          monthlyRemaining = (result[`${key}_remaining`] as number) ?? null;
          monthlyLimit = (result.monthly_limit as number) ?? null;
          monthlySold = (result[`${key}_sold`] as number) ?? null;
        }
      }
    }

    let effectiveMax = monthlyRemaining !== null
      ? Math.min(remainingQty, stock, monthlyRemaining)
      : Math.min(remainingQty, stock);
    if (creditMaxQty !== null) {
      effectiveMax = Math.min(effectiveMax, creditMaxQty);
    }

    setFulfillModal({
      offer,
      quantity: Math.max(1, effectiveMax),
      monthlyRemaining,
      monthlyLimit,
      monthlySold,
    });
  };

  const handleCancelBuyOffer = async (offer: BuyOffer) => {
    if (!profile) return;

    setProcessing(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_buy_offer', {
        p_offer_id: offer.id,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        setError(result.error || t.market.unknownError);
        return;
      }

      setSuccess(result.message || t.market.buyOfferCancelled);
      refreshProfile();
      loadMyBuyOffers();
      loadBuyOffers();
    } catch (err) {
      console.error('Error cancelling buy offer:', err);
      setError(t.market.errorCancellingBuyOffer);
    } finally {
      setProcessing(false);
    }
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'browse', label: t.market.browse, icon: <Store className="w-5 h-5" /> },
    { key: 'sell', label: t.market.sell, icon: <Plus className="w-5 h-5" /> },
    // Ofertas de compra CERRADAS: pestanas ocultas. Las ofertas ya existentes
    // siguen visibles y cancelables desde "Mis publicaciones".
    { key: 'supply_boxes', label: t.market.supplyBoxes, icon: <Box className="w-5 h-5" /> },
    { key: 'shipyard', label: 'Barraca', icon: <Swords className="w-5 h-5" /> },
    ...(heroAccess ? [{ key: 'hero_items' as TabType, label: 'Estandarte Imperial', icon: <Gem className="w-5 h-5" /> }] : []),
  ];

  const tabs2: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'my_listings', label: t.market.myListings, icon: <Package className="w-5 h-5" /> },
    { key: 'history', label: t.market.history, icon: <History className="w-5 h-5" /> },
  ];

  const renderItemTypeSelect = () => (
    <div>
      <label className="block text-sm text-gray-400 mb-2">{t.market.itemType}</label>
      <select
        value={sellColonyMode ? 'colony' : newListing.type}
        onChange={(e) => {
          if (e.target.value === 'colony') {
            setSellColonyMode(true);
            return;
          }
          setSellColonyMode(false);
          const type = e.target.value as ListingType;
          let itemCode = 'metal';
          if (type === 'ship') itemCode = shipTypes[0]?.code || '';
          else if (type === 'dark_matter') itemCode = 'dark_matter';
          setNewListing((prev) => ({ ...prev, type, itemCode }));
        }}
        className="w-full bg-space-700 border border-space-600 rounded-lg px-4 py-3 text-white"
      >
        <option value="resource" className="bg-space-800 text-white">{t.market.resource}</option>
        <option value="ship" className="bg-space-800 text-white">{t.market.ship}{!isPlus ? ' (VIP)' : ''}</option>
        <option value="colony" className="bg-space-800 text-white">Sub-Ciudad{!isPlus ? ' (VIP)' : ''}</option>
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Store className="w-8 h-8 text-cyber-yellow" />
          {t.market.title}
        </h1>
        <div className="flex items-center gap-2 bg-space-700 px-4 py-2 rounded-lg">
          <Coins className="w-5 h-5 text-cyber-yellow" />
          <span className="text-gray-400">{t.market.fxuBalance}:</span>
          <span className="font-orbitron text-cyber-yellow">{formatNumber(profile?.tung_balance || 0)}</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-500/20 border border-green-500 text-green-400 px-4 py-3 rounded-lg flex items-center gap-2">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {profile?.vacation_mode && (
        <div className="bg-amber-500/20 border border-amber-500 rounded-lg p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🏖️</span>
            </div>
            <div>
              <h3 className="text-amber-400 font-bold text-lg">{t.market.vacationModeTitle}</h3>
              <p className="text-amber-300/70 text-sm">{t.market.vacationModeDesc}</p>
            </div>
          </div>
        </div>
      )}

      {telegramLinked === false && !profile?.vacation_mode && (
        <div className="bg-cyan-500/20 border border-cyan-500 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <MessageCircle className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-cyan-400 font-semibold mb-1">{t.market.telegramRequiredTitle}</h3>
              <p className="text-gray-300 text-sm mb-3">
                {t.market.telegramRequiredDesc}
              </p>
              <button
                onClick={() => navigate('/game/tasks')}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                {t.market.goToTasksForTelegram}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-cyber-yellow text-space-900'
                : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <a
          href="https://falcoxswap.com/?inputCurrency=BNB&outputCurrency=0x09514EcF8270C12101D077B5e8B034B164F71C5f"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap bg-gradient-to-r from-cyan-600 to-cyan-500 text-white hover:from-cyan-500 hover:to-cyan-400"
        >
          <img src="https://photos.pinksale.finance/file/pinksale-logo-upload/1768287934637-7d493aae390e834e9654df6d97b11a99.jpg" alt="TUNG" className="w-5 h-5 rounded-full object-cover" />
          {t.market.buyFxu}
          <ExternalLink className="w-4 h-4" />
        </a>
        {tabs2.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-cyber-yellow text-space-900'
                : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card-glass overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-cyber-yellow/30 border-t-cyber-yellow rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'browse' && (
              <div>
                <div className="p-4 border-b border-space-700 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t.market.searchPlaceholder}
                        className="w-full pl-10 pr-4 py-2 bg-space-700 border border-space-600 rounded-lg text-white placeholder-gray-500 focus:border-cyber-yellow focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Filter className="w-5 h-5 text-gray-400" />
                        <div className="flex gap-1 flex-wrap">
                          {(['all', 'resource', 'ship', 'blueprint', 'colony'] as FilterType[]).map((type) => (
                            <button
                              key={type}
                              onClick={() => setFilterType(type)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                filterType === type
                                  ? 'bg-cyber-yellow text-space-900'
                                  : 'bg-space-600 text-gray-400 hover:bg-space-500'
                              }`}
                            >
                              {type === 'all' ? t.market.filterAll :
                               type === 'resource' ? t.market.resource :
                               type === 'ship' ? t.market.ship :
                               type === 'blueprint' ? 'Planos' :
                               type === 'colony' ? 'Sub-Ciudades' : t.market.darkMatter}
                            </button>
                          ))}
                        </div>
                      </div>
                      <select
                        value={sortType}
                        onChange={(e) => setSortType(e.target.value as SortType)}
                        className="bg-space-700 border border-space-600 rounded-lg px-3 py-1.5 text-sm text-white focus:border-cyber-yellow focus:outline-none"
                      >
                        <option value="newest" className="bg-space-800">{t.market.sortNewest}</option>
                        <option value="price_low" className="bg-space-800">{t.market.sortPriceLow}</option>
                        <option value="price_high" className="bg-space-800">{t.market.sortPriceHigh}</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm text-gray-400">
                    <span>{t.market.showingResults.replace('{count}', String(filteredListings.length)).replace('{total}', String(listings.length))}</span>
                    {totalPages > 1 && (
                      <span>{t.market.page} {currentPage} / {totalPages}</span>
                    )}
                  </div>
                </div>

                <div className="p-3 sm:p-4">
                  {paginatedListings.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      {searchQuery || filterType !== 'all' ? t.market.noMatchingListings : t.market.noListings}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {paginatedListings.map(listing => {
                      const cooldownSecs = getCooldownRemaining(listing);
                      const isInCooldown = cooldownSecs > 0;
                      const acc = LISTING_ACCENTS[listing.listing_type] ?? LISTING_ACCENTS.ship;
                      const isOwn = listing.seller_id === profile?.id;
                      return (
                      <div
                        key={listing.id}
                        className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${acc.card} ${isInCooldown ? 'opacity-90' : ''}`}
                      >
                        {/* Orbe difuso de fondo */}
                        <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-60 transition-opacity duration-300 group-hover:opacity-100 ${acc.orb}`} />
                        {/* Rejilla sutil */}
                        <div
                          className="pointer-events-none absolute inset-0 opacity-[0.06]"
                          style={{
                            backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)',
                            backgroundSize: '22px 22px',
                          }}
                        />
                        {/* Destello diagonal al pasar el mouse */}
                        <div className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 blur-md transition-all duration-700 group-hover:left-[130%] group-hover:opacity-100" />

                        <div className="relative flex flex-col">
                          {/* Foto grande del item */}
                          {(() => {
                            const img = listing.listing_type === 'colony' ? getColonyImage(listing) : getItemImageUrl(listing.listing_type, listing.item_code);
                            return (
                              <div className={`relative h-36 sm:h-40 w-full overflow-hidden bg-gradient-to-br ${acc.tile}`}>
                                <div className={`pointer-events-none absolute inset-0 blur-2xl opacity-50 ${acc.orb}`} />
                                {img ? (
                                  <GameMedia
                                    src={img}
                                    alt={getItemName(listing.listing_type, listing.item_code)}
                                    className="relative w-full h-full object-contain p-2 drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)] transition-transform duration-500 group-hover:scale-[1.07]"
                                  />
                                ) : (
                                  <div className="relative w-full h-full flex items-center justify-center">
                                    {listing.listing_type === 'dark_matter' ? (
                                      <Sparkles className={`w-16 h-16 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                    ) : listing.listing_type === 'resource' ? (
                                      <Package className={`w-16 h-16 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                    ) : listing.listing_type === 'blueprint' ? (
                                      <Tag className={`w-16 h-16 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                    ) : listing.listing_type === 'colony' ? (
                                      <Globe className={`w-16 h-16 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                    ) : (
                                      <ShipIcon
                                        imageUrl={undefined}
                                        name={getItemName(listing.listing_type, listing.item_code)}
                                        className="w-16 h-16"
                                        iconClassName={`w-16 h-16 ${acc.text}`}
                                      />
                                    )}
                                  </div>
                                )}
                                {/* Degradado inferior para fundir con la tarjeta */}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-space-900/95 to-transparent" />
                                {/* Etiqueta de tipo */}
                                <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border font-medium backdrop-blur-sm ${acc.badge}`}>
                                  {acc.label}
                                </span>
                                {/* Cantidad (en colonias: indicador de luna) */}
                                {listing.listing_type === 'colony' ? (
                                  listing.planet_id && colonyInfo[listing.planet_id]?.has_moon ? (
                                    <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border border-indigo-400/40 bg-black/50 text-indigo-200 backdrop-blur-sm flex items-center gap-1">
                                      <Moon className="w-3 h-3" /> Incluye luna
                                    </span>
                                  ) : null
                                ) : (
                                <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/50 text-white font-mono backdrop-blur-sm">
                                  x{formatNumber(listing.quantity)}
                                </span>
                                )}
                              </div>
                            );
                          })()}

                          <div className="p-3.5 sm:p-4 pt-2.5 flex flex-col gap-3">
                          {/* Cabecera */}
                          <div className="min-w-0">
                            <p className="text-white font-orbitron text-sm sm:text-base truncate">
                              {getItemName(listing.listing_type, listing.item_code)}
                            </p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {t.market.seller}: <span className="text-cyber-blue">{listing.seller?.username}</span>
                            </p>
                            {listing.listing_type === 'colony' && listing.planet_id && colonyInfo[listing.planet_id] && (
                              <p className="text-[11px] text-indigo-300/90 truncate mt-0.5">
                                {colonyInfo[listing.planet_id].name} · Campos {colonyInfo[listing.planet_id].fields_used}/{colonyInfo[listing.planet_id].fields_max}
                              </p>
                            )}
                            {listing.listing_type === 'colony' && listing.planet_id && colonyInfo[listing.planet_id] && (
                              <ColonyDepositsInfo deposits={colonyInfo[listing.planet_id].deposits} compact />
                            )}
                            {listing.listing_type === 'colony' && listing.planet_id && (
                              <button
                                type="button"
                                onClick={() => setBuildingsListing(listing)}
                                className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/10 text-indigo-200 text-xs font-orbitron tracking-wide hover:bg-indigo-500/20 hover:border-indigo-300/70 hover:shadow-[0_0_14px_-4px_rgba(129,140,248,0.8)] transition-all"
                              >
                                <Building2 className="w-3.5 h-3.5" />
                                Ver edificios
                              </button>
                            )}
                          </div>

                          {/* Precio */}
                          <div className="rounded-lg border border-white/5 bg-space-900/50 px-3 py-2 flex items-end justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wider text-gray-500">{t.market.fxuCurrency}</p>
                              <p className="text-cyber-yellow font-orbitron text-lg sm:text-xl leading-tight drop-shadow-[0_0_8px_rgba(250,204,21,0.35)] truncate">
                                {formatNumber(listing.total_price)}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {listing.listing_type !== 'colony' && (
                                <p className="text-[11px] text-gray-300 font-mono whitespace-nowrap">{listing.price_per_unit} /u</p>
                              )}
                              <p className="text-[10px] text-red-400/90 whitespace-nowrap">
                                {t.market.fee}: {listing.seller_fee_percent ?? MARKET_FEE_PERCENT}%
                                {listing.seller_is_plus && <span className="ml-1 text-cyber-yellow">(VIP)</span>}
                              </p>
                            </div>
                          </div>

                          {/* Accion */}
                          {isInCooldown ? (
                            <div className="w-full px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-center gap-2">
                              <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                              <span className="font-orbitron text-sm text-amber-400">{formatCooldown(cooldownSecs)}</span>
                              <span className="text-[10px] text-amber-400/70">{t.market.cooldownActive}</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => openBuyModal(listing)}
                              disabled={processing || isOwn}
                              className={`w-full py-2.5 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r disabled:bg-none disabled:bg-space-700 disabled:text-gray-500 disabled:shadow-none hover:brightness-110 active:scale-[0.98] ${acc.btn}`}
                            >
                              <ShoppingCart className="w-4 h-4" />
                              {t.market.buy}
                            </button>
                          )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                    </div>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="p-4 border-t border-space-700 flex justify-center items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 bg-space-700 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-gray-400 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <ChevronLeft className="w-4 h-4 -ml-2" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2 bg-space-700 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-gray-400 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                              currentPage === pageNum
                                ? 'bg-cyber-yellow text-space-900'
                                : 'bg-space-700 text-gray-400 hover:bg-space-600'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 bg-space-700 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-gray-400 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 bg-space-700 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-gray-400 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <ChevronRight className="w-4 h-4 -ml-2" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'sell' && (
              <div className="p-6 space-y-6">
                {monthlySales?.enabled === false && !isPlus && (
                  <div className="bg-emerald-500/20 border border-emerald-500 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-emerald-400 font-medium">{t.market.openMarketTitle}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {t.market.openMarketDesc.replace('{fee}', String(MARKET_FEE_PERCENT))}
                      </p>
                    </div>
                  </div>
                )}
                {/* [MKTPTS1] Cupo semanal de venta de recursos segun puntos de ranking */}
                {monthlySales?.enabled !== false && isPlus && (
                  <div className="relative overflow-hidden rounded-xl border border-amber-400/60 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15 p-4 flex items-center gap-3">
                    <div className="pointer-events-none absolute -top-8 -right-8 w-28 h-28 rounded-full bg-amber-400/20 blur-3xl" />
                    <Crown className="w-6 h-6 text-amber-300 flex-shrink-0" />
                    <div className="relative">
                      <p className="text-amber-300 font-orbitron font-medium">{t.market.vipUnlimitedTitle}</p>
                      <p className="text-gray-300 text-sm mt-0.5">{t.market.vipUnlimitedDesc}</p>
                    </div>
                  </div>
                )}
                {monthlySales?.enabled !== false && !isPlus && (
                  <div className="relative overflow-hidden rounded-xl border border-cyan-500/40 bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 p-4">
                    <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-cyan-500/20 blur-3xl" />
                    <div className="relative flex items-start gap-3">
                      <Trophy className="w-6 h-6 text-cyan-300 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-cyan-300 font-orbitron font-medium">{t.market.weeklyQuotaTitle}</p>
                        <p className="text-gray-400 text-sm mt-0.5">
                          {t.market.weeklyQuotaDesc
                            .replace('{points}', formatNumber(monthlySales?.user_points ?? 0))
                            .replace('{limit}', formatNumber(monthlySales?.monthly_limit ?? 0))}
                        </p>

                        <div className="mt-3 space-y-2">
                          {([
                            { code: 'metal', label: t.resources.metal, bar: 'bg-amber-400', text: 'text-amber-300' },
                            { code: 'crystal', label: t.resources.crystal, bar: 'bg-cyan-400', text: 'text-cyan-300' },
                            { code: 'deuterium', label: t.resources.deuterium, bar: 'bg-purple-400', text: 'text-purple-300' },
                          ] as const).map((r) => {
                            const limit = Math.max(0, Number(monthlySales?.monthly_limit ?? 0));
                            const sold = Math.max(0, Number(monthlySales?.[`${r.code}_sold`] ?? 0));
                            const remaining = Math.max(0, Number(monthlySales?.[`${r.code}_remaining`] ?? 0));
                            const pct = limit > 0 ? Math.min(100, (sold / limit) * 100) : 100;
                            return (
                              <div key={r.code}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className={`font-medium ${r.text}`}>{r.label}</span>
                                  <span className="text-gray-400 font-mono">
                                    {formatNumber(sold)} / {formatNumber(limit)}
                                    <span className="text-gray-500"> · </span>
                                    <span className={remaining > 0 ? 'text-green-400' : 'text-red-400'}>
                                      {formatNumber(remaining)} {t.market.quotaRemaining}
                                    </span>
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-space-700 overflow-hidden">
                                  <div className={`h-full ${r.bar} transition-all`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {monthlySales?.week_resets_at && (
                          <p className="text-gray-500 text-xs mt-3 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {t.market.quotaResetsAt.replace(
                              '{date}',
                              new Date(monthlySales.week_resets_at).toLocaleString()
                            )}
                          </p>
                        )}

                        <button
                          onClick={() => navigate('/game/vip')}
                          className="mt-3 w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-500 to-yellow-500 text-space-900 hover:from-amber-400 hover:to-yellow-400 transition-all flex items-center justify-center gap-2"
                        >
                          <Crown className="w-4 h-4" />
                          {t.market.quotaUpgradeCta}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {telegramLinked === false && (
                  <div className="bg-amber-500/20 border border-amber-500 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-400 font-medium">{t.market.noOffersWithoutTelegram}</p>
                      <p className="text-gray-400 text-sm mt-1">{t.market.linkTelegramSellTab}</p>
                    </div>
                  </div>
                )}

                {sellColonyMode ? (
                  <>
                    <div className="md:w-1/2">{renderItemTypeSelect()}</div>
                    <ColonySellSection
                      isPlus={isPlus}
                      feePercent={MARKET_FEE_PERCENT}
                      disabled={processing || profile?.vacation_mode === true}
                      onCreated={(msg) => { setSuccess(msg); loadListings(); }}
                      onError={(msg) => setError(msg)}
                    />
                  </>
                ) : (<>
                {/* Vista previa del item seleccionado */}
                {(() => {
                  const acc = LISTING_ACCENTS[newListing.type] ?? LISTING_ACCENTS.ship;
                  const img = getItemImageUrl(newListing.type, newListing.itemCode);
                  return (
                    <div className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 flex items-center gap-4 p-3 sm:p-4 ${acc.card}`}>
                      <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-60 ${acc.orb}`} />
                      <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br ring-1 ${acc.tile} ${acc.ring}`}>
                        {img ? (
                          <GameMedia
                            src={img}
                            alt={getItemName(newListing.type, newListing.itemCode)}
                            className="w-full h-full object-contain p-1 transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {newListing.type === 'dark_matter'
                              ? <Sparkles className={`w-10 h-10 ${acc.text}`} />
                              : <Package className={`w-10 h-10 ${acc.text}`} />}
                          </div>
                        )}
                      </div>
                      <div className="relative min-w-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${acc.badge}`}>{acc.label}</span>
                        <p className="text-white font-orbitron text-base sm:text-lg truncate mt-1">
                          {getItemName(newListing.type, newListing.itemCode)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.market.available}: <span className="text-white font-mono">{formatNumber(getAvailableQuantity())}</span>
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid md:grid-cols-2 gap-6">
                  {renderItemTypeSelect()}

                  {newListing.type !== 'dark_matter' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        {newListing.type === 'resource' ? t.market.resource : t.market.ship}
                      </label>
                      <select
                        value={newListing.itemCode}
                        onChange={(e) => setNewListing((prev) => ({ ...prev, itemCode: e.target.value }))}
                        className="w-full bg-space-700 border border-space-600 rounded-lg px-4 py-3 text-white"
                      >
                        {newListing.type === 'resource' ? (
                          <>
                            <option value="metal" className="bg-space-800 text-white">{t.resources.metal}</option>
                            <option value="crystal" className="bg-space-800 text-white">{t.resources.crystal}</option>
                            <option value="deuterium" className="bg-space-800 text-white">{t.resources.deuterium}</option>
                          </>
                        ) : (
                          shipTypes.map(ship => (
                            <option key={ship.code} value={ship.code} className="bg-space-800 text-white">{translateShipName(t, ship.code, ship.name)}</option>
                          ))
                        )}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {t.market.quantity} ({t.market.available}: {formatNumber(getAvailableQuantity())}
                      {getMonthlyRemaining() !== null && (
                        <span className="text-amber-400"> | {t.market.weeklyLimit} {formatNumber(getMonthlyRemaining()!)}</span>
                      )}
                      {getCreditMaxQuantity() !== null && (
                        <span className="text-cyan-400"> | Max crédito: {formatNumber(getCreditMaxQuantity()!)}</span>
                      )}
                      )
                    </label>
                    <input
                      type="number"
                      value={newListing.quantity || ''}
                      onChange={(e) => setNewListing((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                      className={`w-full bg-space-700 border rounded-lg px-4 py-3 text-white ${
                        newListing.quantity > getEffectiveMaxQuantity() ? 'border-red-500' : 'border-space-600'
                      }`}
                      min="1"
                      max={getEffectiveMaxQuantity()}
                    />
                    {newListing.quantity > getEffectiveMaxQuantity() && getMonthlyRemaining() !== null && (
                      <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t.market.exceedsWeeklyLimit} {formatNumber(getMonthlyRemaining()!)}
                      </p>
                    )}
                    {newListing.quantity > getEffectiveMaxQuantity() && getCreditMaxQuantity() !== null && (
                      <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Excede tu crédito TUNG. Máximo: {formatNumber(getCreditMaxQuantity()!)} unidades ({formatNumber(Math.floor(monthlySales!.fxu_value_remaining))} TUNG restante)
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t.market.pricePerUnit} ({t.market.fxuCurrency})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={priceInputStr}
                      onChange={(e) => {
                        const val = e.target.value.replace(',', '.');
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setPriceInputStr(val);
                          const num = parseFloat(val);
                          setNewListing((prev) => ({ ...prev, pricePerUnit: isNaN(num) ? 0 : num }));
                        }
                      }}
                      className={`w-full bg-space-700 border rounded-lg px-4 py-3 text-white ${
                        isBelowMinPrice() || isAboveMaxPrice()
                          ? 'border-red-500'
                          : 'border-space-600'
                      }`}
                      placeholder="0"
                    />
                    {(newListing.type === 'resource' || newListing.type === 'ship') && priceRef && (
                      <div className="mt-2 bg-space-700/40 border border-space-600 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex justify-between text-emerald-300 font-semibold">
                          <span>
                            {priceRef.floor_basis === 'shipyard'
                              ? `Precio mínimo (Astillero $${priceRef.shipyard_usd} −30%):`
                              : 'Precio mínimo del mercado:'}
                          </span>
                          <span className="font-mono">
                            {formatNumber(priceRef.absolute_floor)} {t.market.fxuCurrency}
                            {priceRef.tung_price_usd != null && priceRef.tung_price_usd > 0 && (
                              <> (≈ ${(priceRef.absolute_floor * priceRef.tung_price_usd).toFixed(priceRef.absolute_floor * priceRef.tung_price_usd < 0.01 ? 5 : 2)})</>
                            )}
                          </span>
                        </div>
                        {priceRef.sample_count > 0 && priceRef.reference_avg != null ? (
                          <>
                            <div className="flex justify-between text-gray-300">
                              <span>Promedio del mercado:</span>
                              <span className="font-mono">{formatNumber(priceRef.reference_avg)} {t.market.fxuCurrency}</span>
                            </div>
                            <div className="flex justify-between text-amber-300">
                              <span>{priceRef.floor_basis === 'shipyard' ? 'Mínimo permitido (Astillero −30%):' : 'Mínimo permitido (−20%):'}</span>
                              <span className="font-mono">{formatNumber(priceRef.min_price)} {t.market.fxuCurrency}</span>
                            </div>
                            {priceRef.max_price != null && (
                              <div className="flex justify-between text-amber-300">
                                <span>Máximo permitido (+20%):</span>
                                <span className="font-mono">{formatNumber(priceRef.max_price)} {t.market.fxuCurrency}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex justify-between text-amber-300">
                            <span>Mínimo permitido:</span>
                            <span className="font-mono">{formatNumber(priceRef.min_price)} {t.market.fxuCurrency}</span>
                          </div>
                        )}
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setNewListing((prev) => ({ ...prev, pricePerUnit: priceRef.min_price }));
                              setPriceInputStr(String(priceRef.min_price));
                            }}
                            className="mt-1 text-blue-400 hover:text-blue-300 underline"
                          >
                            Usar mínimo
                          </button>
                          {priceRef.max_price != null && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewListing((prev) => ({ ...prev, pricePerUnit: priceRef.max_price! }));
                                setPriceInputStr(String(priceRef.max_price));
                              }}
                              className="mt-1 text-blue-400 hover:text-blue-300 underline"
                            >
                              Usar máximo
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {isBelowMinPrice() && priceRef && (
                      <div className="mt-2 bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-red-400 font-medium text-sm">
                            Precio demasiado bajo
                          </p>
                          <p className="text-red-300/80 text-xs mt-1">
                            El precio mínimo para {getItemName(newListing.type, newListing.itemCode)} es {formatNumber(priceRef.min_price)} {t.market.fxuCurrency} (20% por debajo del promedio del mercado).
                          </p>
                        </div>
                      </div>
                    )}
                    {isAboveMaxPrice() && priceRef && priceRef.max_price != null && (
                      <div className="mt-2 bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-red-400 font-medium text-sm">
                            Precio demasiado alto
                          </p>
                          <p className="text-red-300/80 text-xs mt-1">
                            El precio máximo para {getItemName(newListing.type, newListing.itemCode)} es {formatNumber(priceRef.max_price)} {t.market.fxuCurrency} (20% por encima del promedio del mercado).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-space-700/50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">{t.market.totalPrice}:</span>
                    <span className="font-mono text-white">
                      {formatNumber(newListing.quantity * newListing.pricePerUnit)} {t.market.fxuCurrency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">{t.market.marketFee} ({MARKET_FEE_PERCENT}%):</span>
                    <span className="font-mono text-red-400">
                      -{formatNumber(newListing.quantity * newListing.pricePerUnit * (MARKET_FEE_PERCENT / 100))} {t.market.fxuCurrency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-space-600 pt-3">
                    <span className="text-white font-semibold">{t.market.totalToReceive}:</span>
                    <span className="font-orbitron text-2xl text-cyber-yellow">
                      {formatNumber(newListing.quantity * newListing.pricePerUnit * (1 - MARKET_FEE_PERCENT / 100))} {t.market.fxuCurrency}
                    </span>
                  </div>
                </div>


                {(newListing.type === 'resource' || newListing.type === 'ship') && (
                  <div className="bg-space-700/50 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-amber-400 font-medium text-sm">{t.market.weeklyLimitLabel}</span>
                      </div>
                      {monthlySalesLoading ? (
                        <span className="text-xs text-gray-500">{t.market.loading}</span>
                      ) : monthlySales?.week_resets_at ? (() => {
                        const resetDate = new Date(monthlySales.week_resets_at);
                        const now = new Date();
                        const diffMs = resetDate.getTime() - now.getTime();
                        if (diffMs <= 0) return <span className="text-xs text-green-400 flex items-center gap-1"><Clock className="w-3 h-3" />{t.market.resetting}</span>;
                        const days = Math.floor(diffMs / 86400000);
                        const hours = Math.floor((diffMs % 86400000) / 3600000);
                        const label = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
                        return <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{t.market.resetIn} {label}</span>;
                      })() : null}
                    </div>
                    {monthlySalesLoading ? (
                      <div className={`grid ${newListing.type === 'resource' ? 'grid-cols-3' : 'grid-cols-1'} gap-3 text-center`}>
                        {newListing.type === 'resource' ? (
                          (['metal', 'crystal', 'deuterium'] as const).map((res) => (
                            <div key={res} className="bg-space-800/50 rounded-lg p-3 animate-pulse">
                              <span className="text-xs text-gray-400 capitalize">{RESOURCE_LABELS[res] || res}</span>
                              <div className="mt-1 w-full bg-space-900 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-space-600 w-1/2" />
                              </div>
                              <div className="mt-1 text-xs text-gray-500">-- / --</div>
                            </div>
                          ))
                        ) : (
                          <div className="bg-space-800/50 rounded-lg p-3 animate-pulse">
                            <span className="text-xs text-gray-400">{t.market.shipValueLimit}</span>
                            <div className="mt-1 w-full bg-space-900 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full bg-space-600 w-1/2" />
                            </div>
                            <div className="mt-1 text-xs text-gray-500">-- / --</div>
                          </div>
                        )}
                      </div>
                    ) : monthlySales?.enabled && monthlySales.vip_unlimited ? (
                      <div className="flex items-center gap-2 justify-center py-3 mb-1">
                        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-500/30 rounded-xl px-4 py-2">
                          <span className="text-lg">👑</span>
                          <div>
                            <p className="text-sm font-bold text-amber-300">VIP Plus: Sin límite de ventas</p>
                            <p className="text-xs text-amber-400/60">Puedes vender sin restricciones semanales</p>
                          </div>
                        </div>
                      </div>
                    ) : monthlySales?.enabled ? (
                      <>
                        {/* Credit mode with remaining TUNG: no unit limit bars */}
                        {monthlySales.has_credit && !monthlySales.fxu_exhausted ? (
                          <div className="flex items-center gap-2 justify-center py-2 mb-1">
                            <CheckCircle className="w-4 h-4 text-cyan-400" />
                            <p className="text-sm text-cyan-400">Modo Crédito: Sin límite de unidades</p>
                          </div>
                        ) : newListing.type === 'resource' ? (
                          <div className="grid grid-cols-3 gap-3 text-center">
                            {(['metal', 'crystal', 'deuterium'] as const).map((res) => {
                              const sold = monthlySales[`${res}_sold`] || 0;
                              const remaining = monthlySales[`${res}_remaining`] || 0;
                              const limit = monthlySales.monthly_limit;
                              const pct = limit > 0 ? Math.min(100, (sold / limit) * 100) : 0;
                              return (
                                <div key={res} className="bg-space-800/50 rounded-lg p-3">
                                  <span className="text-xs text-gray-400 capitalize">{RESOURCE_LABELS[res] || res}</span>
                                  <div className="mt-1 w-full bg-space-900 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-green-500'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 text-xs">
                                    <span className={remaining <= 0 ? 'text-red-400' : 'text-green-400'}>{formatNumber(remaining)}</span>
                                    <span className="text-gray-500"> / {formatNumber(limit)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3 text-center">
                            {(() => {
                              const sold = monthlySales.ships_value_sold || 0;
                              const remaining = monthlySales.ships_value_remaining || 0;
                              const limit = monthlySales.monthly_limit;
                              const pct = limit > 0 ? Math.min(100, (sold / limit) * 100) : 0;
                              const shipValue = getShipResourceValue(newListing.itemCode);
                              const shipsRemaining = shipValue > 0 ? Math.floor(remaining / shipValue) : 0;
                              return (
                                <div className="bg-space-800/50 rounded-lg p-3">
                                  <span className="text-xs text-gray-400">{t.market.shipValueLimit}</span>
                                  <div className="mt-1 w-full bg-space-900 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-green-500'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 text-xs">
                                    <span className={remaining <= 0 ? 'text-red-400' : 'text-green-400'}>{formatNumber(remaining)}</span>
                                    <span className="text-gray-500"> / {formatNumber(limit)} {t.market.resourceValue}</span>
                                  </div>
                                  {shipValue > 0 && (
                                    <div className="mt-1 text-xs text-gray-400">
                                      ≈ {formatNumber(shipsRemaining)} {t.market.shipsAvailable} ({t.market.valuePerShip}: {formatNumber(shipValue)})
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {/* TUNG Value Limit Bar */}
                        {monthlySales.fxu_limit > 0 && (
                          <div className="mt-3 bg-space-800/50 rounded-lg p-3 text-center">
                            <span className="text-xs text-amber-400 font-medium">💰 Límite TUNG Semanal</span>
                            <div className="mt-1 w-full bg-space-900 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${(monthlySales.fxu_value_sold / monthlySales.fxu_limit * 100) >= 100 ? 'bg-red-500' : (monthlySales.fxu_value_sold / monthlySales.fxu_limit * 100) >= 75 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                                style={{ width: `${Math.min(100, monthlySales.fxu_limit > 0 ? (monthlySales.fxu_value_sold / monthlySales.fxu_limit) * 100 : 0)}%` }}
                              />
                            </div>
                            <div className="mt-1 text-xs">
                              <span className={monthlySales.fxu_value_remaining <= 0 ? 'text-red-400' : 'text-cyan-400'}>{formatNumber(Math.floor(monthlySales.fxu_value_remaining))} TUNG</span>
                              <span className="text-gray-500"> / {formatNumber(Math.floor(monthlySales.fxu_limit))} TUNG</span>
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          {monthlySales.has_credit ? (
                            <>💰 Crédito TUNG (130%): {formatNumber(monthlySales.fxu_credit)} TUNG ({t.market.fxuSpentLabel}: {formatNumber(monthlySales.fxu_spent)} × 1.3 - {t.market.fxuEarnedLabel}: {formatNumber(monthlySales.fxu_earned)})</>
                          ) : (
                            <>{t.market.formulaLabel} {formatNumber(monthlySales.user_points)} pts + {formatNumber(monthlySales.fxu_credit)} TUNG ({t.market.fxuSpentLabel}: {formatNumber(monthlySales.fxu_spent)} × 1.3 - {t.market.fxuEarnedLabel}: {formatNumber(monthlySales.fxu_earned)})</>
                          )}
                        </p>
                      </>
                    ) : monthlySales && !monthlySales.enabled ? (
                      <div className="flex items-center gap-2 justify-center py-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <p className="text-sm text-green-400">{t.market.noLimitsActive}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 text-center">{t.market.couldNotLoadWeeklyLimit} <button onClick={loadMonthlySales} className="text-amber-400 underline">{t.market.retry}</button></p>
                    )}
                  </div>
                )}

                {newListing.type === 'ship' && !isPlus && monthlySales?.enabled === true && (
                  <div className="bg-amber-500/20 border border-amber-500 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-400 font-medium">{t.market.shipVipRequiredTitle}</p>
                      <p className="text-gray-400 text-sm mt-1">{t.market.shipVipRequiredDesc}</p>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleCreateListing}
                  disabled={processing || newListing.quantity <= 0 || newListing.pricePerUnit <= 0 || isBelowMinPrice() || isAboveMaxPrice() || telegramLinked === false || newListing.quantity > getEffectiveMaxQuantity() || profile?.vacation_mode === true || (newListing.type === 'ship' && !isPlus && monthlySales?.enabled === true) || (!isPlus && monthlySales?.enabled === true)}
                  className="w-full py-3 bg-cyber-yellow hover:bg-cyber-yellow/80 disabled:bg-space-600 disabled:text-gray-500 text-space-900 rounded-lg font-semibold transition-colors"
                >
                  {processing ? t.market.creatingListing : profile?.vacation_mode ? t.market.vacationModeActive : (newListing.type === 'ship' && !isPlus && monthlySales?.enabled === true) ? t.market.shipVipRequiredBtn : (!isPlus && monthlySales?.enabled === true) ? t.market.vipPlusRequiredBtn : (telegramLinked === false ? t.market.telegramRequired : t.market.createListing)}
                </button>
                </>)}

              </div>
            )}

            {activeTab === 'buy_offers' && (
              <div>
                <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-space-700">
                  <p className="text-sm text-gray-400">
                    Otros jugadores compran items aquí. Vende a una oferta o crea la tuya.
                  </p>
                  <button
                    onClick={() => setActiveTab('create_buy_offer')}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-500/80 text-space-900 rounded-lg font-semibold transition-colors flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    {t.market.createBuyOffer}
                  </button>
                </div>
                <div className="p-3 sm:p-4">
                  {buyOffers.filter(o => o.buyer_id !== profile?.id).length === 0 ? (
                    <div className="text-center py-12 text-gray-400 flex flex-col items-center gap-4">
                      <span>No hay ofertas de compra activas</span>
                      <button
                        onClick={() => setActiveTab('create_buy_offer')}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-500/80 text-space-900 rounded-lg font-semibold transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {t.market.createBuyOffer}
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {buyOffers.filter(o => o.buyer_id !== profile?.id).map(offer => {
                      const remainingQty = offer.quantity - offer.quantity_filled;
                      const needsPlanet = offer.listing_type !== 'dark_matter';
                      const acc = LISTING_ACCENTS[offer.listing_type] ?? LISTING_ACCENTS.ship;
                      const img = getItemImageUrl(offer.listing_type, offer.item_code);
                      return (
                        <div
                          key={offer.id}
                          className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${acc.card}`}
                        >
                          <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-60 transition-opacity duration-300 group-hover:opacity-100 ${acc.orb}`} />
                          <div
                            className="pointer-events-none absolute inset-0 opacity-[0.06]"
                            style={{
                              backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)',
                              backgroundSize: '22px 22px',
                            }}
                          />
                          <div className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 blur-md transition-all duration-700 group-hover:left-[130%] group-hover:opacity-100" />

                          <div className="relative flex flex-col">
                            {/* Foto grande del item */}
                            <div className={`relative h-36 sm:h-40 w-full overflow-hidden bg-gradient-to-br ${acc.tile}`}>
                              <div className={`pointer-events-none absolute inset-0 blur-2xl opacity-50 ${acc.orb}`} />
                              {img ? (
                                <GameMedia
                                  src={img}
                                  alt={getItemName(offer.listing_type, offer.item_code)}
                                  className="relative w-full h-full object-contain p-2 drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)] transition-transform duration-500 group-hover:scale-[1.07]"
                                />
                              ) : (
                                <div className="relative w-full h-full flex items-center justify-center">
                                  {offer.listing_type === 'dark_matter' ? (
                                    <Sparkles className={`w-16 h-16 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                  ) : (
                                    <Package className={`w-16 h-16 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                  )}
                                </div>
                              )}
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-space-900/95 to-transparent" />
                              <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border font-medium backdrop-blur-sm ${acc.badge}`}>
                                {acc.label}
                              </span>
                              <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-300 font-mono backdrop-blur-sm">
                                x{formatNumber(remainingQty)}
                              </span>
                            </div>

                            <div className="p-3.5 sm:p-4 pt-2.5 flex flex-col gap-3">
                              <div className="min-w-0">
                                <p className="text-white font-orbitron text-sm sm:text-base truncate">
                                  {getItemName(offer.listing_type, offer.item_code)}
                                </p>
                                <p className="text-xs text-gray-400 truncate mt-0.5">
                                  Comprador: <span className="text-amber-400">{offer.buyer?.username}</span>
                                </p>
                              </div>

                              <div className="rounded-lg border border-white/5 bg-space-900/50 px-3 py-2 flex items-end justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[10px] uppercase tracking-wider text-gray-500">{t.market.fxuCurrency}</p>
                                  <p className="text-amber-400 font-orbitron text-lg sm:text-xl leading-tight drop-shadow-[0_0_8px_rgba(251,191,36,0.35)] truncate">
                                    {formatNumber(remainingQty * offer.price_per_unit)}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-[11px] text-gray-300 font-mono whitespace-nowrap">{offer.price_per_unit} /u</p>
                                  <p className="text-[10px] text-gray-500 whitespace-nowrap">{t.market.quantity}: {formatNumber(remainingQty)}</p>
                                </div>
                              </div>

                              <button
                                onClick={() => openFulfillModal(offer)}
                                disabled={processing || (needsPlanet && !currentPlanet)}
                                className="w-full py-2.5 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 shadow-[0_0_18px_-4px_rgba(34,197,94,0.8)] hover:brightness-110 active:scale-[0.98] disabled:bg-none disabled:bg-space-700 disabled:text-gray-500 disabled:shadow-none"
                              >
                                <Coins className="w-4 h-4" />
                                {t.market.sell}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'create_buy_offer' && (
              <div className="p-6 space-y-6">
                {telegramLinked === false && (
                  <div className="bg-amber-500/20 border border-amber-500 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-400 font-medium">{t.market.noOffersWithoutTelegram}</p>
                      <p className="text-gray-400 text-sm mt-1">{t.market.linkTelegramSellTab}</p>
                    </div>
                  </div>
                )}

                <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 flex items-start gap-3">
                  <ShoppingCart className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-gray-300 text-sm">
                    Al crear una oferta de compra bloqueas los FXU (cantidad × precio). Otro jugador puede venderte el item y recibir tus FXU. Puedes cancelar la oferta para recuperar los FXU no usados.
                  </p>
                </div>

                {/* Vista previa del item seleccionado */}
                {(() => {
                  const acc = LISTING_ACCENTS[newBuyOffer.type] ?? LISTING_ACCENTS.ship;
                  const img = getItemImageUrl(newBuyOffer.type, newBuyOffer.itemCode);
                  return (
                    <div className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 flex items-center gap-4 p-3 sm:p-4 ${acc.card}`}>
                      <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-60 ${acc.orb}`} />
                      <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br ring-1 ${acc.tile} ${acc.ring}`}>
                        {img ? (
                          <GameMedia
                            src={img}
                            alt={getItemName(newBuyOffer.type, newBuyOffer.itemCode)}
                            className="w-full h-full object-contain p-1 transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {newBuyOffer.type === 'dark_matter'
                              ? <Sparkles className={`w-10 h-10 ${acc.text}`} />
                              : <Package className={`w-10 h-10 ${acc.text}`} />}
                          </div>
                        )}
                      </div>
                      <div className="relative min-w-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${acc.badge}`}>{acc.label}</span>
                        <p className="text-white font-orbitron text-base sm:text-lg truncate mt-1">
                          {getItemName(newBuyOffer.type, newBuyOffer.itemCode)}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t.market.itemType}</label>
                    <select
                      value={newBuyOffer.type}
                      onChange={(e) => {
                        const type = e.target.value as ListingType;
                        let itemCode = 'metal';
                        if (type === 'ship') itemCode = shipTypes[0]?.code || '';
                        else if (type === 'dark_matter') itemCode = 'dark_matter';
                        setNewBuyOffer((prev) => ({ ...prev, type, itemCode }));
                      }}
                      className="w-full bg-space-700 border border-space-600 rounded-lg px-4 py-3 text-white"
                    >
                      <option value="resource" className="bg-space-800 text-white">{t.market.resource}</option>
                      <option value="ship" className="bg-space-800 text-white">{t.market.ship}</option>
                      <option value="dark_matter" className="bg-space-800 text-white">{t.market.darkMatter}</option>
                    </select>
                  </div>

                  {newBuyOffer.type !== 'dark_matter' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        {newBuyOffer.type === 'resource' ? t.market.resource : t.market.ship}
                      </label>
                      <select
                        value={newBuyOffer.itemCode}
                        onChange={(e) => setNewBuyOffer((prev) => ({ ...prev, itemCode: e.target.value }))}
                        className="w-full bg-space-700 border border-space-600 rounded-lg px-4 py-3 text-white"
                      >
                        {newBuyOffer.type === 'resource' ? (
                          <>
                            <option value="metal" className="bg-space-800 text-white">{t.resources.metal}</option>
                            <option value="crystal" className="bg-space-800 text-white">{t.resources.crystal}</option>
                            <option value="deuterium" className="bg-space-800 text-white">{t.resources.deuterium}</option>
                          </>
                        ) : (
                          shipTypes.map(ship => (
                            <option key={ship.code} value={ship.code} className="bg-space-800 text-white">{translateShipName(t, ship.code, ship.name)}</option>
                          ))
                        )}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t.market.quantity}</label>
                    <input
                      type="number"
                      value={newBuyOffer.quantity || ''}
                      onChange={(e) => setNewBuyOffer((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-space-700 border border-space-600 rounded-lg px-4 py-3 text-white"
                      min="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t.market.pricePerUnit} ({t.market.fxuCurrency})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={buyOfferPriceStr}
                      onChange={(e) => {
                        const val = e.target.value.replace(',', '.');
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setBuyOfferPriceStr(val);
                          const num = parseFloat(val);
                          setNewBuyOffer((prev) => ({ ...prev, pricePerUnit: isNaN(num) ? 0 : num }));
                        }
                      }}
                      className={`w-full bg-space-700 border rounded-lg px-4 py-3 text-white ${
                        isBuyOfferBelowMinPrice() || isBuyOfferAboveMaxPrice() ? 'border-red-500' : 'border-space-600'
                      }`}
                      placeholder="0"
                    />
                    {(newBuyOffer.type === 'resource' || newBuyOffer.type === 'ship') && buyPriceRef && (
                      <div className="mt-2 bg-space-700/40 border border-space-600 rounded-lg p-3 text-xs space-y-1">
                        {buyPriceRef.sample_count > 0 && buyPriceRef.reference_avg != null ? (
                          <>
                            <div className="flex justify-between text-gray-300">
                              <span>Promedio del mercado:</span>
                              <span className="font-mono">{formatNumber(buyPriceRef.reference_avg)} {t.market.fxuCurrency}</span>
                            </div>
                            <div className="flex justify-between text-amber-300">
                              <span>{buyPriceRef.floor_basis === 'shipyard' ? 'Mínimo permitido (Astillero −30%):' : 'Mínimo permitido (−20%):'}</span>
                              <span className="font-mono">{formatNumber(buyPriceRef.min_price)} {t.market.fxuCurrency}</span>
                            </div>
                            {buyPriceRef.max_price != null && (
                              <div className="flex justify-between text-amber-300">
                                <span>Máximo permitido (+20%):</span>
                                <span className="font-mono">{formatNumber(buyPriceRef.max_price)} {t.market.fxuCurrency}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex justify-between text-amber-300">
                            <span>Mínimo permitido:</span>
                            <span className="font-mono">{formatNumber(buyPriceRef.min_price)} {t.market.fxuCurrency}</span>
                          </div>
                        )}
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setNewBuyOffer((prev) => ({ ...prev, pricePerUnit: buyPriceRef.min_price }));
                              setBuyOfferPriceStr(String(buyPriceRef.min_price));
                            }}
                            className="mt-1 text-blue-400 hover:text-blue-300 underline"
                          >
                            Usar mínimo
                          </button>
                          {buyPriceRef.max_price != null && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewBuyOffer((prev) => ({ ...prev, pricePerUnit: buyPriceRef.max_price! }));
                                setBuyOfferPriceStr(String(buyPriceRef.max_price));
                              }}
                              className="mt-1 text-blue-400 hover:text-blue-300 underline"
                            >
                              Usar máximo
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {isBuyOfferBelowMinPrice() && buyPriceRef && (
                      <div className="mt-2 bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-red-400 font-medium text-sm">Precio demasiado bajo</p>
                          <p className="text-red-300/80 text-xs mt-1">
                            El precio mínimo para {getItemName(newBuyOffer.type, newBuyOffer.itemCode)} es {formatNumber(buyPriceRef.min_price)} {t.market.fxuCurrency} (20% por debajo del promedio del mercado).
                          </p>
                        </div>
                      </div>
                    )}
                    {isBuyOfferAboveMaxPrice() && buyPriceRef && buyPriceRef.max_price != null && (
                      <div className="mt-2 bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-red-400 font-medium text-sm">Precio demasiado alto</p>
                          <p className="text-red-300/80 text-xs mt-1">
                            El precio máximo para {getItemName(newBuyOffer.type, newBuyOffer.itemCode)} es {formatNumber(buyPriceRef.max_price)} {t.market.fxuCurrency} (20% por encima del promedio del mercado).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-space-700/50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">FXU a bloquear:</span>
                    <span className="font-mono text-white">
                      {formatNumber(newBuyOffer.quantity * newBuyOffer.pricePerUnit)} {t.market.fxuCurrency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Tu saldo:</span>
                    <span className="font-mono text-cyber-yellow">
                      {formatNumber(Number(profile?.tung_balance) || 0)} {t.market.fxuCurrency}
                    </span>
                  </div>
                </div>

                {(() => {
                  const total = newBuyOffer.quantity * newBuyOffer.pricePerUnit;
                  const balance = Number(profile?.tung_balance) || 0;
                  const insufficient = total > balance;
                  const disabled = processing || newBuyOffer.quantity <= 0 || newBuyOffer.pricePerUnit <= 0 || isBuyOfferBelowMinPrice() || isBuyOfferAboveMaxPrice() || telegramLinked === false || profile?.vacation_mode === true || total < 1 || insufficient;
                  return (
                    <button
                      onClick={handleCreateBuyOffer}
                      disabled={disabled}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-500/80 disabled:bg-space-600 disabled:text-gray-500 text-space-900 rounded-lg font-semibold transition-colors"
                    >
                      {processing ? t.market.creatingListing
                        : profile?.vacation_mode ? t.market.vacationModeActive
                        : telegramLinked === false ? t.market.telegramRequired
                        : insufficient ? 'FXU insuficiente'
                        : (t.market.createBuyOffer)}
                    </button>
                  );
                })()}
              </div>
            )}

            {activeTab === 'my_listings' && (
              <div>
                <div className="p-3 sm:p-4">
                  {myListings.length === 0 && myBuyOffers.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      {t.market.noActiveListings}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {myListings.map(listing => {
                        const acc = LISTING_ACCENTS[listing.listing_type] ?? LISTING_ACCENTS.ship;
                        const img = listing.listing_type === 'colony' ? getColonyImage(listing) : getItemImageUrl(listing.listing_type, listing.item_code);
                        return (
                        <div
                          key={listing.id}
                          className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${acc.card}`}
                        >
                          <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-60 ${acc.orb}`} />
                          <div className="relative flex flex-col">
                            <div className={`relative h-32 sm:h-36 w-full overflow-hidden bg-gradient-to-br ${acc.tile}`}>
                              <div className={`pointer-events-none absolute inset-0 blur-2xl opacity-50 ${acc.orb}`} />
                              {img ? (
                                <GameMedia
                                  src={img}
                                  alt={getItemName(listing.listing_type, listing.item_code)}
                                  className="relative w-full h-full object-contain p-2 drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)] transition-transform duration-500 group-hover:scale-[1.06]"
                                />
                              ) : (
                                <div className="relative w-full h-full flex items-center justify-center">
                                  {listing.listing_type === 'dark_matter' ? (
                                    <Sparkles className={`w-14 h-14 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                  ) : listing.listing_type === 'colony' ? (
                                    <Globe className={`w-14 h-14 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                  ) : (
                                    <Package className={`w-14 h-14 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                  )}
                                </div>
                              )}
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-space-900/95 to-transparent" />
                              <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/15 text-cyan-300 font-medium backdrop-blur-sm">
                                {t.market.sell}
                              </span>
                              <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/50 text-white font-mono backdrop-blur-sm">
                                x{formatNumber(listing.quantity)}
                              </span>
                            </div>

                            <div className="p-3.5 sm:p-4 pt-2.5 flex flex-col gap-3">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <p className="text-white font-orbitron text-sm sm:text-base truncate">
                                  {getItemName(listing.listing_type, listing.item_code)}
                                </p>
                                <span className={`text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded-full border ${
                                  listing.status === 'active' ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                                  listing.status === 'sold' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' :
                                  'border-red-500/30 bg-red-500/10 text-red-400'
                                }`}>
                                  {listing.status === 'active' ? t.market.statusActive :
                                   listing.status === 'sold' ? t.market.statusSold : t.market.statusCancelled}
                                </span>
                              </div>

                              <div className="rounded-lg border border-white/5 bg-space-900/50 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500">{t.market.fxuCurrency}</p>
                                <p className="text-cyber-yellow font-orbitron text-lg leading-tight drop-shadow-[0_0_8px_rgba(250,204,21,0.35)] truncate">
                                  {formatNumber(listing.total_price)}
                                </p>
                              </div>

                              {listing.status === 'active' && (
                                <button
                                  onClick={() => handleCancelListing(listing)}
                                  disabled={processing}
                                  className="w-full py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 rounded-lg font-semibold transition-colors disabled:opacity-50"
                                >
                                  {t.common.cancel}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })}

                      {myBuyOffers.map(offer => {
                        const remainingQty = offer.quantity - offer.quantity_filled;
                        const acc = LISTING_ACCENTS[offer.listing_type] ?? LISTING_ACCENTS.ship;
                        const img = getItemImageUrl(offer.listing_type, offer.item_code);
                        return (
                          <div
                            key={offer.id}
                            className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${offer.status === 'active' ? 'order-first' : ''} ${acc.card}`}
                          >
                            <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-60 ${acc.orb}`} />
                            <div className="relative flex flex-col">
                              <div className={`relative h-32 sm:h-36 w-full overflow-hidden bg-gradient-to-br ${acc.tile}`}>
                                <div className={`pointer-events-none absolute inset-0 blur-2xl opacity-50 ${acc.orb}`} />
                                {img ? (
                                  <GameMedia
                                    src={img}
                                    alt={getItemName(offer.listing_type, offer.item_code)}
                                    className="relative w-full h-full object-contain p-2 drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)] transition-transform duration-500 group-hover:scale-[1.06]"
                                  />
                                ) : (
                                  <div className="relative w-full h-full flex items-center justify-center">
                                    {offer.listing_type === 'dark_matter' ? (
                                      <Sparkles className={`w-14 h-14 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                    ) : (
                                      <Package className={`w-14 h-14 ${acc.text} drop-shadow-[0_0_12px_currentColor]`} />
                                    )}
                                  </div>
                                )}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-space-900/95 to-transparent" />
                                <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-300 font-medium backdrop-blur-sm">
                                  {t.market.buy}
                                </span>
                                <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/50 text-white font-mono backdrop-blur-sm">
                                  x{formatNumber(remainingQty)}
                                </span>
                              </div>

                              <div className="p-3.5 sm:p-4 pt-2.5 flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                  <div className="min-w-0">
                                    <p className="text-white font-orbitron text-sm sm:text-base truncate">
                                      {getItemName(offer.listing_type, offer.item_code)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {t.market.remaining}: {formatNumber(remainingQty)} / {formatNumber(offer.quantity)}
                                      {offer.quantity_filled > 0 && (
                                        <span className="text-green-400 ml-1">({t.market.partiallyFilled})</span>
                                      )}
                                    </p>
                                  </div>
                                  <span className={`text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded-full border ${
                                    offer.status === 'active' ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                                    offer.status === 'filled' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' :
                                    'border-red-500/30 bg-red-500/10 text-red-400'
                                  }`}>
                                    {offer.status === 'active' ? t.market.statusActive :
                                     offer.status === 'filled' ? t.market.statusFilled : t.market.statusCancelled}
                                  </span>
                                </div>

                                <div className="rounded-lg border border-white/5 bg-space-900/50 px-3 py-2">
                                  <p className="text-[10px] uppercase tracking-wider text-gray-500">{t.market.fxuCurrency}</p>
                                  <p className="text-amber-400 font-orbitron text-lg leading-tight drop-shadow-[0_0_8px_rgba(251,191,36,0.35)] truncate">
                                    {formatNumber(remainingQty * offer.price_per_unit)}
                                  </p>
                                </div>

                                {offer.status === 'active' && (
                                  <button
                                    onClick={() => handleCancelBuyOffer(offer)}
                                    disabled={processing}
                                    className="w-full py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 rounded-lg font-semibold transition-colors disabled:opacity-50"
                                  >
                                    {t.common.cancel}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="p-3 sm:p-4 space-y-2.5">
                {transactions.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    {t.market.noTransactions}
                  </div>
                ) : (
                  transactions.map(tx => {
                    const isBuyer = tx.buyer_id === profile?.id;
                    const sellerReceived = tx.total_price * (1 - MARKET_FEE_PERCENT / 100);
                    const displayAmount = isBuyer ? tx.total_price : sellerReceived;
                    const acc = LISTING_ACCENTS[tx.item_type] ?? LISTING_ACCENTS.ship;
                    const img = getItemImageUrl(tx.item_type, tx.item_code);

                    return (
                      <div
                        key={tx.id}
                        className={`group relative overflow-hidden rounded-xl border bg-gradient-to-r from-space-800/90 to-space-900/80 p-3 flex items-center gap-3 sm:gap-4 transition-all duration-300 ${
                          isBuyer ? 'border-red-500/20 hover:border-red-400/50' : 'border-green-500/20 hover:border-green-400/50'
                        }`}
                      >
                        <div className={`pointer-events-none absolute -top-8 -left-8 w-24 h-24 rounded-full blur-3xl opacity-50 ${isBuyer ? 'bg-red-500/20' : 'bg-green-500/20'}`} />
                        <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br ring-1 ${acc.tile} ${acc.ring}`}>
                          {img ? (
                            <GameMedia
                              src={img}
                              alt={getItemName(tx.item_type, tx.item_code)}
                              className="w-full h-full object-contain p-1 transition-transform duration-500 group-hover:scale-110"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className={`w-8 h-8 ${acc.text}`} />
                            </div>
                          )}
                        </div>
                        <div className="relative flex-1 min-w-0">
                          <p className="text-white font-orbitron text-sm sm:text-base truncate">
                            {getItemName(tx.item_type, tx.item_code)} <span className="text-gray-400 font-mono">x{formatNumber(tx.quantity)}</span>
                          </p>
                          <span className={`inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full border ${
                            isBuyer ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-green-500/30 bg-green-500/10 text-green-400'
                          }`}>
                            {isBuyer ? <ShoppingCart className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
                            {isBuyer ? t.market.purchase : t.market.sale}
                          </span>
                        </div>
                        <div className="relative text-right flex-shrink-0">
                          <p className={`font-orbitron text-base sm:text-lg whitespace-nowrap ${
                            isBuyer ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {isBuyer ? '-' : '+'}{formatNumber(displayAmount)}
                          </p>
                          <p className="text-[10px] text-gray-500">{t.market.fxuCurrency}</p>
                          {!isBuyer && (
                            <p className="text-[10px] text-gray-500 whitespace-nowrap">
                              ({MARKET_FEE_PERCENT}% {t.market.feeApplied})
                            </p>
                          )}
                          <p className="text-[11px] text-gray-500 whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'supply_boxes' && (
              <div className="p-3 sm:p-6">
                <div className="mb-4 sm:mb-6">
                  <h2 className="font-orbitron text-lg sm:text-xl text-white mb-2 flex items-center gap-2">
                    <Box className="w-6 h-6 text-cyber-yellow" />
                    {t.market.supplyBoxes}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {t.market.supplyBoxesDesc}
                  </p>
                  {currentPlanet && (
                    <p className="text-cyan-400 text-sm mt-2">
                      {t.market.targetPlanet} <span className="font-semibold">{translatePlanetName(currentPlanet.name)}</span>
                    </p>
                  )}
                </div>

                {supplyBoxes.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    {t.market.noBoxesAvailable}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                    {supplyBoxes.map(box => {
                      const cost = boxTungCost(box);
                      const priceUnavailable = cost === null;
                      const canAfford = cost !== null && (profile?.tung_balance || 0) >= cost;
                      return (
                        <div
                          key={box.id}
                          className="group relative overflow-hidden bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 border border-amber-500/25 rounded-xl p-4 sm:p-5 hover:border-amber-400/70 hover:-translate-y-0.5 hover:shadow-[0_0_28px_-6px_rgba(251,191,36,0.55)] transition-all duration-300"
                        >
                          <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-60 bg-amber-500/25 transition-opacity duration-300 group-hover:opacity-100" />
                          <div
                            className="pointer-events-none absolute inset-0 opacity-[0.06]"
                            style={{
                              backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)',
                              backgroundSize: '22px 22px',
                            }}
                          />
                          <div className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 blur-md transition-all duration-700 group-hover:left-[130%] group-hover:opacity-100" />

                          <div className="relative flex items-center gap-3 mb-4">
                            <div className="relative p-3 bg-gradient-to-br from-cyber-yellow/25 to-amber-500/10 ring-1 ring-amber-400/30 rounded-lg">
                              <div className="absolute inset-0 rounded-lg blur-lg opacity-40 bg-amber-500/25" />
                              <Box className="relative w-8 h-8 text-cyber-yellow drop-shadow-[0_0_6px_currentColor]" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-orbitron text-base sm:text-lg text-white truncate">{box.name}</h3>
                              <p className="text-xs text-gray-400 break-words">{box.description}</p>
                            </div>
                          </div>

                          <div className="relative space-y-2 mb-4 bg-space-900/60 border border-white/5 rounded-lg p-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-400 flex items-center gap-2">
                                <img src={RESOURCE_IMAGES.metal} alt="" className="w-6 h-6 rounded object-cover ring-1 ring-white/10" />
                                {t.resources.metal}
                              </span>
                              <span className="text-blue-400 font-semibold font-mono">{formatNumber(box.metal_amount)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-400 flex items-center gap-2">
                                <img src={RESOURCE_IMAGES.crystal} alt="" className="w-6 h-6 rounded object-cover ring-1 ring-white/10" />
                                {t.resources.crystal}
                              </span>
                              <span className="text-cyan-400 font-semibold font-mono">{formatNumber(box.crystal_amount)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-400 flex items-center gap-2">
                                <img src={RESOURCE_IMAGES.deuterium} alt="" className="w-6 h-6 rounded object-cover ring-1 ring-white/10" />
                                {t.resources.deuterium}
                              </span>
                              <span className="text-green-400 font-semibold font-mono">{formatNumber(box.deuterium_amount)}</span>
                            </div>
                          </div>

                          <div className="relative border-t border-white/5 pt-4">
                            <button
                              onClick={() => purchaseSupplyBox(box.code)}
                              disabled={purchasingBox !== null || !canAfford || !currentPlanet}
                              className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-600 shadow-[0_0_18px_-4px_rgba(251,191,36,0.8)] text-space-900 rounded-lg font-bold transition-all hover:brightness-110 active:scale-[0.98] disabled:bg-none disabled:bg-space-700 disabled:text-gray-500 disabled:shadow-none disabled:cursor-not-allowed flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5"
                            >
                              {purchasingBox === box.code ? (
                                <>
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  {t.market.buying}
                                </>
                              ) : priceUnavailable ? (
                                <>
                                  <Coins className="w-5 h-5" />
                                  Precio no disponible
                                </>
                              ) : (
                                <>
                                  <Coins className="w-5 h-5" />
                                  {formatNumber(cost)} TUNG
                                  {box.price_usdt > 0 && (
                                    <span className="text-xs opacity-70 ml-1">(${box.price_usdt})</span>
                                  )}
                                  {!canAfford && <span className="text-xs ml-1">{t.market.insufficient}</span>}
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setGiftBox(box)}
                              disabled={priceUnavailable}
                              className="w-full mt-2 py-2 px-4 bg-pink-500/10 hover:bg-pink-500/20 text-pink-200 border border-pink-500/40 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              <Gift className="w-4 h-4" /> Regalar a un amigo
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {giftBox && (
                  <GiftItemModal
                    open
                    onClose={() => setGiftBox(null)}
                    kind="supply_box"
                    code={giftBox.code}
                    itemName={giftBox.name}
                    maxQty={10}
                    estimateCost={(q) => {
                      const unit = boxTungCost(giftBox);
                      return unit !== null ? unit * q : null;
                    }}
                  />
                )}

                <div className="mt-6 p-4 bg-space-700/30 border border-space-600 rounded-lg">
                  <p className="text-sm text-gray-400">
                    {t.market.supplyBoxNote}
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'shipyard' && (
              <InstantShipyardTab
                fxuBalance={profile?.tung_balance || 0}
                onChange={refreshProfile}
              />
            )}

            {activeTab === 'hero_items' && heroAccess && (
              <HeroItemsMarketTab
                fxuBalance={profile?.tung_balance || 0}
                onChange={refreshProfile}
              />
            )}
          </>
        )}
      </div>

      <div className="card-glass p-4">
        <h3 className="font-orbitron text-sm text-gray-400 mb-2">{t.market.aboutMarket}</h3>
        <p className="text-sm text-gray-500">
          {t.market.marketDescription}
        </p>
        <p className="text-sm text-red-400 mt-2">
          {t.market.marketFeeInfo}
        </p>
        {myFeeInfo && (
          <p className="text-sm text-cyber-yellow mt-1 font-semibold">
            Tu comisión actual: {myFeeInfo.fee_percent}% (Rank #{myFeeInfo.rank}){myFeeInfo.is_plus ? ' ⭐ VIP' : ''}
          </p>
        )}
      </div>

      {buyModal && (() => {
        const bAcc = LISTING_ACCENTS[buyModal.listing.listing_type] ?? LISTING_ACCENTS.ship;
        const isColony = buyModal.listing.listing_type === 'colony';
        const bColony = isColony && buyModal.listing.planet_id ? colonyInfo[buyModal.listing.planet_id] : undefined;
        const bImg = isColony ? getColonyImage(buyModal.listing) : getItemImageUrl(buyModal.listing.listing_type, buyModal.listing.item_code);
        const colonyFull = isColony && colonySlots !== null && colonySlots.owned >= colonySlots.max;
        return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`relative bg-gradient-to-br from-space-800 via-space-800/95 to-space-900 border rounded-xl w-full max-w-md overflow-hidden max-h-[92vh] overflow-y-auto shadow-2xl ${bAcc.card.split(' ')[0]}`}>
            <div className={`pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-50 ${bAcc.orb}`} />
            <div className="relative p-4 border-b border-space-700 flex items-center justify-between">
              <h3 className="font-orbitron text-lg text-white flex items-center gap-2">
                <ShoppingCart className={`w-5 h-5 ${bAcc.text}`} />
                {t.market.buyItem}
              </h3>
              <button
                onClick={() => setBuyModal(null)}
                className="p-1 hover:bg-space-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Foto grande del item */}
            <div className={`relative h-44 w-full overflow-hidden bg-gradient-to-br ${bAcc.tile}`}>
              <div className={`pointer-events-none absolute inset-0 blur-2xl opacity-50 ${bAcc.orb}`} />
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
              {bImg ? (
                <GameMedia
                  src={bImg}
                  alt={getItemName(buyModal.listing.listing_type, buyModal.listing.item_code)}
                  className="relative w-full h-full object-contain p-3 drop-shadow-[0_8px_22px_rgba(0,0,0,0.65)]"
                />
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  {buyModal.listing.listing_type === 'dark_matter' ? (
                    <Sparkles className={`w-20 h-20 ${bAcc.text} drop-shadow-[0_0_14px_currentColor]`} />
                  ) : (
                    <Package className={`w-20 h-20 ${bAcc.text} drop-shadow-[0_0_14px_currentColor]`} />
                  )}
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-space-800 via-space-800/70 to-transparent" />
              <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border font-medium backdrop-blur-sm ${bAcc.badge}`}>
                {bAcc.label}
              </span>
              <div className="absolute bottom-2 left-3 right-3">
                <p className="text-white font-orbitron text-base sm:text-lg truncate drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {getItemName(buyModal.listing.listing_type, buyModal.listing.item_code)}
                </p>
                {isColony ? (
                  <p className="text-xs text-gray-300">
                    {bColony ? <>{bColony.name} · Campos {bColony.fields_used}/{bColony.fields_max}</> : null}
                    {bColony?.has_moon && <span className="ml-1 text-indigo-300">· Incluye luna</span>}
                  </p>
                ) : (
                <p className="text-xs text-gray-300">
                  {t.market.available}: <span className="text-white font-mono">{formatNumber(buyModal.listing.quantity)}</span>
                  <span className="mx-1 text-gray-500">|</span>
                  <span className="text-cyber-yellow font-mono">{buyModal.listing.price_per_unit}</span> {t.market.fxuCurrency}/u
                </p>
                )}
              </div>
            </div>

            <div className="relative p-4 space-y-4">
              {isColony ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200 space-y-1">
                  <p className="flex items-center gap-1 font-semibold"><Globe className="w-4 h-4" /> Compra de Sub-Ciudad</p>
                  <p>Recibes la ciudad con sus edificios{bColony?.has_moon ? ' y su luna' : ''}.</p>
                  <p>Las tropas NO se incluyen: el vendedor las conserva en su ciudad principal. Las defensas se destruyen en la venta.</p>
                  <p>La recibes con los recursos en 0; despues de tenerla en tu poder recaudara recursos segun el nivel de sus minas.</p>
                  <p>Puedes comprar todas las sub-ciudades que quieras: la compra no depende de Augurium.</p>
                  {colonySlots && !colonyFull && (
                    <p className="text-amber-300">Ciudades: {colonySlots.owned}/{colonySlots.max} (Augurium nivel {colonySlots.astro}).</p>
                  )}
                </div>
              ) : null}
              {colonyFull && colonySlots && (
                <div className="bg-yellow-500/15 border border-yellow-500/40 rounded-lg p-3 flex items-start gap-2 text-yellow-300 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Tienes {colonySlots.owned} ciudades y tu Augurium nivel {colonySlots.astro} permite {colonySlots.max}.
                    Puedes comprar esta sub-ciudad, pero no podras fundar nuevas con colonos hasta subir Augurium a nivel {2 * (colonySlots.owned + 1) - 1}.
                  </span>
                </div>
              )}
              {isColony && bColony ? (
                <ColonyDepositsInfo deposits={bColony.deposits} />
              ) : null}
              {isColony ? null : (
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {t.market.quantityToBuy}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={buyModal.quantity}
                    onChange={(e) => setBuyModal({
                      ...buyModal,
                      quantity: Math.max(1, Math.min(buyModal.listing.quantity, parseInt(e.target.value) || 1))
                    })}
                    className="flex-1 bg-space-900/60 border border-space-600 rounded-lg px-4 py-3 text-white font-orbitron focus:border-cyber-blue focus:outline-none focus:ring-1 focus:ring-cyber-blue/40 transition-colors"
                    min="1"
                    max={buyModal.listing.quantity}
                  />
                  <button
                    onClick={() => setBuyModal({ ...buyModal, quantity: buyModal.listing.quantity })}
                    className="px-4 py-2 bg-space-600 hover:bg-space-500 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    {t.market.max}
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  {[10, 25, 50, 75, 100].map((percent) => (
                    <button
                      key={percent}
                      onClick={() => setBuyModal({
                        ...buyModal,
                        quantity: Math.max(1, Math.floor(buyModal.listing.quantity * percent / 100))
                      })}
                      className="flex-1 px-2 py-1 bg-space-700 hover:bg-space-600 hover:text-white text-gray-400 rounded text-xs font-medium transition-colors"
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
              </div>
              )}

              <div className="rounded-lg border border-white/5 bg-space-900/60 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{t.market.quantity}:</span>
                  <span className="text-white font-mono">{formatNumber(buyModal.quantity)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{t.market.pricePerUnit}:</span>
                  <span className="text-white font-mono">{buyModal.listing.price_per_unit} {t.market.fxuCurrency}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-space-600 pt-2">
                  <span className="text-gray-400">{t.market.totalPrice}:</span>
                  <span className="text-cyber-yellow font-orbitron text-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.35)]">
                    {formatNumber(buyModal.quantity * buyModal.listing.price_per_unit)} {t.market.fxuCurrency}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">{t.market.yourBalance}:</span>
                  <span className={`${(profile?.tung_balance || 0) >= buyModal.quantity * buyModal.listing.price_per_unit ? 'text-green-400' : 'text-red-400'}`}>
                    {formatNumber(profile?.tung_balance || 0)} {t.market.fxuCurrency}
                  </span>
                </div>
              </div>

              {(profile?.tung_balance || 0) < buyModal.quantity * buyModal.listing.price_per_unit && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {t.market.insufficientBalance}
                </div>
              )}

              {telegramLinked === false && (
                <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 flex items-center gap-2 text-amber-400 text-sm">
                  <MessageCircle className="w-4 h-4 flex-shrink-0" />
                  {t.market.telegramRequiredForBuy}
                </div>
              )}
            </div>

            <div className="relative p-4 border-t border-space-700 flex gap-3">
              <button
                onClick={() => setBuyModal(null)}
                className="flex-1 py-3 bg-space-700 hover:bg-space-600 text-gray-300 rounded-lg font-semibold transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleBuyListing}
                disabled={
                  processing ||
                  buyModal.quantity < 1 ||
                  buyModal.quantity > buyModal.listing.quantity ||
                  (profile?.tung_balance || 0) < buyModal.quantity * buyModal.listing.price_per_unit ||
                  telegramLinked === false
                }
                className={`flex-1 py-3 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r hover:brightness-110 active:scale-[0.98] disabled:bg-none disabled:bg-space-600 disabled:text-gray-500 disabled:shadow-none ${bAcc.btn}`}
              >
                {processing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : telegramLinked === false ? (
                  <>
                    <MessageCircle className="w-5 h-5" />
                    {t.market.telegramRequired}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    {t.market.confirmPurchase}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {fulfillModal && (() => {
        const fAcc = LISTING_ACCENTS[fulfillModal.offer.listing_type] ?? LISTING_ACCENTS.ship;
        const fImg = getItemImageUrl(fulfillModal.offer.listing_type, fulfillModal.offer.item_code);
        return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative bg-gradient-to-br from-space-800 via-space-800/95 to-space-900 border border-green-500/25 rounded-xl w-full max-w-md overflow-hidden max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-50 bg-green-500/25" />
            <div className="relative p-4 border-b border-space-700 flex items-center justify-between">
              <h3 className="font-orbitron text-lg text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-green-400" />
                {t.market.fulfillOffer}
              </h3>
              <button
                onClick={() => setFulfillModal(null)}
                className="p-1 hover:bg-space-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Foto grande del item */}
            <div className={`relative h-44 w-full overflow-hidden bg-gradient-to-br ${fAcc.tile}`}>
              <div className={`pointer-events-none absolute inset-0 blur-2xl opacity-50 ${fAcc.orb}`} />
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
              {fImg ? (
                <GameMedia
                  src={fImg}
                  alt={getItemName(fulfillModal.offer.listing_type, fulfillModal.offer.item_code)}
                  className="relative w-full h-full object-contain p-3 drop-shadow-[0_8px_22px_rgba(0,0,0,0.65)]"
                />
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  {fulfillModal.offer.listing_type === 'dark_matter' ? (
                    <Sparkles className={`w-20 h-20 ${fAcc.text} drop-shadow-[0_0_14px_currentColor]`} />
                  ) : (
                    <Package className={`w-20 h-20 ${fAcc.text} drop-shadow-[0_0_14px_currentColor]`} />
                  )}
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-space-800 via-space-800/70 to-transparent" />
              <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border font-medium backdrop-blur-sm ${fAcc.badge}`}>
                {fAcc.label}
              </span>
              <div className="absolute bottom-2 left-3 right-3">
                <p className="text-white font-orbitron text-base sm:text-lg truncate drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {getItemName(fulfillModal.offer.listing_type, fulfillModal.offer.item_code)}
                </p>
                <p className="text-xs text-gray-300">
                  {t.market.remaining}: <span className="text-white font-mono">{formatNumber(fulfillModal.offer.quantity - fulfillModal.offer.quantity_filled)}</span>
                  <span className="mx-1 text-gray-500">|</span>
                  <span className="text-amber-400 font-mono">{fulfillModal.offer.price_per_unit}</span> {t.market.fxuCurrency}/u
                </p>
              </div>
            </div>

            <div className="relative p-4 space-y-4">

              {(() => {
                const offerRemaining = fulfillModal.offer.quantity - fulfillModal.offer.quantity_filled;
                const available = getAvailableStock(fulfillModal.offer.listing_type, fulfillModal.offer.item_code);
                const monthlyRem = fulfillModal.monthlyRemaining;
                const effectiveMax = monthlyRem !== null
                  ? Math.min(offerRemaining, available, monthlyRem)
                  : Math.min(offerRemaining, available);
                const isMonthlyCapped = monthlyRem !== null && monthlyRem < Math.min(offerRemaining, available);
                return (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {t.market.quantityToFulfill}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={fulfillModal.quantity}
                        onChange={(e) => {
                          setFulfillModal({
                            ...fulfillModal,
                            quantity: Math.max(1, Math.min(effectiveMax, parseInt(e.target.value) || 1))
                          });
                        }}
                        className="flex-1 bg-space-900/60 border border-space-600 rounded-lg px-4 py-3 text-white font-orbitron focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500/40 transition-colors"
                        min="1"
                        max={effectiveMax}
                      />
                      <button
                        onClick={() => setFulfillModal({ ...fulfillModal, quantity: Math.max(1, effectiveMax) })}
                        className="px-4 py-2 bg-space-600 hover:bg-space-500 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        {t.market.max}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {t.market.available}: <span className={available < offerRemaining ? 'text-amber-400' : 'text-green-400'}>{formatNumber(available)}</span>
                      {effectiveMax < Math.min(offerRemaining, available) && !isMonthlyCapped && (
                        <span className="text-amber-400 ml-1">(max {formatNumber(effectiveMax)})</span>
                      )}
                    </p>
                    {isMonthlyCapped && (
                      <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-400">
                        <p className="font-medium">{t.market.weeklyLimitLabel} {formatNumber(fulfillModal.monthlySold || 0)} / {formatNumber(fulfillModal.monthlyLimit || 0)}</p>
                        <p className="mt-0.5 text-amber-400/80">{t.market.weeklyLimitOnlySell} {formatNumber(monthlyRem)} {fulfillModal.offer.item_code}</p>
                      </div>
                    )}
                    {monthlyRem !== null && monthlyRem <= 0 && (
                      <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-xs text-red-400">
                        {t.market.weeklyLimitReached}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const grossFxu = fulfillModal.quantity * fulfillModal.offer.price_per_unit;
                const fee = grossFxu * (MARKET_FEE_PERCENT / 100);
                const netFxu = grossFxu - fee;
                return (
                  <div className="rounded-lg border border-white/5 bg-space-900/60 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t.market.quantity}:</span>
                      <span className="text-white font-mono">{formatNumber(fulfillModal.quantity)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t.market.pricePerUnit}:</span>
                      <span className="text-white font-mono">{fulfillModal.offer.price_per_unit} {t.market.fxuCurrency}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t.market.totalPrice}:</span>
                      <span className="text-white font-mono">{formatNumber(grossFxu)} {t.market.fxuCurrency}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t.market.marketFee} ({MARKET_FEE_PERCENT}%):</span>
                      <span className="text-red-400 font-mono">-{formatNumber(fee)} {t.market.fxuCurrency}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-space-600 pt-2">
                      <span className="text-white font-semibold">{t.market.fxuToReceive}:</span>
                      <span className="text-green-400 font-orbitron text-lg drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]">{formatNumber(netFxu)} {t.market.fxuCurrency}</span>
                    </div>
                  </div>
                );
              })()}

              {telegramLinked === false && (
                <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 flex items-center gap-2 text-amber-400 text-sm">
                  <MessageCircle className="w-4 h-4 flex-shrink-0" />
                  {t.market.telegramRequiredForMarket}
                </div>
              )}
            </div>

            <div className="relative p-4 border-t border-space-700 flex gap-3">
              <button
                onClick={() => setFulfillModal(null)}
                className="flex-1 py-3 bg-space-700 hover:bg-space-600 text-gray-300 rounded-lg font-semibold transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleFulfillBuyOffer}
                disabled={
                  processing ||
                  fulfillModal.quantity < 1 ||
                  fulfillModal.quantity > (fulfillModal.offer.quantity - fulfillModal.offer.quantity_filled) ||
                  fulfillModal.quantity > getAvailableStock(fulfillModal.offer.listing_type, fulfillModal.offer.item_code) ||
                  (fulfillModal.monthlyRemaining !== null && fulfillModal.monthlyRemaining <= 0) ||
                  telegramLinked === false
                }
                className="flex-1 py-3 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 shadow-[0_0_18px_-4px_rgba(34,197,94,0.8)] hover:brightness-110 active:scale-[0.98] disabled:bg-none disabled:bg-space-600 disabled:text-gray-500 disabled:shadow-none"
              >
                {processing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : telegramLinked === false ? (
                  <>
                    <MessageCircle className="w-5 h-5" />
                    {t.market.telegramRequired}
                  </>
                ) : (
                  <>
                    <Coins className="w-5 h-5" />
                    {t.market.confirmFulfill}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* [COLMKT6] Detalle de edificios de la colonia en venta */}
      {buildingsListing && buildingsListing.planet_id && (
        <ColonyBuildingsModal
          listingId={buildingsListing.id}
          colonyName={colonyInfo[buildingsListing.planet_id]?.name || getItemName(buildingsListing.listing_type, buildingsListing.item_code)}
          coords={colonyInfo[buildingsListing.planet_id]
            ? `${colonyInfo[buildingsListing.planet_id].galaxy}:${colonyInfo[buildingsListing.planet_id].solar_system}:${colonyInfo[buildingsListing.planet_id].position}`
            : '?:?:?'}
          imageUrl={getColonyImage(buildingsListing)}
          fieldsUsed={colonyInfo[buildingsListing.planet_id]?.fields_used}
          fieldsMax={colonyInfo[buildingsListing.planet_id]?.fields_max}
          onClose={closeBuildingsModal}
        />
      )}
    </div>
  );
}
