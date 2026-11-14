import { useState, useEffect, useCallback, Fragment } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminStore } from '../../store/adminStore';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { MultiAccountDetection } from './MultiAccountDetection';
import { RecaptchaSection } from './RecaptchaSection';
import { PremiumMissionsPricingSection } from './PremiumMissionsPricingSection';
import { RaffleAdminPanel } from './RaffleAdminPanel';
import { AdminP2PDisputes } from './AdminP2PDisputes';
import { AdminKYC } from './AdminKYC';
import { AdminDepletionSection } from './AdminDepletionSection';
import { AdminFinanceAudit } from './AdminFinanceAudit';
import { ShareholderReferralsPanel } from './ShareholderReferralsPanel';
import { AdminUserEconomyModal } from './AdminUserEconomyModal';
import {
  Shield,
  Gauge,
  Mail,
  Save,
  AlertCircle,
  CheckCircle,
  Rocket,
  Zap,
  Building2,
  Wallet,
  Play,
  RefreshCw,
  Copy,
  X,
  Check,
  Send,
  Percent,
  Users,
  Store,
  TrendingUp,
  DollarSign,
  Calendar,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  BarChart3,
  Banknote,
  Coins,
  FlaskConical,
  ShieldCheck,
  Crown,
  Gem,
  UserX,
  Eye,
  AlertTriangle,
  Network,
  ArrowLeftRight,
  FileWarning,
  CheckCircle2,
  XCircle,
  Download,
  Megaphone,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  MailCheck,
  Trophy,
  Scale,
  Gift,
  MessageCircle,
  Trash2,
  Award,
  Star,
  Box,
  Wrench,
  Upload,
  Database,
  FileText,
  Twitter,
  Flame,
  CalendarDays,
  Camera,
  Pencil,
  Globe,
  Ticket,
  Bot,
  Tag,
  Swords,
  Castle,
  Ban,
  Factory,
  Plus,
} from 'lucide-react';

export function AdminPage() {
  const {
    isAdmin,
    isFinancialViewer,
    speeds,
    smtpSettings,
    walletConfig,
    serverWalletInfo,
    pendingWithdrawals,
    feeSettings,
    fxuCostRatios,
    isLoading,
    fetchSpeeds,
    fetchSmtpSettings,
    updateSpeeds,
    updateSmtpSettings,
    sendTestEmail,
    fetchWalletConfig,
    fetchServerWalletInfo,
    updateWalletConfig,
    fetchPendingWithdrawals,
    processWithdrawals,
    approveWithdrawal,
    cancelWithdrawal,
    fetchFeeSettings,
    updateFeeSettings,
    fetchFxuCostRatios,
    updateFxuCostRatios,
    financialStats,
    recentRevenue,
    revenueByType,
    dailyRevenue,
    weeklyRevenue,
    monthlyRevenue,
    revenueSummary,
    adminWithdrawals,
    myShareholderEarnings,
    fetchMyShareholderEarnings,
    fetchFinancialStats,
    fetchRecentRevenue,
    fetchRevenueByType,
    fetchDailyRevenue,
    fetchWeeklyRevenue,
    fetchMonthlyRevenue,
    fetchRevenueSummary,
    fetchAdminWithdrawals,
    p2pEconomyStats,
    fetchP2PEconomyStats,
    adminRequestWithdrawal,
    adminCancelWithdrawal,
    officerPricing,
    fetchOfficerPricing,
    updateOfficerPricing,
    cosmeticPricing,
    cosmeticTungPrice,
    fetchCosmeticPricing,
    updateCosmeticPricing,
    jackpotStats,
    jackpotConfig,
    jackpotHistory,
    fetchJackpotStats,
    fetchJackpotConfig,
    fetchJackpotHistory,
    updateJackpotConfig,
    addToJackpot,
    weeklySnapshots,
    currentWeekSnapshot,
    fetchWeeklySnapshots,
    takeWeeklySnapshotNow,
    shareholders,
    shareholdersTotalPercentage,
    shareholdersTotalPaidFxu,
    shareholdersTotalPaidUsdt,
    shareholdersMonthPaidFxu,
    shareholdersMonthPaidUsdt,
    shareholdersTodayPaidFxu,
    shareholdersWeekPaidFxu,
    shareholdersPendingFxu,
    fetchShareholders,
    addShareholder,
    updateShareholder,
    removeShareholder,
  } = useAdminStore();

  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
  // Precio de mercado en vivo de TUNG (DexScreener), obtenido del servidor via RPC
  const fetchTungPrice = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_live_tung_price_usd');
      if (!error && data != null) {
        const price = typeof data === 'number' ? data : parseFloat(data as string);
        if (!isNaN(price) && price > 0) {
          setTungPriceUsd(price);
        }
      }
    } catch (e) {
      console.error('Error fetching TUNG price:', e);
    }
  }, []);
  // Convierte una cantidad de TUNG a su valor en USDT usando el precio de mercado en vivo
  const fmtUsdt = (tung: number): string =>
    tungPriceUsd != null
      ? `$${(tung * tungPriceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'auditoria' | 'speeds' | 'fees' | 'fxu' | 'officers' | 'cosmetics' | 'smtp' | 'wallet' | 'antimulti' | 'broadcast' | 'users' | 'jackpot' | 'plus' | 'supply_boxes' | 'blueprints' | 'hallOfFame' | 'maintenance' | 'inactive' | 'protection' | 'recaptcha' | 'twitter' | 'market' | 'lottery' | 'raffles' | 'bots' | 'npc_roles' | 'p2p_disputes' | 'kyc' | 'inventory' | 'hero' | 'wars' | 'depletion' | 'premium_missions' | 'accionistas'>('dashboard');

  // Jackpot state
  const [jackpotContributionRate, setJackpotContributionRate] = useState(10);
  const [jackpotWinChance, setJackpotWinChance] = useState(1);
  const [jackpotMinWinPercent, setJackpotMinWinPercent] = useState(10);
  const [jackpotMaxWinPercent, setJackpotMaxWinPercent] = useState(50);
  const [jackpotMinForWin, setJackpotMinForWin] = useState(1000);
  const [jackpotAddAmount, setJackpotAddAmount] = useState('');
  const [jackpotMessage, setJackpotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [sendInGame, setSendInGame] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendTelegram, setSendTelegram] = useState(false);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [telegramGroups, setTelegramGroups] = useState<Array<{
    id: string;
    chat_id: string;
    title: string;
    username: string | null;
    is_enabled: boolean;
    last_message_at: string | null;
  }>>([]);
  const [isSyncingGroups, setIsSyncingGroups] = useState(false);
  const [isVerifyingMemberships, setIsVerifyingMemberships] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [marketNotificationsEnabled, setMarketNotificationsEnabled] = useState(false);
  const [isTogglingMarketNotifications, setIsTogglingMarketNotifications] = useState(false);
  const [editedOfficerPricing, setEditedOfficerPricing] = useState<typeof officerPricing>([]);
  const [officerMessage, setOfficerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editedCosmeticPricing, setEditedCosmeticPricing] = useState<typeof cosmeticPricing>([]);
  const [cosmeticMessage, setCosmeticMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isBackingUpComplete, setIsBackingUpComplete] = useState(false);
  const [isBackingUpClean, setIsBackingUpClean] = useState(false);
  const [isExportingFull, setIsExportingFull] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ table: string; count: number; total: number } | null>(null);

  const [gameSpeed, setGameSpeed] = useState(speeds.game_speed);
  const [fleetSpeed, setFleetSpeed] = useState(speeds.fleet_speed);
  const [resourceSpeed, setResourceSpeed] = useState(speeds.resource_speed);
  const [fleetDebrisRatio, setFleetDebrisRatio] = useState(speeds.fleet_debris_ratio);
  const [defenseDebrisRatio, setDefenseDebrisRatio] = useState(speeds.defense_debris_ratio);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [isLoadingRegistrationConfig, setIsLoadingRegistrationConfig] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [protectionRatio, setProtectionRatio] = useState(5);
  const [noobProtectionPoints, setNoobProtectionPoints] = useState(5000);
  const [bashingProtection, setBashingProtection] = useState(true);
  const [isLoadingProtection, setIsLoadingProtection] = useState(false);
  const [protectionMessage, setProtectionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [marketLimitsEnabled, setMarketLimitsEnabled] = useState(true);
  const [isLoadingMarketLimits, setIsLoadingMarketLimits] = useState(false);
  const [isTogglingMarketLimits, setIsTogglingMarketLimits] = useState(false);
  const [marketLimitsMessage, setMarketLimitsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // [FTFLAG1] Interruptor de admin del limite de fortalezas/planeta del tesoro
  const [strongholdLimitEnabled, setStrongholdLimitEnabled] = useState(true);
  const [strongholdInfo, setStrongholdInfo] = useState<{ fortresses_owned: number; treasures_owned: number; alliances_over_limit: number } | null>(null);
  const [isLoadingStrongholdLimit, setIsLoadingStrongholdLimit] = useState(false);
  const [isTogglingStrongholdLimit, setIsTogglingStrongholdLimit] = useState(false);
  const [strongholdLimitMessage, setStrongholdLimitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpEnabled, setSmtpEnabled] = useState(false);

  const [speedMessage, setSpeedMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [smtpMessage, setSmtpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [walletMessage, setWalletMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [feeMessage, setFeeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [marketFeePercent, setMarketFeePercent] = useState(feeSettings.market_fee_percent);

  // TUNG cost ratio state
  const [buildingRatio, setBuildingRatio] = useState(fxuCostRatios.building_ratio);
  const [researchRatio, setResearchRatio] = useState(fxuCostRatios.research_ratio);
  const [shipsRatio, setShipsRatio] = useState(fxuCostRatios.ships_ratio);
  const [defenseRatio, setDefenseRatio] = useState(fxuCostRatios.defense_ratio);
  const [fleetRatio, setFleetRatio] = useState(fxuCostRatios.fleet_ratio);
  const [fleetJackpotPercent, setFleetJackpotPercent] = useState(fxuCostRatios.fleet_jackpot_percent);
  const [fxuMessage, setFxuMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Precio en USD (PRINCIPAL) — 0 = usar el valor TUNG por defecto.
  // El jugador paga el equivalente en TUNG al precio de mercado, igual que oficiales.
  const [buildingRatioUsd, setBuildingRatioUsd] = useState(0);
  const [researchRatioUsd, setResearchRatioUsd] = useState(0);
  const [shipsRatioUsd, setShipsRatioUsd] = useState(0);
  const [defenseRatioUsd, setDefenseRatioUsd] = useState(0);
  const [fleetRatioUsd, setFleetRatioUsd] = useState(0);
  const [renamePlanetCostUsd, setRenamePlanetCostUsd] = useState(0);
  const [renameAllianceCostUsd, setRenameAllianceCostUsd] = useState(0);
  const [createAllianceCostUsd, setCreateAllianceCostUsd] = useState(0);
  const [dailyStreakCostUsd, setDailyStreakCostUsd] = useState(0);
  const [liveTungPrice, setLiveTungPrice] = useState<number | null>(null);

  // Admin withdrawal state
  const [adminWithdrawAmount, setAdminWithdrawAmount] = useState('');
  const [adminWithdrawAddress, setAdminWithdrawAddress] = useState('');
  const [adminWithdrawMessage, setAdminWithdrawMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAdminWithdrawModal, setShowAdminWithdrawModal] = useState(false);
  const [referralCommissionPercent, setReferralCommissionPercent] = useState(feeSettings.referral_commission_percent);
  const [expeditionExtraFee, setExpeditionExtraFee] = useState(feeSettings.expedition_extra_fee_fxu);
  const [p2pFeePercent, setP2pFeePercent] = useState(feeSettings.p2p_fee_percent);
  const [p2pFeeAdminShare, setP2pFeeAdminShare] = useState(feeSettings.p2p_fee_admin_share);
  const [p2pFeeReferrerShare, setP2pFeeReferrerShare] = useState(feeSettings.p2p_fee_referrer_share);
  const [p2pFeePoolShare, setP2pFeePoolShare] = useState(feeSettings.p2p_fee_pool_share);
  const [marketFeeAdminShare, setMarketFeeAdminShare] = useState(feeSettings.market_fee_admin_share);
  const [marketFeePoolShare, setMarketFeePoolShare] = useState(feeSettings.market_fee_pool_share);
  const [marketFeeReferralShare, setMarketFeeReferralShare] = useState(feeSettings.market_fee_referral_share);
  const [jackpotFeePercent, setJackpotFeePercent] = useState(jackpotConfig?.contribution_rate ?? 10);

  const [minDeposit, setMinDeposit] = useState(0);
  const [maxWithdrawalDaily, setMaxWithdrawalDaily] = useState(0);
  const [withdrawalFeePercent, setWithdrawalFeePercent] = useState(0);
  const [requiredConfirmations, setRequiredConfirmations] = useState(3);
  const [depositsEnabled, setDepositsEnabled] = useState(true);
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(true);

  const [usdtMinDeposit, setUsdtMinDeposit] = useState(1);
  const [usdtMaxWithdrawalDaily, setUsdtMaxWithdrawalDaily] = useState(10000);
  const [usdtWithdrawalFeePercent, setUsdtWithdrawalFeePercent] = useState(2);
  const [usdtDepositsEnabled, setUsdtDepositsEnabled] = useState(true);
  const [usdtWithdrawalsEnabled, setUsdtWithdrawalsEnabled] = useState(true);
  const [swapFeePercent, setSwapFeePercent] = useState(1);

  // Flat withdrawal fees (stored in game_settings). TUNG fee is charged as its
  // USD-equivalent in TUNG; USDT fee is a flat USDT amount.
  const [withdrawalFeeUsd, setWithdrawalFeeUsd] = useState(1);
  const [usdtWithdrawalFeeFlat, setUsdtWithdrawalFeeFlat] = useState(1);
  // Fee mode: 'flat' (monto fijo) or 'percent' (porcentaje).
  const [withdrawalFeeMode, setWithdrawalFeeMode] = useState<'flat' | 'percent'>('flat');

  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [users, setUsers] = useState<Array<{
    id: string;
    username: string;
    email: string;
    email_verified: boolean;
    is_admin: boolean;
    created_at: string;
    tung_balance: number;
    is_plus?: boolean;
    plus_expires_at?: string | null;
    is_banned?: boolean;
    fee_exempt?: boolean;
  }>>([]);
  const [usersPage, setUsersPage] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [economyUser, setEconomyUser] = useState<{ id: string; username: string } | null>(null);
  const [resendingVerification, setResendingVerification] = useState<string | null>(null);
  const [togglingPlus, setTogglingPlus] = useState<string | null>(null);
  const [togglingBan, setTogglingBan] = useState<string | null>(null);
  const [togglingFee, setTogglingFee] = useState<string | null>(null);
  const USERS_PER_PAGE = 50;

  // Accionistas state
  const [shEmail, setShEmail] = useState('');
  const [shPercentage, setShPercentage] = useState('');
  const [shCanView, setShCanView] = useState(true);
  const [shSaving, setShSaving] = useState(false);
  const [shEditingId, setShEditingId] = useState<string | null>(null);
  const [shExpandedId, setShExpandedId] = useState<string | null>(null);
  const [shEditPct, setShEditPct] = useState('');
  const [shMessage, setShMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // War state
  const [warList, setWarList] = useState<any[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiUserCount, setAiUserCount] = useState(0);
  const [togglingAI, setTogglingAI] = useState(false);
  const [warTitle, setWarTitle] = useState('');
  const [warEntryFee, setWarEntryFee] = useState(5000);
  const [warDuration, setWarDuration] = useState(7); // días
  const [warLoading, setWarLoading] = useState(false);
  const [warMessage, setWarMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadWars = async () => {
    setWarLoading(true);
    const { data } = await supabase.rpc('get_alliance_wars', { p_filter: 'all' });
    setWarList(data || []);
    setWarLoading(false);
  };

  const createWar = async () => {
    setWarMessage(null);
    const { data, error } = await supabase.rpc('create_alliance_war', {
      p_title: warTitle, p_entry_fee_fxu: warEntryFee, p_war_type: 'weekly', p_duration_hours: warDuration * 24
    });
    if (error) { setWarMessage({ type: 'error', text: error.message }); return; }
    if (data && !data.success) { setWarMessage({ type: 'error', text: data.error }); return; }
    setWarMessage({ type: 'success', text: 'Guerra creada: ' + data.war_id });
    setWarTitle(''); loadWars();
  };

  const startWar = async (id: string) => {
    const { data, error } = await supabase.rpc('start_alliance_war', { p_war_id: id });
    if (error) { setWarMessage({ type: 'error', text: error.message }); return; }
    if (data && !data.success) { setWarMessage({ type: 'error', text: data.error }); return; }
    setWarMessage({ type: 'success', text: data.message || 'Guerra iniciada' });
    loadWars();
  };

  const resolveWar = async (id: string) => {
    const { data, error } = await supabase.rpc('resolve_alliance_war', { p_war_id: id });
    if (error) { setWarMessage({ type: 'error', text: error.message }); return; }
    if (data && !data.success) { setWarMessage({ type: 'error', text: data.error || 'Error al resolver' }); return; }
    const winners = (data as any)?.winners;
    const firstPlace = winners?.[0];
    const msg = firstPlace 
      ? `Guerra resuelta. 🥇 ${firstPlace.alliance_name} (${firstPlace.share} TUNG)`
      : 'Guerra resuelta.';
    setWarMessage({ type: 'success', text: msg });
    loadWars();
  };

  const loadAIStatus = async () => {
    const { data } = await supabase.rpc('get_global_android_ai_status');
    if (data) { setAiEnabled((data as any).enabled); setAiUserCount((data as any).active_users); }
  };

  const toggleAI = async () => {
    setTogglingAI(true);
    const { error } = await supabase.rpc('admin_set_android_ai', { p_enabled: !aiEnabled });
    setTogglingAI(false);
    if (!error) { setAiEnabled(!aiEnabled); loadAIStatus(); }
  };

  useEffect(() => {
    loadAIStatus();
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && activeTab === 'jackpot') {
      fetchJackpotStats();
      fetchJackpotConfig();
      fetchJackpotHistory();
    }
    if (isAdmin && activeTab === 'wars') {
      loadWars();
    }
  }, [isAdmin, activeTab, fetchJackpotStats, fetchJackpotConfig, fetchJackpotHistory, loadWars]);

  useEffect(() => {
    if (isAdmin && activeTab === 'accionistas') {
      fetchShareholders();
    }
  }, [isAdmin, activeTab, fetchShareholders]);

  const fetchTelegramGroups = async () => {
    const { data } = await supabase
      .from('telegram_groups')
      .select('*')
      .order('title');
    if (data) {
      setTelegramGroups(data);
      const enabledGroups = data.filter(g => g.is_enabled);
      setSendTelegram(enabledGroups.length > 0);
    }
  };

  const fetchMarketNotificationConfig = async () => {
    const { data } = await supabase
      .from('market_notification_config')
      .select('is_enabled')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      setMarketNotificationsEnabled(data.is_enabled);
    }
  };

  const handleToggleMarketNotifications = async () => {
    setIsTogglingMarketNotifications(true);
    try {
      const newValue = !marketNotificationsEnabled;
      const { error } = await supabase
        .from('market_notification_config')
        .update({ is_enabled: newValue, updated_at: new Date().toISOString() })
        .eq('id', 1);

      if (error) {
        setTelegramMessage({ type: 'error', text: 'Error al actualizar configuracion' });
      } else {
        setMarketNotificationsEnabled(newValue);
        setTelegramMessage({
          type: 'success',
          text: newValue
            ? 'Notificaciones de mercado activadas'
            : 'Notificaciones de mercado desactivadas'
        });
      }
    } catch {
      setTelegramMessage({ type: 'error', text: 'Error de conexion' });
    } finally {
      setIsTogglingMarketNotifications(false);
      setTimeout(() => setTelegramMessage(null), 3000);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'broadcast') {
      fetchTelegramGroups();
      fetchMarketNotificationConfig();
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (jackpotConfig) {
      setJackpotContributionRate(jackpotConfig.contribution_rate);
      setJackpotWinChance(jackpotConfig.win_chance);
      setJackpotMinWinPercent(jackpotConfig.min_win_percent);
      setJackpotMaxWinPercent(jackpotConfig.max_win_percent);
      setJackpotMinForWin(jackpotConfig.min_jackpot_for_win);
    }
  }, [jackpotConfig]);

  const fetchUsers = async (page: number, search: string) => {
    setUsersLoading(true);
    try {
      const from = page * USERS_PER_PAGE;
      const to = from + USERS_PER_PAGE - 1;

      let countQuery = supabase.from('profiles').select('id', { count: 'exact', head: true });
      let dataQuery = supabase
        .from('profiles')
        .select('id, username, email, email_verified, is_admin, created_at, tung_balance, autopilot_eligible, autopilot_active, is_banned')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        countQuery = countQuery.or(`username.ilike.${searchTerm},email.ilike.${searchTerm}`);
        dataQuery = dataQuery.or(`username.ilike.${searchTerm},email.ilike.${searchTerm}`);
      }

      const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

      if (countResult.error) throw countResult.error;
      if (dataResult.error) throw dataResult.error;

      setTotalUsers(countResult.count || 0);

      const rows = dataResult.data || [];

      // Estado VIP (Plus) de los usuarios listados. La politica RLS
      // "Admins can view all subscriptions" ya permite esta lectura.
      let plusMap: Record<string, string> = {};
      if (rows.length > 0) {
        const { data: activeSubs } = await supabase
          .from('plus_subscriptions')
          .select('user_id, expires_at')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .in('user_id', rows.map((u) => u.id));
        plusMap = (activeSubs || []).reduce((acc: Record<string, string>, s: { user_id: string; expires_at: string }) => {
          acc[s.user_id] = s.expires_at;
          return acc;
        }, {});
      }

      // Cuentas exentas de comision de retiro (solo lectura para admins por RLS)
      let feeExempt = new Set<string>();
      if (rows.length > 0) {
        const { data: exemptRows } = await supabase
          .from('withdrawal_fee_exempt')
          .select('user_id')
          .in('user_id', rows.map((u) => u.id));
        feeExempt = new Set((exemptRows || []).map((r: { user_id: string }) => r.user_id));
      }

      setUsers(rows.map((u) => ({
        ...u,
        is_plus: !!plusMap[u.id],
        plus_expires_at: plusMap[u.id] || null,
        fee_exempt: feeExempt.has(u.id),
      })));
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleManualVerification = async (userId: string) => {
    if (!confirm('Verificar manualmente este usuario? El usuario podra acceder al juego inmediatamente.')) {
      return;
    }

    setResendingVerification(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('No autenticado');
        setResendingVerification(null);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-verify-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_id: userId }),
        }
      );

      const result = await response.json();
      if (result.success) {
        alert('Usuario verificado correctamente');
        fetchUsers(usersPage, userSearchTerm);
      } else {
        alert('Error: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error verifying user:', error);
      alert('Error de conexion al verificar usuario');
    } finally {
      setResendingVerification(null);
    }
  };

  const handleToggleAutopilotEligible = async (userId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    const action = newValue ? 'activar' : 'desactivar';
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} el piloto automatico para este usuario?`)) return;
    
    try {
      const { data, error } = await supabase.rpc('admin_set_account_autopilot', { 
        p_user_id: userId, 
        p_enabled: newValue 
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (result.success) {
        fetchUsers(usersPage, userSearchTerm);
      } else {
        alert('Error: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error toggling autopilot:', error);
      alert('Error al cambiar piloto automatico');
    }
  };

  const handleToggleUserPlus = async (userId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    let planCode = 'plus_monthly';

    if (newValue) {
      const choice = prompt(
        'Activar VIP manualmente (sin cobro).\n\nEscribe la duracion:\n  1 = Semanal (7 dias)\n  2 = Mensual (1 mes)\n  3 = Semestral (6 meses)\n  4 = Anual (12 meses)',
        '2'
      );
      if (choice === null) return;
      const map: Record<string, string> = {
        '1': 'plus_weekly',
        '2': 'plus_monthly',
        '3': 'plus_6months',
        '4': 'plus_annual',
      };
      if (!map[choice.trim()]) {
        alert('Opcion invalida');
        return;
      }
      planCode = map[choice.trim()];
    } else if (!confirm('Retirar el VIP a este usuario?')) {
      return;
    }

    setTogglingPlus(userId);
    try {
      const { data, error } = await supabase.rpc('admin_set_user_plus', {
        p_user_id: userId,
        p_enabled: newValue,
        p_plan_code: planCode,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; expires_at?: string; plan?: string };
      if (result.success) {
        if (newValue) {
          alert(`VIP activado (${result.plan}) hasta ${result.expires_at ? new Date(result.expires_at).toLocaleDateString() : '?'}`);
        }
        fetchUsers(usersPage, userSearchTerm);
      } else {
        alert('Error: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error toggling VIP:', error);
      alert('Error al cambiar el VIP');
    } finally {
      setTogglingPlus(null);
    }
  };

  const handleToggleUserBan = async (userId: string, username: string, currentValue: boolean) => {
    const newValue = !currentValue;
    const message = newValue
      ? `Banear la cuenta de "${username}"?\n\nNo podra iniciar sesion y se cerrara su sesion actual.`
      : `Quitar el baneo a "${username}"? Podra volver a entrar.`;
    if (!confirm(message)) return;

    setTogglingBan(userId);
    try {
      const { data, error } = await supabase.rpc('admin_set_user_banned', {
        p_user_id: userId,
        p_banned: newValue,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (result.success) {
        alert(newValue ? 'Cuenta baneada' : 'Baneo retirado');
        fetchUsers(usersPage, userSearchTerm);
      } else {
        alert('Error: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error toggling ban:', error);
      alert('Error al cambiar el estado de la cuenta');
    } finally {
      setTogglingBan(null);
    }
  };

  const handleToggleFeeExempt = async (userId: string, username: string, currentValue: boolean) => {
    const newValue = !currentValue;
    const message = newValue
      ? `"${username}" NO pagara comision al retirar. ¿Continuar?`
      : `"${username}" volvera a pagar la comision normal al retirar. ¿Continuar?`;
    if (!confirm(message)) return;

    setTogglingFee(userId);
    try {
      const { data, error } = await supabase.rpc('admin_set_withdrawal_fee_exempt', {
        p_user_id: userId,
        p_exempt: newValue,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (result.success) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, fee_exempt: newValue } : u)));
      } else {
        alert('Error: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error toggling fee exemption:', error);
      alert('Error al cambiar la comision de retiro');
    } finally {
      setTogglingFee(null);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'users') {
      fetchUsers(usersPage, userSearchTerm);
    }
  }, [isAdmin, activeTab, usersPage]);

  useEffect(() => {
    if (isAdmin) {
      fetchSmtpSettings();
      fetchWalletConfig();
      fetchServerWalletInfo();
      fetchPendingWithdrawals();
      fetchFeeSettings();
      fetchFxuCostRatios();
      fetchOfficerPricing();
      fetchCosmeticPricing();
      fetchFinancialStats();
      fetchRecentRevenue();
      fetchRevenueByType();
      fetchDailyRevenue();
      fetchWeeklyRevenue();
      fetchMonthlyRevenue();
      fetchRevenueSummary();
      fetchAdminWithdrawals();
      fetchWeeklySnapshots();
      fetchP2PEconomyStats();
      fetchTungPrice();
    } else if (isFinancialViewer) {
      fetchFinancialStats();
      fetchRecentRevenue();
      fetchRevenueByType();
      fetchDailyRevenue();
      fetchWeeklyRevenue();
      fetchMonthlyRevenue();
      fetchRevenueSummary();
      fetchWeeklySnapshots();
      fetchP2PEconomyStats();
      fetchTungPrice();
      fetchMyShareholderEarnings();
    }
  }, [isAdmin, isFinancialViewer, fetchSmtpSettings, fetchWalletConfig, fetchServerWalletInfo, fetchPendingWithdrawals, fetchFeeSettings, fetchFxuCostRatios, fetchOfficerPricing, fetchCosmeticPricing, fetchFinancialStats, fetchRecentRevenue, fetchRevenueByType, fetchDailyRevenue, fetchWeeklyRevenue, fetchMonthlyRevenue, fetchRevenueSummary, fetchAdminWithdrawals, fetchWeeklySnapshots, fetchP2PEconomyStats, fetchTungPrice, fetchMyShareholderEarnings]);

  useEffect(() => {
    if (officerPricing.length > 0) {
      setEditedOfficerPricing(officerPricing);
    }
  }, [officerPricing]);

  useEffect(() => {
    if (cosmeticPricing.length > 0) {
      setEditedCosmeticPricing(cosmeticPricing);
    }
  }, [cosmeticPricing]);

  useEffect(() => {
    setGameSpeed(speeds.game_speed);
    setFleetSpeed(speeds.fleet_speed);
    setResourceSpeed(speeds.resource_speed);
    setFleetDebrisRatio(speeds.fleet_debris_ratio);
    setDefenseDebrisRatio(speeds.defense_debris_ratio);
  }, [speeds]);

  useEffect(() => {
    if (smtpSettings) {
      setSmtpHost(smtpSettings.smtp_host);
      setSmtpPort(smtpSettings.smtp_port);
      setSmtpUser(smtpSettings.smtp_user);
      setSmtpPassword(smtpSettings.smtp_password);
      setSmtpFromEmail(smtpSettings.smtp_from_email);
      setSmtpFromName(smtpSettings.smtp_from_name);
      setSmtpEnabled(smtpSettings.is_enabled);
    }
  }, [smtpSettings]);

  useEffect(() => {
    if (walletConfig) {
      setMinDeposit(walletConfig.min_deposit);
      setMaxWithdrawalDaily(walletConfig.max_withdrawal_daily);
      setWithdrawalFeePercent(walletConfig.withdrawal_fee_percent);
      setRequiredConfirmations(walletConfig.required_confirmations);
      setDepositsEnabled(walletConfig.is_deposits_enabled);
      setWithdrawalsEnabled(walletConfig.is_withdrawals_enabled);
      setUsdtMinDeposit(walletConfig.usdt_min_deposit);
      setUsdtMaxWithdrawalDaily(walletConfig.usdt_max_withdrawal_daily);
      setUsdtWithdrawalFeePercent(walletConfig.usdt_withdrawal_fee_percent);
      setUsdtDepositsEnabled(walletConfig.is_usdt_deposits_enabled);
      setUsdtWithdrawalsEnabled(walletConfig.is_usdt_withdrawals_enabled);
      setSwapFeePercent(walletConfig.swap_fee_percent ?? 1);
    }
  }, [walletConfig]);

  // Load flat withdrawal fees from game_settings (source of truth for request_withdrawal*)
  useEffect(() => {
    const loadFlatFees = async () => {
      try {
        const { data } = await supabase
          .from('game_settings')
          .select('key, value')
          .in('key', ['withdrawal_fee_usd', 'usdt_withdrawal_fee_flat', 'withdrawal_fee_mode']);
        if (data) {
          data.forEach((s: { key: string; value: string }) => {
            if (s.key === 'withdrawal_fee_usd') setWithdrawalFeeUsd(parseFloat(s.value) || 1);
            if (s.key === 'usdt_withdrawal_fee_flat') setUsdtWithdrawalFeeFlat(parseFloat(s.value) || 1);
            if (s.key === 'withdrawal_fee_mode') setWithdrawalFeeMode(s.value === 'percent' ? 'percent' : 'flat');
          });
        }
      } catch {}
    };
    if (isAdmin) loadFlatFees();
  }, [isAdmin]);

  useEffect(() => {
    setMarketFeePercent(feeSettings.market_fee_percent);
    setReferralCommissionPercent(feeSettings.referral_commission_percent);
    setExpeditionExtraFee(feeSettings.expedition_extra_fee_fxu);
    setP2pFeePercent(feeSettings.p2p_fee_percent);
    setP2pFeeAdminShare(feeSettings.p2p_fee_admin_share);
    setP2pFeeReferrerShare(feeSettings.p2p_fee_referrer_share);
    setP2pFeePoolShare(feeSettings.p2p_fee_pool_share);
    setMarketFeeAdminShare(feeSettings.market_fee_admin_share);
    setMarketFeePoolShare(feeSettings.market_fee_pool_share);
    setMarketFeeReferralShare(feeSettings.market_fee_referral_share);
  }, [feeSettings]);

  useEffect(() => {
    if (jackpotConfig) {
      setJackpotFeePercent(jackpotConfig.contribution_rate);
    }
  }, [jackpotConfig]);

  useEffect(() => {
    if (isAdmin && activeTab === 'fees') {
      fetchJackpotConfig();
    }
  }, [isAdmin, activeTab, fetchJackpotConfig]);

  useEffect(() => {
    setBuildingRatio(fxuCostRatios.building_ratio);
    setResearchRatio(fxuCostRatios.research_ratio);
    setShipsRatio(fxuCostRatios.ships_ratio);
    setDefenseRatio(fxuCostRatios.defense_ratio);
    setFleetRatio(fxuCostRatios.fleet_ratio);
    setFleetJackpotPercent(fxuCostRatios.fleet_jackpot_percent);
  }, [fxuCostRatios]);

  // Load USD dynamic-pricing values + live TUNG price when TUNG tab is active
  useEffect(() => {
    const loadUsdPricing = async () => {
      try {
        const { data } = await supabase
          .from('game_settings')
          .select('key, value')
          .in('key', [
            'fxu_cost_ratio_building_usd', 'fxu_cost_ratio_research_usd', 'fxu_cost_ratio_ships_usd',
            'fxu_cost_ratio_defense_usd', 'fxu_cost_ratio_fleet_usd',
            'fxu_rename_planet_cost_usd', 'fxu_rename_alliance_cost_usd', 'fxu_create_alliance_cost_usd',
            'daily_streak_cost_usd', 'tung_price_usd',
          ]);
        if (data) {
          data.forEach((s: { key: string; value: string }) => {
            const n = Number(s.value) || 0;
            if (s.key === 'fxu_cost_ratio_building_usd') setBuildingRatioUsd(n);
            if (s.key === 'fxu_cost_ratio_research_usd') setResearchRatioUsd(n);
            if (s.key === 'fxu_cost_ratio_ships_usd') setShipsRatioUsd(n);
            if (s.key === 'fxu_cost_ratio_defense_usd') setDefenseRatioUsd(n);
            if (s.key === 'fxu_cost_ratio_fleet_usd') setFleetRatioUsd(n);
            if (s.key === 'fxu_rename_planet_cost_usd') setRenamePlanetCostUsd(n);
            if (s.key === 'fxu_rename_alliance_cost_usd') setRenameAllianceCostUsd(n);
            if (s.key === 'fxu_create_alliance_cost_usd') setCreateAllianceCostUsd(n);
            if (s.key === 'daily_streak_cost_usd') setDailyStreakCostUsd(n);
            if (s.key === 'tung_price_usd') setLiveTungPrice(n > 0 ? n : null);
          });
        }
      } catch {}
    };
    if (isAdmin && activeTab === 'fxu') loadUsdPricing();
  }, [isAdmin, activeTab]);

  if (!isAdmin && !isFinancialViewer) {
    return <Navigate to="/game" replace />;
  }

  useEffect(() => {
    const loadRegistrationConfig = async () => {
      setIsLoadingRegistrationConfig(true);
      try {
        const { data, error } = await supabase.rpc('admin_get_registration_config');

        if (error) throw error;

        if (data?.success) {
          setRegistrationEnabled(data.enabled ?? true);
        }
      } catch (error) {
        console.error('Error loading registration config:', error);
      } finally {
        setIsLoadingRegistrationConfig(false);
      }
    };

    if (isAdmin) {
      loadRegistrationConfig();
    }
  }, [isAdmin]);

  useEffect(() => {
    const loadProtectionSettings = async () => {
      setIsLoadingProtection(true);
      try {
        const { data, error } = await supabase
          .from('game_settings')
          .select('key, value')
          .in('key', ['protection_ratio', 'newbie_protection_points', 'bashing_protection']);

        if (error) throw error;
        if (data) {
          data.forEach((setting: { key: string; value: string }) => {
            if (setting.key === 'protection_ratio') setProtectionRatio(parseInt(setting.value) || 5);
            if (setting.key === 'newbie_protection_points') setNoobProtectionPoints(parseInt(setting.value) || 5000);
            if (setting.key === 'bashing_protection') setBashingProtection(setting.value === 'true');
          });
        }
      } catch (error) {
        console.error('Error loading protection settings:', error);
      } finally {
        setIsLoadingProtection(false);
      }
    };

    if (isAdmin) {
      loadProtectionSettings();
    }
  }, [isAdmin]);

  const handleSaveProtection = async () => {
    setProtectionMessage(null);
    try {
      // game_settings solo permite SELECT via RLS; las escrituras se hacen con un
      // RPC SECURITY DEFINER que valida is_admin (evita el 403 del upsert directo).
      const { data, error } = await supabase.rpc('admin_update_protection_settings', {
        p_protection_ratio: protectionRatio,
        p_newbie_protection_points: noobProtectionPoints,
        p_bashing_protection: bashingProtection,
      });

      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'No autorizado');

      setProtectionMessage({ type: 'success', text: 'Proteccion actualizada correctamente' });
    } catch (error) {
      console.error('Error saving protection settings:', error);
      setProtectionMessage({ type: 'error', text: 'Error al guardar configuracion de proteccion' });
    }
    setTimeout(() => setProtectionMessage(null), 3000);
  };

  useEffect(() => {
    const loadMarketLimits = async () => {
      setIsLoadingMarketLimits(true);
      try {
        const { data, error } = await supabase
          .from('market_resource_limits')
          .select('monthly_limit_enabled')
          .eq('id', 1)
          .single();
        if (error) throw error;
        if (data) setMarketLimitsEnabled(data.monthly_limit_enabled);
      } catch (error) {
        console.error('Error loading market limits:', error);
      } finally {
        setIsLoadingMarketLimits(false);
      }
    };
    if (isAdmin) loadMarketLimits();
  }, [isAdmin]);

  const handleToggleMarketLimits = async () => {
    setIsTogglingMarketLimits(true);
    setMarketLimitsMessage(null);
    try {
      const newValue = !marketLimitsEnabled;
      const { error } = await supabase
        .from('market_resource_limits')
        .update({ monthly_limit_enabled: newValue, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      setMarketLimitsEnabled(newValue);
      setMarketLimitsMessage({
        type: 'success',
        text: `Limitaciones del mercado ${newValue ? 'activadas' : 'desactivadas'} correctamente`
      });
    } catch (error) {
      console.error('Error toggling market limits:', error);
      setMarketLimitsMessage({
        type: 'error',
        text: 'Error al cambiar estado de las limitaciones del mercado'
      });
    } finally {
      setIsTogglingMarketLimits(false);
      setTimeout(() => setMarketLimitsMessage(null), 3000);
    }
  };

  // [FTFLAG1] Carga del estado del limite de fortalezas / planeta del tesoro
  const loadStrongholdLimit = useCallback(async () => {
    setIsLoadingStrongholdLimit(true);
    try {
      const { data, error } = await supabase.rpc('get_stronghold_limit');
      if (error) throw error;
      if (data) {
        setStrongholdLimitEnabled(data.enabled !== false);
        setStrongholdInfo({
          fortresses_owned: data.fortresses_owned ?? 0,
          treasures_owned: data.treasures_owned ?? 0,
          alliances_over_limit: data.alliances_over_limit ?? 0
        });
      }
    } catch (error) {
      console.error('Error loading stronghold limit:', error);
    } finally {
      setIsLoadingStrongholdLimit(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadStrongholdLimit();
  }, [isAdmin, loadStrongholdLimit]);

  const handleToggleStrongholdLimit = async () => {
    const newValue = !strongholdLimitEnabled;
    if (newValue && (strongholdInfo?.alliances_over_limit ?? 0) > 0) {
      const ok = window.confirm(
        `Hay ${strongholdInfo?.alliances_over_limit} alianza(s) por encima del limite.\n\n` +
        'Al activar, cada una conservara solo la posicion que capturo primero. ' +
        'Las demas quedaran libres y las naves estacionadas volveran al planeta desde el que salieron.\n\n' +
        'Continuar?'
      );
      if (!ok) return;
    }
    setIsTogglingStrongholdLimit(true);
    setStrongholdLimitMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_set_stronghold_limit', { p_enabled: newValue });
      if (error) throw error;
      if (data && data.success === false) {
        setStrongholdLimitMessage({ type: 'error', text: data.error || 'No se pudo cambiar la opcion' });
        return;
      }
      setStrongholdLimitEnabled(newValue);
      const released = data?.released ?? 0;
      const fleets = data?.return_fleets ?? 0;
      setStrongholdLimitMessage({
        type: 'success',
        text: newValue
          ? `Limite activado. Posiciones liberadas: ${released}. Flotas de regreso: ${fleets}.`
          : 'Limite desactivado. Las alianzas pueden controlar varias fortalezas y el Planeta del Tesoro.'
      });
      await loadStrongholdLimit();
    } catch (error) {
      console.error('Error toggling stronghold limit:', error);
      setStrongholdLimitMessage({ type: 'error', text: 'Error al cambiar el limite de fortalezas' });
    } finally {
      setIsTogglingStrongholdLimit(false);
      setTimeout(() => setStrongholdLimitMessage(null), 6000);
    }
  };

  const handleSaveSpeeds = async () => {
    setSpeedMessage(null);
    const result = await updateSpeeds({
      game_speed: gameSpeed,
      fleet_speed: fleetSpeed,
      resource_speed: resourceSpeed,
      fleet_debris_ratio: fleetDebrisRatio,
      defense_debris_ratio: defenseDebrisRatio,
    });

    if (result.success) {
      await fetchSpeeds();
      setSpeedMessage({ type: 'success', text: 'Velocidades actualizadas correctamente' });
    } else {
      setSpeedMessage({ type: 'error', text: result.error || 'Error al actualizar' });
    }

    setTimeout(() => setSpeedMessage(null), 3000);
  };

  const handleToggleRegistration = async () => {
    setRegistrationMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_toggle_registration', {
        p_enabled: !registrationEnabled
      });

      if (error) throw error;

      if (data?.success) {
        setRegistrationEnabled(!registrationEnabled);
        setRegistrationMessage({
          type: 'success',
          text: `Registro ${!registrationEnabled ? 'habilitado' : 'deshabilitado'} correctamente`
        });
      } else {
        throw new Error(data?.error || 'Error al cambiar estado del registro');
      }
    } catch (error) {
      console.error('Error toggling registration:', error);
      setRegistrationMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al cambiar estado del registro'
      });
    }

    setTimeout(() => setRegistrationMessage(null), 3000);
  };

  const handleSaveSmtp = async () => {
    setSmtpMessage(null);
    const result = await updateSmtpSettings({
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_user: smtpUser,
      smtp_password: smtpPassword,
      smtp_from_email: smtpFromEmail,
      smtp_from_name: smtpFromName,
      is_enabled: smtpEnabled,
    });

    if (result.success) {
      setSmtpMessage({ type: 'success', text: 'Configuracion SMTP guardada' });
    } else {
      setSmtpMessage({ type: 'error', text: result.error || 'Error al guardar' });
    }

    setTimeout(() => setSmtpMessage(null), 3000);
  };

  const handleSaveFees = async () => {
    setFeeMessage(null);

    const p2pSplitSum = p2pFeeAdminShare + p2pFeeReferrerShare + p2pFeePoolShare;
    if (Math.abs(p2pSplitSum - 100) > 0.001) {
      setFeeMessage({ type: 'error', text: 'El split P2P debe sumar 100%' });
      setTimeout(() => setFeeMessage(null), 3000);
      return;
    }

    const marketSplitSum = marketFeeAdminShare + marketFeePoolShare + marketFeeReferralShare;
    if (Math.abs(marketSplitSum - 100) > 0.001) {
      setFeeMessage({ type: 'error', text: 'El split del mercado (Admin + Pool + Referido) debe sumar 100%' });
      setTimeout(() => setFeeMessage(null), 3000);
      return;
    }

    const result = await updateFeeSettings({
      market_fee_percent: marketFeePercent,
      referral_commission_percent: referralCommissionPercent,
      expedition_extra_fee_fxu: expeditionExtraFee,
      p2p_fee_percent: p2pFeePercent,
      p2p_fee_admin_share: p2pFeeAdminShare,
      p2p_fee_referrer_share: p2pFeeReferrerShare,
      p2p_fee_pool_share: p2pFeePoolShare,
      market_fee_admin_share: marketFeeAdminShare,
      market_fee_pool_share: marketFeePoolShare,
      market_fee_referral_share: marketFeeReferralShare,
    });

    if (!result.success) {
      setFeeMessage({ type: 'error', text: result.error || 'Error al actualizar' });
      setTimeout(() => setFeeMessage(null), 3000);
      return;
    }

    const jackpotResult = await updateJackpotConfig({
      contribution_rate: jackpotFeePercent,
    });

    if (jackpotResult.success) {
      setFeeMessage({ type: 'success', text: 'Comisiones actualizadas correctamente' });
    } else {
      setFeeMessage({ type: 'error', text: jackpotResult.error || 'Error al actualizar jackpot' });
    }

    setTimeout(() => setFeeMessage(null), 3000);
  };

  const handleSaveFxuRatios = async () => {
    setFxuMessage(null);
    const result = await updateFxuCostRatios({
      building_ratio: buildingRatio,
      research_ratio: researchRatio,
      ships_ratio: shipsRatio,
      defense_ratio: defenseRatio,
      fleet_ratio: fleetRatio,
      fleet_jackpot_percent: fleetJackpotPercent,
    });

    // Save USD dynamic-pricing values (PRINCIPAL). 0 = usar el valor TUNG por defecto.
    // game_settings solo permite SELECT via RLS, por eso se usa un RPC SECURITY DEFINER.
    let usdOk = true;
    let usdErrorText: string | null = null;
    try {
      const { data: usdData, error: usdError } = await supabase.rpc('admin_update_usd_pricing', {
        p_building_usd: buildingRatioUsd || 0,
        p_research_usd: researchRatioUsd || 0,
        p_ships_usd: shipsRatioUsd || 0,
        p_defense_usd: defenseRatioUsd || 0,
        p_fleet_usd: fleetRatioUsd || 0,
        p_rename_planet_usd: renamePlanetCostUsd || 0,
        p_rename_alliance_usd: renameAllianceCostUsd || 0,
        p_create_alliance_usd: createAllianceCostUsd || 0,
        p_daily_streak_usd: dailyStreakCostUsd || 0,
      });
      if (usdError) {
        usdOk = false;
        usdErrorText = usdError.message;
        console.error('Error saving USD pricing:', usdError);
      } else if (usdData && usdData.success === false) {
        usdOk = false;
        usdErrorText = usdData.error || 'Error al guardar precios USD';
        console.error('Error saving USD pricing:', usdData);
      }
    } catch (err) {
      usdOk = false;
      usdErrorText = err instanceof Error ? err.message : 'Error al guardar precios USD';
      console.error('Error saving USD pricing:', err);
    }

    if (result.success && usdOk) {
      setFxuMessage({ type: 'success', text: 'Costos actualizados correctamente' });
    } else {
      setFxuMessage({ type: 'error', text: usdErrorText || result.error || 'Error al actualizar' });
    }

    setTimeout(() => setFxuMessage(null), 3000);
  };

  // Input USD PRINCIPAL para la seccion de costos de acelerar.
  // El jugador paga el equivalente en TUNG al precio de mercado, igual que oficiales.
  const renderUsdField = (
    labelHint: string,
    value: number,
    onChange: (n: number) => void,
    step: number,
    previewTung?: number | null,
  ) => (
    <div>
      <label className="text-sm font-medium text-emerald-400">
        Precio en USD ({labelHint}) — 0 = usar TUNG por defecto
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        min="0"
        step={step}
        className="w-full mt-1 px-3 py-2 bg-emerald-950/30 border border-emerald-700/40 rounded-lg text-white focus:outline-none focus:border-emerald-500"
      />
      <p className="text-[11px] text-emerald-400/70 mt-1">
        {value > 0
          ? previewTung != null && previewTung > 0
            ? `≈ ${previewTung.toLocaleString()} TUNG al precio actual${liveTungPrice ? ` (TUNG=$${liveTungPrice})` : ''}`
            : `USD activo: se cobra en TUNG segun el precio de mercado${liveTungPrice ? ` (TUNG=$${liveTungPrice})` : ''}`
          : '0 = usar el costo TUNG por defecto'}
      </p>
    </div>
  );

  const handleSendTestEmail = async () => {
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      setSmtpMessage({ type: 'error', text: 'Ingresa un email valido' });
      setTimeout(() => setSmtpMessage(null), 3000);
      return;
    }

    setIsSendingTestEmail(true);
    setSmtpMessage(null);

    const result = await sendTestEmail(testEmailAddress);

    if (result.success) {
      setSmtpMessage({ type: 'success', text: `Correo de prueba enviado a ${testEmailAddress}` });
      setTestEmailAddress('');
    } else {
      setSmtpMessage({ type: 'error', text: result.error || 'Error al enviar correo' });
    }

    setIsSendingTestEmail(false);
    setTimeout(() => setSmtpMessage(null), 5000);
  };

  const handleSaveWalletConfig = async () => {
    setWalletMessage(null);
    const result = await updateWalletConfig({
      min_deposit: minDeposit,
      max_withdrawal_daily: maxWithdrawalDaily,
      withdrawal_fee_percent: withdrawalFeePercent,
      required_confirmations: requiredConfirmations,
      is_deposits_enabled: depositsEnabled,
      is_withdrawals_enabled: withdrawalsEnabled,
      usdt_min_deposit: usdtMinDeposit,
      usdt_max_withdrawal_daily: usdtMaxWithdrawalDaily,
      usdt_withdrawal_fee_percent: usdtWithdrawalFeePercent,
      is_usdt_deposits_enabled: usdtDepositsEnabled,
      is_usdt_withdrawals_enabled: usdtWithdrawalsEnabled,
      swap_fee_percent: swapFeePercent,
    });

    // Save flat withdrawal fees to game_settings (source of truth for request_withdrawal*)
    try {
      await supabase.from('game_settings').update({ value: String(withdrawalFeeUsd) }).eq('key', 'withdrawal_fee_usd');
      await supabase.from('game_settings').update({ value: String(usdtWithdrawalFeeFlat) }).eq('key', 'usdt_withdrawal_fee_flat');
      await supabase.from('game_settings').update({ value: withdrawalFeeMode }).eq('key', 'withdrawal_fee_mode');
    } catch (err) {
      console.error('Error saving flat withdrawal fees:', err);
    }

    if (result.success) {
      setWalletMessage({ type: 'success', text: 'Configuracion de wallet guardada' });
    } else {
      setWalletMessage({ type: 'error', text: result.error || 'Error al guardar' });
    }

    setTimeout(() => setWalletMessage(null), 3000);
  };

  const handleProcessWithdrawals = async () => {
    setWalletMessage(null);
    const result = await processWithdrawals();

    if (result.success) {
      setWalletMessage({
        type: 'success',
        text: `${result.processed || 0} retiros procesados correctamente`
      });
    } else {
      setWalletMessage({ type: 'error', text: result.error || 'Error al procesar' });
    }

    setTimeout(() => setWalletMessage(null), 5000);
  };

  const handleCancelWithdrawal = async (txId: string, username: string) => {
    if (!confirm(`Cancelar retiro de ${username}? El saldo sera devuelto al usuario.`)) {
      return;
    }

    setCancellingId(txId);
    setWalletMessage(null);

    const result = await cancelWithdrawal(txId);

    if (result.success) {
      setWalletMessage({
        type: 'success',
        text: 'Retiro cancelado. TUNG devuelto al usuario.'
      });
    } else {
      setWalletMessage({ type: 'error', text: result.error || 'Error al cancelar' });
    }

    setCancellingId(null);
    setTimeout(() => setWalletMessage(null), 5000);
  };

  const handleApproveWithdrawal = async (txId: string, username: string, amount: number) => {
    if (!confirm(`Aprobar retiro de ${amount.toFixed(2)} tokens a ${username}?`)) {
      return;
    }

    setApprovingId(txId);
    setWalletMessage(null);

    const result = await approveWithdrawal(txId);

    if (result.success) {
      setWalletMessage({
        type: 'success',
        text: result.txHash
          ? `Retiro aprobado! TX: ${result.txHash.slice(0, 10)}...`
          : 'Retiro aprobado y enviado!'
      });
    } else {
      setWalletMessage({ type: 'error', text: result.error || 'Error al aprobar' });
    }

    setApprovingId(null);
    setTimeout(() => setWalletMessage(null), 8000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleAdminWithdraw = async () => {
    setAdminWithdrawMessage(null);
    const amount = parseFloat(adminWithdrawAmount);

    if (isNaN(amount) || amount <= 0) {
      setAdminWithdrawMessage({ type: 'error', text: 'Ingresa un monto valido' });
      return;
    }

    if (!adminWithdrawAddress || adminWithdrawAddress.length < 10) {
      setAdminWithdrawMessage({ type: 'error', text: 'Ingresa una direccion de wallet valida' });
      return;
    }

    const result = await adminRequestWithdrawal(amount, adminWithdrawAddress);

    if (result.success) {
      const txHash = (result as { success: boolean; txHash?: string }).txHash;
      const message = txHash
        ? `Retiro completado! TX: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`
        : 'Retiro completado exitosamente';
      setAdminWithdrawMessage({ type: 'success', text: message });
      setAdminWithdrawAmount('');
      setShowAdminWithdrawModal(false);
    } else {
      setAdminWithdrawMessage({ type: 'error', text: result.error || 'Error al solicitar retiro' });
    }

    setTimeout(() => setAdminWithdrawMessage(null), 8000);
  };

  const speedPresets = [
    { label: '1x (Lento)', value: 1 },
    { label: '5x', value: 5 },
    { label: '10x (Normal)', value: 10 },
    { label: '20x', value: 20 },
    { label: '50x (Rapido)', value: 50 },
    { label: '100x (Turbo)', value: 100 },
  ];

  const handleSaveOfficerPricing = async () => {
    setOfficerMessage(null);
    const result = await updateOfficerPricing(editedOfficerPricing);

    if (result.success) {
      setOfficerMessage({ type: 'success', text: 'Precios de oficiales actualizados correctamente' });
    } else {
      setOfficerMessage({ type: 'error', text: result.error || 'Error al actualizar' });
    }

    setTimeout(() => setOfficerMessage(null), 3000);
  };

  const updateOfficerPrice = (officerId: string, field: string, value: number) => {
    setEditedOfficerPricing(prev =>
      prev.map(officer =>
        officer.id === officerId
          ? { ...officer, [field]: value }
          : officer
      )
    );
  };

  const handleSaveCosmeticPricing = async () => {
    setCosmeticMessage(null);
    const result = await updateCosmeticPricing(editedCosmeticPricing);

    if (result.success) {
      setCosmeticMessage({ type: 'success', text: 'Precios de cosmeticos actualizados correctamente' });
      fetchCosmeticPricing();
    } else {
      setCosmeticMessage({ type: 'error', text: result.error || 'Error al actualizar' });
    }

    setTimeout(() => setCosmeticMessage(null), 3000);
  };

  const updateCosmeticPrice = (cosmeticId: string, usdCost: number) => {
    setEditedCosmeticPricing(prev =>
      prev.map(item =>
        item.id === cosmeticId
          ? { ...item, usd_cost: usdCost }
          : item
      )
    );
  };

  const handleDatabaseBackup = async (mode: 'complete' | 'data-only' | 'clean_universe' = 'data-only') => {
    const isComplete = mode === 'complete';
    const isClean = mode === 'clean_universe';
    if (isComplete) {
      setIsBackingUpComplete(true);
    } else if (isClean) {
      setIsBackingUpClean(true);
    } else {
      setIsBackingUp(true);
    }
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('No hay sesion activa');
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/database-backup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al crear backup');
      }

      const sqlContent = await response.text();
      const backupMode = response.headers.get('X-Backup-Mode') || mode;
      const tablesCount = response.headers.get('X-Backup-Tables') || '?';
      const recordsCount = response.headers.get('X-Backup-Records') || '?';
      const errorsCount = response.headers.get('X-Backup-Errors') || '0';

      const blob = new Blob([sqlContent], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const modeLabel = backupMode === 'complete' ? 'completo' : backupMode === 'clean_universe' ? 'universo_limpio' : 'datos';
      a.download = `backup_${modeLabel}_${new Date().toISOString().split('T')[0]}_${Date.now()}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeKB = (sqlContent.length / 1024).toFixed(1);
      const sizeMB = (sqlContent.length / (1024 * 1024)).toFixed(2);
      const sizeLabel = sqlContent.length > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

      const modeAlertLabel = isComplete ? 'COMPLETO' : isClean ? 'UNIVERSO LIMPIO' : 'de datos';
      alert(
        `✅ Backup ${modeAlertLabel} descargado exitosamente!\n\n` +
        `📊 ${tablesCount} tablas | ${recordsCount} registros\n` +
        `📁 Tamaño: ${sizeLabel}\n` +
        (isComplete ? '📦 Incluye: Estructura, Datos, Funciones, Triggers, RLS, Indices, Permisos\n' : 
         isClean ? '📦 Incluye: Estructura, Config, Funciones, Triggers, RLS, Indices, Permisos (SIN jugadores)\n' :
         '📦 Incluye: Solo datos\n') +
        (parseInt(errorsCount) > 0 ? `⚠️ ${errorsCount} advertencias (ver final del archivo)` : '')
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al crear backup');
    } finally {
      if (isComplete) {
        setIsBackingUpComplete(false);
      } else if (isClean) {
        setIsBackingUpClean(false);
      } else {
        setIsBackingUp(false);
      }
    }
  };

  // ============================================================================
  // FULL DATABASE EXPORT - Para migración a VPS
  // ============================================================================
  const handleFullDatabaseExport = async () => {
    setIsExportingFull(true);
    setExportProgress(null);

    const TABLES = [
      'game_settings', 'admin_speed_settings', 'admin_smtp_settings',
      'admin_telegram_config', 'admin_telegram_settings', 'telegram_config',
      'wallet_config', 'jackpot_config', 'market_notification_config',
      'building_types', 'technology_types', 'ship_types', 'defense_types',
      'officer_types', 'supply_boxes', 'plus_plans', 'telegram_groups',
      'building_requirements', 'technology_requirements', 'ship_requirements',
      'defense_requirements', 'profiles', 'user_wallets', 'telegram_links',
      'email_verification_tokens', 'login_sessions', 'telegram_task_rewards',
      'game_rounds', 'alliances', 'alliance_members', 'alliance_applications',
      'alliance_diplomacy', 'planets', 'planet_resources', 'planet_buildings',
      'planet_ships', 'planet_defenses', 'galaxy_positions', 'user_technologies',
      'user_officers', 'building_queue', 'shipyard_queue', 'research_queue',
      'fleets', 'fleet_ships', 'acs_fleets', 'acs_participants', 'debris_fields',
      'messages', 'public_chat_messages', 'battle_reports', 'market_listings',
      'market_transactions', 'wallet_transactions', 'referral_commissions',
      'admin_revenue', 'admin_expenses', 'admin_withdrawals', 'jackpot',
      'jackpot_pools', 'jackpot_history', 'plus_subscriptions',
      'plus_pending_rewards', 'plus_commission_rewards', 'plus_commission_distributions',
      'supply_box_purchases', 'monthly_ranking_rewards', 'monthly_ranking_distributions',
      'hall_of_fame_records', 'hall_of_fame_players', 'hall_of_fame_alliances',
      'account_interaction_log', 'attack_log', 'multiaccounting_reports', 'suspicious_accounts'
    ];

    const escapeSQL = (value: unknown): string => {
      if (value === null || value === undefined) return 'NULL';
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      if (typeof value === 'number') {
        if (Number.isNaN(value) || !Number.isFinite(value)) return 'NULL';
        return String(value);
      }
      if (Array.isArray(value) || typeof value === 'object') {
        const json = JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
        return `'${json}'::jsonb`;
      }
      const str = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "''")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `'${str}'`;
    };

    try {
      const sql: string[] = [];
      const timestamp = new Date().toISOString();
      let totalRecords = 0;
      const stats: { table: string; count: number }[] = [];
      const errors: string[] = [];

      // Header
      sql.push('-- ================================================================');
      sql.push('-- FALCO-X UNIVERSO - FULL DATABASE EXPORT FOR VPS MIGRATION');
      sql.push('-- ================================================================');
      sql.push(`-- Generated: ${timestamp}`);
      sql.push('-- Target: PostgreSQL 16+');
      sql.push('-- ================================================================');
      sql.push('');
      sql.push('-- INSTRUCCIONES:');
      sql.push('-- 1. Instalar PostgreSQL 16 en la VPS');
      sql.push('-- 2. Crear base de datos: CREATE DATABASE xnova;');
      sql.push('-- 3. Ejecutar migraciones (carpeta supabase/migrations)');
      sql.push('-- 4. Ejecutar este script: psql -U postgres -d xnova -f export.sql');
      sql.push('-- ================================================================');
      sql.push('');
      sql.push('\\set ON_ERROR_STOP on');
      sql.push('BEGIN;');
      sql.push("SET session_replication_role = 'replica';");
      sql.push('SET CONSTRAINTS ALL DEFERRED;');
      sql.push('');

      // Exportar cada tabla
      for (let i = 0; i < TABLES.length; i++) {
        const table = TABLES[i];
        setExportProgress({ table, count: i + 1, total: TABLES.length });

        try {
          const { data, error } = await supabase.from(table).select('*');

          if (error) {
            errors.push(`${table}: ${error.message}`);
            continue;
          }

          sql.push(`-- Table: ${table} (${data?.length || 0} rows)`);
          sql.push(`DELETE FROM "${table}";`);

          if (data && data.length > 0) {
            const columns = Object.keys(data[0]);
            const quotedCols = columns.map(c => `"${c}"`).join(', ');

            for (const row of data) {
              const values = columns.map(c => escapeSQL((row as Record<string, unknown>)[c])).join(', ');
              sql.push(`INSERT INTO "${table}" (${quotedCols}) VALUES (${values});`);
            }

            stats.push({ table, count: data.length });
            totalRecords += data.length;
          }
          sql.push('');
        } catch (e) {
          errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Reset secuencias
      sql.push('-- Reset sequences');
      for (const stat of stats) {
        sql.push(`DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('"${stat.table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${stat.table}"), 1), true); EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
      }
      sql.push('');

      // Finalizar
      sql.push('SET CONSTRAINTS ALL IMMEDIATE;');
      sql.push("SET session_replication_role = 'origin';");
      sql.push('COMMIT;');
      sql.push('');

      // Resumen
      sql.push('-- ================================================================');
      sql.push('-- RESUMEN');
      sql.push('-- ================================================================');
      sql.push(`-- Total registros: ${totalRecords}`);
      sql.push(`-- Tablas exportadas: ${stats.length}`);
      for (const s of stats.sort((a, b) => b.count - a.count)) {
        sql.push(`-- ${s.table}: ${s.count}`);
      }
      if (errors.length > 0) {
        sql.push('-- ERRORES:');
        for (const e of errors) {
          sql.push(`-- ⚠️ ${e}`);
        }
      }
      sql.push('-- ================================================================');

      // Descargar - método mejorado
      const content = sql.join('\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const filename = `falco_xnova_FULL_EXPORT_${timestamp.split('T')[0]}.sql`;
      
      // Intentar descarga con link temporal
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      
      // Pequeño delay para asegurar que el navegador procese
      await new Promise(resolve => setTimeout(resolve, 100));
      a.click();
      
      // Limpiar después de un momento
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      // Copiar al portapapeles también
      let copiedToClipboard = false;
      try {
        await navigator.clipboard.writeText(content);
        copiedToClipboard = true;
      } catch (clipError) {
        console.warn('No se pudo copiar al portapapeles:', clipError);
      }

      // Mostrar info del archivo generado
      const fileSizeKB = (content.length / 1024).toFixed(2);
      const fileSizeMB = (content.length / 1024 / 1024).toFixed(2);
      
      // Construir mensaje con errores detallados
      let errorDetails = '';
      if (errors.length > 0) {
        errorDetails = `\n\n⚠️ TABLAS DE CIBORG 🤭 CON ERRORES (${errors.length}):\n`;
        for (const err of errors) {
          errorDetails += `• ${err}\n`;
        }
      }
      
      alert(
        `✅ Exportación completada!\n\n` +
        `📁 Archivo: ${filename}\n` +
        `📊 Tamaño: ${parseFloat(fileSizeMB) > 1 ? fileSizeMB + ' MB' : fileSizeKB + ' KB'}\n` +
        `📋 ${totalRecords.toLocaleString()} registros en ${stats.length} tablas\n` +
        `📎 Portapapeles: ${copiedToClipboard ? '✅ Copiado!' : '❌ No se pudo copiar'}` +
        `${errorDetails}` +
        `\n\n💡 Si no se descargó automáticamente, el SQL está en tu portapapeles. Pégalo en un archivo .sql`
      );
    } catch (error) {
      alert(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsExportingFull(false);
      setExportProgress(null);
    }
  };

  const handleSyncTelegramGroups = async () => {
    setIsSyncingGroups(true);
    setTelegramMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setTelegramMessage({ type: 'error', text: 'No autenticado' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-telegram-groups`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      const result = await response.json();
      if (result.success) {
        setTelegramMessage({
          type: 'success',
          text: `Encontrados ${result.groups_found} grupos. ${result.added} nuevos, ${result.updated} actualizados.`
        });
        fetchTelegramGroups();
      } else {
        setTelegramMessage({ type: 'error', text: result.error || 'Error al sincronizar' });
      }
    } catch (error) {
      setTelegramMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error de conexion' });
    } finally {
      setIsSyncingGroups(false);
      setTimeout(() => setTelegramMessage(null), 5000);
    }
  };

  const handleToggleTelegramGroup = async (groupId: string, enabled: boolean) => {
    const { data, error } = await supabase.rpc('toggle_telegram_group', {
      p_group_id: groupId,
      p_enabled: enabled,
    });

    if (error || !data?.success) {
      setTelegramMessage({ type: 'error', text: 'Error al actualizar grupo' });
      setTimeout(() => setTelegramMessage(null), 3000);
      return;
    }

    setTelegramGroups(prev => prev.map(g => g.id === groupId ? { ...g, is_enabled: enabled } : g));
  };

  const handleRemoveTelegramGroup = async (groupId: string) => {
    if (!confirm('Eliminar este grupo de la lista?')) return;

    const { data, error } = await supabase.rpc('remove_telegram_group', {
      p_group_id: groupId,
    });

    if (error || !data?.success) {
      setTelegramMessage({ type: 'error', text: 'Error al eliminar grupo' });
      setTimeout(() => setTelegramMessage(null), 3000);
      return;
    }

    setTelegramGroups(prev => prev.filter(g => g.id !== groupId));
    setTelegramMessage({ type: 'success', text: 'Grupo eliminado' });
    setTimeout(() => setTelegramMessage(null), 3000);
  };

  const handleVerifyMemberships = async () => {
    setIsVerifyingMemberships(true);
    setTelegramMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setTelegramMessage({ type: 'error', text: 'No autenticado' });
        return;
      }
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-telegram-memberships`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const result = await response.json();
      if (result.success) {
        setTelegramMessage({
          type: 'success',
          text: `Verificados: ${result.checked} usuarios. ${result.stillMembers} en grupo, ${result.revoked} revocados.`
        });
      } else {
        setTelegramMessage({ type: 'error', text: result.error || 'Error al verificar' });
      }
    } catch (error) {
      setTelegramMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error de conexion' });
    } finally {
      setIsVerifyingMemberships(false);
      setTimeout(() => setTelegramMessage(null), 8000);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastSubject.trim() || !broadcastBody.trim()) {
      setBroadcastMessage({ type: 'error', text: 'Completa el asunto y el mensaje' });
      setTimeout(() => setBroadcastMessage(null), 3000);
      return;
    }

    if (!sendInGame && !sendEmail && !sendTelegram) {
      setBroadcastMessage({ type: 'error', text: 'Selecciona al menos un metodo de envio' });
      setTimeout(() => setBroadcastMessage(null), 3000);
      return;
    }

    setIsSendingBroadcast(true);
    setBroadcastMessage(null);

    let inGameCount = 0;
    let emailCount = 0;
    let telegramCount = 0;
    let errors: string[] = [];

    try {
      if (sendInGame) {
        const { data, error } = await supabase.rpc('send_broadcast_message', {
          p_subject: broadcastSubject,
          p_body: broadcastBody,
        });

        if (error) {
          errors.push(`Mensajes: ${error.message}`);
        } else if (data?.success) {
          inGameCount = data.messages_sent || 0;
        } else {
          errors.push(`Mensajes: ${data?.error || 'Error desconocido'}`);
        }
      }

      if (sendEmail) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const response = await fetch(`${supabaseUrl}/functions/v1/send-broadcast-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
            },
            body: JSON.stringify({
              subject: broadcastSubject,
              body: broadcastBody,
            }),
          });

          const result = await response.json();
          if (result.success) {
            emailCount = result.emails_sent || 0;
          } else {
            errors.push(`Emails: ${result.error || 'Error desconocido'}`);
          }
        }
      }

      if (sendTelegram && telegramGroups.some(g => g.is_enabled)) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const response = await fetch(`${supabaseUrl}/functions/v1/send-telegram-broadcast`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
            },
            body: JSON.stringify({
              subject: broadcastSubject,
              body: broadcastBody,
            }),
          });

          const result = await response.json();
          if (result.success && result.groups_sent > 0) {
            telegramCount = result.groups_sent;
          } else if (!result.success) {
            errors.push(`Telegram: ${result.error || 'Error desconocido'}`);
          }
        }
      }

      if (errors.length > 0 && inGameCount === 0 && emailCount === 0 && telegramCount === 0) {
        setBroadcastMessage({ type: 'error', text: errors.join('. ') });
      } else {
        const parts = [];
        if (inGameCount > 0) parts.push(`${inGameCount} mensajes`);
        if (emailCount > 0) parts.push(`${emailCount} emails`);
        if (telegramCount > 0) parts.push(`${telegramCount} grupos Telegram`);
        setBroadcastMessage({
          type: 'success',
          text: `Comunicado enviado: ${parts.join(' y ')}${errors.length > 0 ? ` (algunos errores: ${errors.join(', ')})` : ''}`
        });
        setBroadcastSubject('');
        setBroadcastBody('');
      }
    } catch (error) {
      setBroadcastMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al enviar comunicado'
      });
    } finally {
      setIsSendingBroadcast(false);
      setTimeout(() => setBroadcastMessage(null), 8000);
    }
  };

  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: TrendingUp },
    { id: 'auditoria' as const, label: 'Auditoria', icon: Scale },
    ...(!isFinancialViewer || isAdmin ? [
    { id: 'users' as const, label: 'Usuarios', icon: Users },
    { id: 'inventory' as const, label: 'Inventario', icon: Gift },
    { id: 'broadcast' as const, label: 'Comunicados', icon: Megaphone },
    { id: 'speeds' as const, label: 'Velocidad', icon: Gauge },
    { id: 'protection' as const, label: 'Proteccion', icon: ShieldCheck },
    { id: 'fortress' as const, label: 'Fortaleza', icon: Castle },
    { id: 'market' as const, label: 'Mercado', icon: Store },
    { id: 'p2p_disputes' as const, label: 'Disputas P2P', icon: AlertTriangle },
    { id: 'kyc' as const, label: 'KYC', icon: ShieldCheck },
    { id: 'fees' as const, label: 'Comisiones', icon: Percent },
    { id: 'fxu' as const, label: 'Costos TUNG', icon: Coins },
    { id: 'officers' as const, label: 'Oficiales', icon: Crown },
    { id: 'cosmetics' as const, label: 'Cosméticos', icon: Gem },
    { id: 'smtp' as const, label: 'SMTP', icon: Mail },
    { id: 'wallet' as const, label: 'Wallet', icon: Wallet },
    { id: 'antimulti' as const, label: 'Anti-Multi', icon: UserX },
    { id: 'jackpot' as const, label: 'Jackpot', icon: Trophy },
    { id: 'plus' as const, label: 'Plus', icon: Star },
    { id: 'supply_boxes' as const, label: 'Cajas', icon: Box },
    { id: 'blueprints' as const, label: 'Planos', icon: Tag },
    { id: 'instant_shipyard' as const, label: 'Astillero', icon: Factory },
    { id: 'hallOfFame' as const, label: 'Hall of Fame', icon: Award },
    { id: 'maintenance' as const, label: 'Mantenimiento', icon: Wrench },
    { id: 'inactive' as const, label: 'Inactivos', icon: Trash2 },
    { id: 'recaptcha' as const, label: 'reCAPTCHA', icon: ShieldCheck },
    { id: 'premium_missions' as const, label: 'Precios Misiones Premium', icon: Crown },
    { id: 'twitter' as const, label: 'Twitter', icon: Twitter },
    { id: 'lottery' as const, label: 'Lotería', icon: Ticket },
    { id: 'raffles' as const, label: 'Rifas', icon: Gift },
    { id: 'bots' as const, label: 'Bots NPC', icon: Bot },
    { id: 'npc_roles' as const, label: 'Roles NPC', icon: Crown },
    { id: 'hero' as const, label: 'Nave Heroe', icon: Rocket },
    { id: 'wars' as const, label: 'Guerras', icon: Swords },
    { id: 'depletion' as const, label: 'Agotamiento', icon: Globe },
    { id: 'accionistas' as const, label: 'Accionistas', icon: PiggyBank },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-red-500" />
        <h1 className="text-2xl font-bold text-white">{isFinancialViewer && !isAdmin ? 'Dashboard Financiero' : 'Panel de Administracion'}</h1>
      </div>

      {isAdmin && <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
        <p className="text-red-300 text-sm">
          Este panel es exclusivo para administradores. Los cambios realizados aqui afectan a todo el servidor.
        </p>
      </div>}

      {/* Toggle global Androide IA */}
      {isAdmin && <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${aiEnabled ? 'bg-cyan-500/20 border border-cyan-500/30' : 'bg-slate-700/50'}`}>
            <Bot className={`w-5 h-5 ${aiEnabled ? 'text-cyan-400' : 'text-slate-500'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Androide IA Global</p>
            <p className="text-xs text-slate-400">{aiEnabled ? `${aiUserCount} usuarios activos` : 'Desactivado'}</p>
          </div>
        </div>
        <button onClick={toggleAI} disabled={togglingAI}
          className={`relative w-14 h-7 rounded-full transition-all ${aiEnabled ? 'bg-cyan-600' : 'bg-slate-600'} disabled:opacity-50`}>
          <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all shadow ${aiEnabled ? 'left-7' : 'left-0.5'}`} />
        </button>
      </div>}

      {/* Tabs de navegacion */}
      <div className="flex flex-wrap gap-2 p-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: Auditoria Financiera [FINAUDIT1] */}
      {activeTab === 'auditoria' && <AdminFinanceAudit />}

      {/* TAB: Dashboard Financiero */}
      {activeTab === 'dashboard' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-semibold text-white">Dashboard Financiero</h2>
            <span
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-900/30 border border-green-700/40 text-xs font-semibold text-green-300"
              title="Precio de mercado en vivo de TUNG (DexScreener)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              1 TUNG = {tungPriceUsd != null ? `$${tungPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 })}` : '…'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (<>
            {/* Botón de backup COMPLETO (estructura + datos + todo) */}
            <button
              onClick={() => handleDatabaseBackup('complete')}
              disabled={isBackingUpComplete || isBackingUp || isBackingUpClean || isExportingFull}
              className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              title="Backup COMPLETO: Estructura + Datos + Funciones + Triggers + RLS + Indices + Permisos"
            >
              <Shield className={`w-4 h-4 ${isBackingUpComplete ? 'animate-spin' : ''}`} />
              {isBackingUpComplete ? 'Generando backup completo...' : '🛡️ Backup Completo'}
            </button>
            {/* Botón de backup solo datos */}
            <button
              onClick={() => handleDatabaseBackup('data-only')}
              disabled={isBackingUp || isBackingUpComplete || isBackingUpClean || isExportingFull}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              title="Backup rapido: Solo datos de las tablas"
            >
              <Download className={`w-4 h-4 ${isBackingUp ? 'animate-pulse' : ''}`} />
              {isBackingUp ? 'Creando...' : 'Backup Datos'}
            </button>
            {/* Botón de Universo Limpio - Para desplegar nuevo universo */}
            <button
              onClick={() => handleDatabaseBackup('clean_universe')}
              disabled={isBackingUpClean || isBackingUp || isBackingUpComplete || isExportingFull}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              title="Universo Limpio: Estructura completa + configuracion del juego SIN datos de jugadores. Listo para desplegar en otro Supabase."
            >
              <Database className={`w-4 h-4 ${isBackingUpClean ? 'animate-spin' : ''}`} />
              {isBackingUpClean ? 'Generando universo limpio...' : '🌌 Nuevo Universo'}
            </button>
            {/* Botón de exportación completa para VPS */}
            <button
              onClick={handleFullDatabaseExport}
              disabled={isExportingFull || isBackingUp || isBackingUpComplete || isBackingUpClean}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              title="Exportacion completa para migrar a VPS (cliente)"
            >
              <Database className={`w-4 h-4 ${isExportingFull ? 'animate-spin' : ''}`} />
              {isExportingFull 
                ? exportProgress 
                  ? `${exportProgress.count}/${exportProgress.total}` 
                  : 'Exportando...' 
                : 'Export VPS'}
            </button>
            </>)}
            <button
              onClick={() => {
                fetchFinancialStats();
                fetchRecentRevenue();
                fetchRevenueByType();
                fetchServerWalletInfo();
                fetchP2PEconomyStats();
                fetchTungPrice();
              }}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Actualizar estadisticas"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Mis ganancias como accionista (solo si el usuario es accionista) */}
        {myShareholderEarnings?.is_shareholder && (
          <div className="mb-6 p-5 bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 border border-emerald-600/40 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <PiggyBank className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg font-semibold text-white">Mis ganancias como accionista</h3>
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300">
                {Number(myShareholderEarnings.percentage || 0).toFixed(2)}% de las comisiones
              </span>
              {myShareholderEarnings.is_active === false && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300">Pausado</span>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4">
                <div className="text-xs text-slate-400">Ganado en total</div>
                <div className="text-2xl font-bold text-emerald-400">
                  {Number(myShareholderEarnings.total_fxu || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-slate-400">TUNG</span>
                </div>
                <div className="text-xs text-green-400/80 mt-0.5">≈ {fmtUsdt(Number(myShareholderEarnings.total_fxu || 0))} USDT</div>
                {Number(myShareholderEarnings.total_usdt || 0) > 0 && (
                  <div className="text-xs text-slate-400 mt-0.5">+ {Number(myShareholderEarnings.total_usdt).toFixed(2)} USDT directos</div>
                )}
              </div>
              <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4">
                <div className="text-xs text-slate-400">Este mes</div>
                <div className="text-2xl font-bold text-blue-300">
                  {Number(myShareholderEarnings.month_fxu || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-slate-400">TUNG</span>
                </div>
                <div className="text-xs text-green-400/80 mt-0.5">≈ {fmtUsdt(Number(myShareholderEarnings.month_fxu || 0))} USDT</div>
                {Number(myShareholderEarnings.month_usdt || 0) > 0 && (
                  <div className="text-xs text-slate-400 mt-0.5">+ {Number(myShareholderEarnings.month_usdt).toFixed(2)} USDT directos</div>
                )}
              </div>
              <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4">
                <div className="text-xs text-slate-400">Pagos recibidos</div>
                <div className="text-2xl font-bold text-white">{Number(myShareholderEarnings.payout_count || 0)}</div>
                {myShareholderEarnings.last_payout_at && (
                  <div className="text-xs text-slate-400 mt-0.5">Ult: {new Date(myShareholderEarnings.last_payout_at).toLocaleDateString('es-ES')}</div>
                )}
              </div>
              <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4">
                <div className="text-xs text-slate-400">Accionista desde</div>
                <div className="text-lg font-bold text-white">
                  {myShareholderEarnings.since ? new Date(myShareholderEarnings.since).toLocaleDateString('es-ES') : '-'}
                </div>
              </div>
            </div>

            {/* Historial Semanal de Ingresos del accionista */}
            {myShareholderEarnings.weekly && myShareholderEarnings.weekly.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-medium text-slate-300">Historial Semanal de Ingresos</span>
                </div>
                <div className="space-y-2 max-h-[340px] overflow-y-auto">
                  {myShareholderEarnings.weekly.map((w, i) => {
                    const prev = myShareholderEarnings.weekly![i + 1];
                    const change = prev && Number(prev.total_fxu) > 0
                      ? ((Number(w.total_fxu) - Number(prev.total_fxu)) / Number(prev.total_fxu)) * 100
                      : null;
                    const isBest = myShareholderEarnings.weekly!.length > 1 &&
                      Number(w.total_fxu) === Math.max(...myShareholderEarnings.weekly!.map(x => Number(x.total_fxu)));
                    return (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-700/40">
                        <div className="flex items-center gap-3">
                          <div className="text-center min-w-[48px]">
                            <div className="text-xs text-slate-500">Sem</div>
                            <div className="text-sm font-bold text-slate-200">{w.week_number}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400">{w.wk_start} - {w.wk_end}</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-emerald-400">
                                {Number(w.total_fxu).toLocaleString('en-US', { maximumFractionDigits: 2 })} TUNG
                              </span>
                              <span className="text-xs text-green-400/80">≈ {fmtUsdt(Number(w.total_fxu))} USDT</span>
                              {Number(w.total_usdt) > 0 && (
                                <span className="text-xs text-slate-400">+ {Number(w.total_usdt).toFixed(2)} USDT</span>
                              )}
                              {isBest && (
                                <span className="text-xs px-1.5 py-0.5 bg-amber-900/40 text-amber-400 rounded border border-amber-700/30">Mejor</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {change !== null && (
                          <span className={`text-xs font-medium flex items-center gap-0.5 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(change).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {myShareholderEarnings.recent && myShareholderEarnings.recent.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-slate-400 mb-2">Ultimos pagos recibidos</div>
                <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2">Fecha</th>
                          <th className="text-left px-4 py-2">Concepto</th>
                          <th className="text-right px-4 py-2">Recibido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myShareholderEarnings.recent.map((r, i) => (
                          <tr key={i} className="border-t border-slate-700/40">
                            <td className="px-4 py-2 text-slate-300">{new Date(r.created_at).toLocaleString('es-ES')}</td>
                            <td className="px-4 py-2 text-slate-400">{r.revenue_type || '-'}</td>
                            <td className="px-4 py-2 text-right text-emerald-400 font-medium whitespace-nowrap">
                              {Number(r.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} {r.currency === 'FXU' ? 'TUNG' : r.currency}
                              {r.currency === 'FXU' && (
                                <span className="text-xs text-green-400/70 ml-1">(≈ {fmtUsdt(Number(r.amount))} USDT)</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tarjetas de resumen principal - Hot Wallet */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {/* TUNG en Wallet Blockchain */}
          <div className="p-4 bg-gradient-to-br from-amber-900/30 to-amber-800/20 border border-amber-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-300 font-medium">TUNG Hot Wallet</span>
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {serverWalletInfo ? parseFloat(serverWalletInfo.tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {serverWalletInfo ? fmtUsdt(parseFloat(serverWalletInfo.tokenBalance)) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-400 mt-1">Tokens TUNG en blockchain</p>
          </div>

          {/* Balance USDT en Wallet Blockchain */}
          <div className="p-4 bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-300 font-medium">USDT Hot Wallet</span>
            </div>
            <div className="text-2xl font-bold text-green-400">
              {serverWalletInfo ? parseFloat(serverWalletInfo.usdtBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
            <p className="text-xs text-slate-400 mt-1">Balance USDT en blockchain</p>
          </div>

          {/* Ingresos Semana Actual en USD */}
          <div className="p-4 bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 border border-emerald-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-300 font-medium">Ingresos Semana</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {currentWeekSnapshot ? fmtUsdt(Number(currentWeekSnapshot.total)) : '$0.00'}
            </div>
            <p className="text-xs text-slate-400 mt-1">Sem {currentWeekSnapshot?.week_number || '-'}, {currentWeekSnapshot?.year || '-'}</p>
          </div>

          {/* Balance TUNG de usuarios */}
          <div className="p-4 bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-blue-300 font-medium">TUNG de Usuarios</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">
              {financialStats ? financialStats.total_user_fxu.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats ? fmtUsdt(financialStats.total_user_fxu) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-400 mt-1">Deuda TUNG con usuarios</p>
          </div>

          {/* TUNG en Deuda con la wallet (usuarios - wallet) */}
          <div className="p-4 bg-gradient-to-br from-red-900/30 to-red-800/20 border border-red-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-300 font-medium">TUNG en Deuda</span>
            </div>
            <div className="text-2xl font-bold text-red-400">
              {(financialStats && serverWalletInfo)
                ? Math.max(0, financialStats.total_user_fxu - parseFloat(serverWalletInfo.tokenBalance)).toLocaleString(undefined, { maximumFractionDigits: 2 })
                : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {(financialStats && serverWalletInfo) ? fmtUsdt(Math.max(0, financialStats.total_user_fxu - parseFloat(serverWalletInfo.tokenBalance))) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {(financialStats && serverWalletInfo && (financialStats.total_user_fxu - parseFloat(serverWalletInfo.tokenBalance)) > 0)
                ? 'Falta en la wallet para cubrir usuarios'
                : 'La wallet cubre el saldo de usuarios'}
            </p>
          </div>

          {/* Balance USDT de usuarios */}
          <div className="p-4 bg-gradient-to-br from-teal-900/30 to-teal-800/20 border border-teal-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-teal-400" />
              <span className="text-xs text-teal-300 font-medium">USDT de Usuarios</span>
            </div>
            <div className="text-2xl font-bold text-teal-400">
              {financialStats?.total_user_usdt?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '0'}
            </div>
            <p className="text-xs text-slate-400 mt-1">Deuda USDT con usuarios</p>
          </div>

          {/* Ingresos totales del Admin */}
          <div className="p-4 bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 border border-emerald-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-300 font-medium">Ingresos Admin</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {financialStats ? financialStats.total_admin_revenue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats ? fmtUsdt(financialStats.total_admin_revenue) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-400 mt-1">Total historico</p>
          </div>

          {/* Balance disponible para Admin */}
          <div className="p-4 bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-300 font-medium">Disponible Admin</span>
            </div>
            <div className="text-2xl font-bold text-green-400">
              {financialStats ? financialStats.admin_available_balance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats ? fmtUsdt(financialStats.admin_available_balance) : '$0.00'} USDT
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowAdminWithdrawModal(true)}
                disabled={!financialStats || financialStats.admin_available_balance <= 0}
                className="mt-2 w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs rounded transition-colors flex items-center justify-center gap-1"
              >
                <Banknote className="w-3 h-3" />
                Retirar (sin fee)
              </button>
            )}
          </div>
        </div>

        {/* Segunda fila: estadisticas de periodo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Ingresos del mes */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-400">Mes Actual</span>
            </div>
            <div className="text-xl font-bold text-cyan-400 flex items-center gap-1">
              <ArrowUpRight className="w-4 h-4" />
              {financialStats ? financialStats.month_revenue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats ? fmtUsdt(financialStats.month_revenue) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {financialStats ? `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][financialStats.current_month - 1]} ${financialStats.current_year}` : ''}
            </p>
          </div>

          {/* Ingresos del ano */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-slate-400">Ano Actual</span>
            </div>
            <div className="text-xl font-bold text-purple-400 flex items-center gap-1">
              <ArrowUpRight className="w-4 h-4" />
              {financialStats ? financialStats.year_revenue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats ? fmtUsdt(financialStats.year_revenue) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {financialStats ? `Ano ${financialStats.current_year}` : ''}
            </p>
          </div>

          {/* Total depositos TUNG */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="w-4 h-4 text-green-400" />
              <span className="text-xs text-slate-400">Depositos TUNG</span>
            </div>
            <div className="text-xl font-bold text-green-400">
              {financialStats ? financialStats.total_deposits.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats ? fmtUsdt(financialStats.total_deposits) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-500 mt-1">Confirmados</p>
          </div>

          {/* Total retiros TUNG */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="w-4 h-4 text-red-400" />
              <span className="text-xs text-slate-400">Retiros TUNG</span>
            </div>
            <div className="text-xl font-bold text-red-400">
              {financialStats ? financialStats.total_withdrawals.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats ? fmtUsdt(financialStats.total_withdrawals) : '$0.00'} USDT
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Pendientes: {financialStats ? financialStats.pending_withdrawals.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </p>
          </div>
        </div>

        {/* Tercera fila: gastos admin y deuda */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total gastos admin */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-orange-700/30">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-slate-400">Gastos Admin</span>
            </div>
            <div className="text-xl font-bold text-orange-400">
              {financialStats?.total_admin_expenses?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '0'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Jackpot, promociones, etc</p>
          </div>

          {/* Resumen deuda total */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600/50">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-slate-400">Deuda Total</span>
            </div>
            <div className="text-xl font-bold text-yellow-400">
              {financialStats ? (financialStats.total_user_fxu + (financialStats.total_user_usdt || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </div>
            <div className="text-xs font-semibold text-green-400/70 mt-0.5">
              ≈ {financialStats && tungPriceUsd != null ? `$${(financialStats.total_user_fxu * tungPriceUsd + (financialStats.total_user_usdt || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'} USDT
            </div>
            <p className="text-xs text-slate-500 mt-1">TUNG + USDT combinado</p>
          </div>
        </div>

        {/* Desglose por tipo de ingreso */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ingresos por tipo */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
              <Percent className="w-4 h-4 text-amber-400" />
              Desglose por Tipo de Ingreso
            </h3>
            {revenueByType && Object.keys(revenueByType.breakdown).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(revenueByType.breakdown).map(([type, amount]) => {
                  const typeLabels: Record<string, { label: string; color: string }> = {
                    'market_fee': { label: 'Comision Mercado', color: 'text-amber-400' },
                    'withdrawal_fee': { label: 'Comision Retiros', color: 'text-orange-400' },
                    'instant_build': { label: 'Construccion Instant', color: 'text-blue-400' },
                    'instant_research': { label: 'Investigacion Instant', color: 'text-cyan-400' },
                    'instant_ship': { label: 'Naves Instant', color: 'text-sky-400' },
                    'instant_defense': { label: 'Defensa Instant', color: 'text-rose-400' },
                    'fleet_acceleration': { label: 'Aceleracion Flotas', color: 'text-purple-400' },
                    'officer_fxu': { label: 'Compra Oficiales', color: 'text-yellow-400' },
                    'referral_bonus': { label: 'Bonus Referidos', color: 'text-green-400' },
                    'expedition_fee': { label: 'Tasa Expedicion', color: 'text-teal-400' },
                    'supply_box': { label: 'Cajas de Suministros', color: 'text-indigo-400' },
                    'swap_fee': { label: 'Comision Swap', color: 'text-pink-400' },
                    'plus_subscription': { label: 'Suscripcion VIP', color: 'text-emerald-400' },
                    'transfer_fee': { label: 'Comision Transferencias', color: 'text-lime-400' },
                    'planet_rename': { label: 'Renombrar Planeta', color: 'text-fuchsia-400' },
                    'alliance_creation': { label: 'Crear Alianza', color: 'text-violet-400' },
                    'lottery_fee': { label: 'Comision Loteria', color: 'text-red-400' },
                    'casino_roulette': { label: 'Ruleta Casino', color: 'text-fuchsia-400' },
                    'casino_slots': { label: 'Tragamonedas Casino', color: 'text-fuchsia-400' },
                    'casino_dice': { label: 'Dados Casino', color: 'text-amber-400' },
                    'casino_battleship': { label: 'Batalla de Naves', color: 'text-sky-400' },
                    'sports_football': { label: 'Apuestas Fútbol', color: 'text-green-400' },
                    'p2p_fee': { label: 'Comision P2P', color: 'text-indigo-400' },
                    'demolish_fee': { label: 'Demoler Edificio', color: 'text-stone-400' },
                    'abandon_colony': { label: 'Abandonar Colonia', color: 'text-zinc-400' },
                    'blueprint_sale': { label: 'Planos', color: 'text-cyber-yellow' },
                    'other': { label: 'Otros', color: 'text-slate-400' },
                  };
                  const info = typeLabels[type] || { label: type, color: 'text-slate-400' };
                  const percentage = revenueByType.total > 0 ? (amount / revenueByType.total) * 100 : 0;

                  return (
                    <div key={type}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-slate-300">{info.label}</span>
                        <span className={`text-sm font-medium ${info.color}`}>
                          {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG
                          <span className="text-green-400/60 font-normal ml-1">({fmtUsdt(amount)} USDT)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-slate-700/50 flex justify-between">
                  <span className="text-sm font-medium text-slate-300">Total</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {revenueByType.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG
                    <span className="text-green-400/60 font-normal ml-1">({fmtUsdt(revenueByType.total)} USDT)</span>
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm text-center py-4">Sin ingresos registrados</p>
            )}
          </div>

          {/* Historial de ingresos recientes */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Ingresos Recientes
            </h3>
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {recentRevenue.length > 0 ? (
                recentRevenue.slice(0, 10).map((revenue) => {
                  const typeLabels: Record<string, string> = {
                    'market_fee': 'Mercado',
                    'withdrawal_fee': 'Retiro',
                    'instant_build': 'Construir',
                    'instant_research': 'Investigar',
                    'instant_ship': 'Naves',
                    'instant_defense': 'Defensa',
                    'fleet_acceleration': 'Acelerar',
                    'officer_fxu': 'Oficial',
                    'referral_bonus': 'Referido',
                    'expedition_fee': 'Expedicion',
                    'supply_box': 'Caja',
                    'swap_fee': 'Swap',
                    'plus_subscription': 'VIP Plus',
                    'transfer_fee': 'Transfer',
                    'planet_rename': 'Renombrar',
                    'alliance_creation': 'Alianza',
                    'lottery_fee': 'Loteria',
                    'casino_roulette': 'Ruleta Casino',
                    'casino_slots': 'Tragamonedas Casino',
                    'casino_dice': 'Dados Casino',
                    'casino_battleship': 'Batalla de Naves',
                    'sports_football': 'Apuestas Fútbol',
                    'p2p_fee': 'P2P',
                    'demolish_fee': 'Demoler',
                    'abandon_colony': 'Abandonar',
                    'blueprint_sale': 'Planos',
                    'other': 'Otro',
                  };

                  return (
                    <div
                      key={revenue.id}
                      className="flex items-center justify-between p-2 bg-slate-800/50 rounded hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 bg-emerald-900/50 text-emerald-400 rounded">
                            {typeLabels[revenue.type] || revenue.type}
                          </span>
                          {revenue.username && (
                            <span className="text-xs text-slate-400 truncate">
                              {revenue.username}
                            </span>
                          )}
                        </div>
                        {revenue.description && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {revenue.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-sm font-medium text-emerald-400">
                          +{revenue.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {revenue.currency || 'TUNG'}
                        </div>
                        {(!revenue.currency || revenue.currency === 'TUNG') && (
                          <div className="text-xs font-medium text-green-400/60">
                            ≈ {fmtUsdt(revenue.amount)} USDT
                          </div>
                        )}
                        <div className="text-xs text-slate-500">
                          {formatDistanceToNow(new Date(revenue.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">Sin ingresos recientes</p>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================= */}
        {/* MERCADO P2P — Economía del libro de órdenes                   */}
        {/* ============================================================= */}
        <div className="mt-6 p-4 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-lg border border-indigo-700/40">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-indigo-200 flex items-center gap-2">
              <Store className="w-5 h-5 text-indigo-400" />
              Mercado P2P — Economía
            </h3>
            <div className="flex items-center gap-2">
              {p2pEconomyStats?.generated_at && (
                <span className="text-[11px] text-slate-500">
                  {formatDistanceToNow(new Date(p2pEconomyStats.generated_at), { addSuffix: true })}
                </span>
              )}
              <button
                onClick={() => fetchP2PEconomyStats()}
                className="p-1 hover:bg-slate-700 rounded transition-colors"
                title="Actualizar P2P"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {!p2pEconomyStats ? (
            <p className="text-slate-500 text-sm text-center py-4">Cargando métricas P2P...</p>
          ) : (
            <>
              {/* Fila 1: Volumen */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="p-3 bg-slate-900/50 rounded-lg border border-indigo-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs text-slate-400">Volumen 24h</span>
                  </div>
                  <div className="text-sm font-bold text-indigo-300">
                    {p2pEconomyStats.volume_fxu_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })} TUNG
                  </div>
                  <div className="text-xs text-teal-300 mt-0.5">
                    {p2pEconomyStats.volume_usdt_24h.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                  </div>
                </div>

                <div className="p-3 bg-slate-900/50 rounded-lg border border-indigo-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDays className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs text-slate-400">Volumen 7d</span>
                  </div>
                  <div className="text-sm font-bold text-indigo-300">
                    {p2pEconomyStats.volume_fxu_7d.toLocaleString(undefined, { maximumFractionDigits: 0 })} TUNG
                  </div>
                  <div className="text-xs text-teal-300 mt-0.5">
                    {p2pEconomyStats.volume_usdt_7d.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                  </div>
                </div>

                <div className="p-3 bg-slate-900/50 rounded-lg border border-indigo-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs text-slate-400">Volumen 30d</span>
                  </div>
                  <div className="text-sm font-bold text-indigo-300">
                    {p2pEconomyStats.volume_fxu_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })} TUNG
                  </div>
                  <div className="text-xs text-teal-300 mt-0.5">
                    {p2pEconomyStats.volume_usdt_30d.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                  </div>
                </div>

                <div className="p-3 bg-slate-900/50 rounded-lg border border-purple-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowLeftRight className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-slate-400">Volumen Total</span>
                  </div>
                  <div className="text-sm font-bold text-purple-300">
                    {p2pEconomyStats.volume_fxu_total.toLocaleString(undefined, { maximumFractionDigits: 0 })} TUNG
                  </div>
                  <div className="text-xs text-teal-300 mt-0.5">
                    {p2pEconomyStats.volume_usdt_total.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                  </div>
                </div>
              </div>

              {/* Fila 2: Fees + Jackpot + Traders */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Percent className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-slate-400">Fees 30d</span>
                  </div>
                  <div className="text-sm font-bold text-amber-300">
                    {p2pEconomyStats.fees_fxu_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })} TUNG
                  </div>
                  <div className="text-xs text-teal-300 mt-0.5">
                    {p2pEconomyStats.fees_usdt_30d.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                  </div>
                </div>

                <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Coins className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-slate-400">Fees Total</span>
                  </div>
                  <div className="text-sm font-bold text-amber-300">
                    {p2pEconomyStats.fees_fxu_total.toLocaleString(undefined, { maximumFractionDigits: 0 })} TUNG
                  </div>
                  <div className="text-xs text-teal-300 mt-0.5">
                    {p2pEconomyStats.fees_usdt_total.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                  </div>
                </div>

                <div className="p-3 bg-slate-900/50 rounded-lg border border-pink-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Gem className="w-4 h-4 text-pink-400" />
                    <span className="text-xs text-slate-400">Jackpot desde P2P</span>
                  </div>
                  <div className="text-sm font-bold text-pink-300">
                    {p2pEconomyStats.jackpot_from_p2p.toLocaleString(undefined, { maximumFractionDigits: 0 })} TUNG
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Pool share histórico</p>
                </div>

                <div className="p-3 bg-slate-900/50 rounded-lg border border-emerald-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-slate-400">Traders activos</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-300">
                    {p2pEconomyStats.traders_30d.toLocaleString()} <span className="text-xs text-slate-500">/ 30d</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Total histórico: {p2pEconomyStats.traders_total.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Fila 3: Órdenes por estado */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
                <div className="p-2 bg-slate-900/50 rounded border border-slate-700/30">
                  <p className="text-[10px] text-slate-500 uppercase">Órdenes</p>
                  <p className="text-base font-bold text-slate-200">{p2pEconomyStats.orders_total.toLocaleString()}</p>
                </div>
                <div className="p-2 bg-slate-900/50 rounded border border-emerald-700/30">
                  <p className="text-[10px] text-emerald-500 uppercase">Liberadas</p>
                  <p className="text-base font-bold text-emerald-300">{p2pEconomyStats.orders_released.toLocaleString()}</p>
                </div>
                <div className="p-2 bg-slate-900/50 rounded border border-yellow-700/30">
                  <p className="text-[10px] text-yellow-500 uppercase">Pend. pago</p>
                  <p className="text-base font-bold text-yellow-300">{p2pEconomyStats.orders_pending.toLocaleString()}</p>
                </div>
                <div className="p-2 bg-slate-900/50 rounded border border-sky-700/30">
                  <p className="text-[10px] text-sky-500 uppercase">Pagadas</p>
                  <p className="text-base font-bold text-sky-300">{p2pEconomyStats.orders_paid.toLocaleString()}</p>
                </div>
                <div className="p-2 bg-slate-900/50 rounded border border-red-700/30">
                  <p className="text-[10px] text-red-500 uppercase">En disputa</p>
                  <p className="text-base font-bold text-red-300">{p2pEconomyStats.orders_disputed.toLocaleString()}</p>
                </div>
                <div className="p-2 bg-slate-900/50 rounded border border-slate-700/30">
                  <p className="text-[10px] text-slate-500 uppercase">Canceladas</p>
                  <p className="text-base font-bold text-slate-400">{p2pEconomyStats.orders_cancelled.toLocaleString()}</p>
                </div>
              </div>

              {/* Fila 4: Ofertas activas + Disputas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                  <h4 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-indigo-400" />
                    Ofertas activas ({p2pEconomyStats.offers_active})
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between p-1.5 bg-slate-800/50 rounded">
                      <span className="text-slate-400">Vender TUNG</span>
                      <span className="text-indigo-300 font-medium">{p2pEconomyStats.offers_sell_fxu}</span>
                    </div>
                    <div className="flex justify-between p-1.5 bg-slate-800/50 rounded">
                      <span className="text-slate-400">Vender USDT</span>
                      <span className="text-teal-300 font-medium">{p2pEconomyStats.offers_sell_usdt}</span>
                    </div>
                    <div className="flex justify-between p-1.5 bg-slate-800/50 rounded">
                      <span className="text-slate-400">Comprar TUNG</span>
                      <span className="text-indigo-300 font-medium">{p2pEconomyStats.offers_buy_fxu}</span>
                    </div>
                    <div className="flex justify-between p-1.5 bg-slate-800/50 rounded">
                      <span className="text-slate-400">Comprar USDT</span>
                      <span className="text-teal-300 font-medium">{p2pEconomyStats.offers_buy_usdt}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                  <h4 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    Disputas
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-1.5 bg-red-900/20 border border-red-700/30 rounded text-center">
                      <p className="text-[10px] text-red-400 uppercase">Abiertas</p>
                      <p className="text-base font-bold text-red-300">{p2pEconomyStats.disputes_open}</p>
                    </div>
                    <div className="p-1.5 bg-amber-900/20 border border-amber-700/30 rounded text-center">
                      <p className="text-[10px] text-amber-400 uppercase">Investig.</p>
                      <p className="text-base font-bold text-amber-300">{p2pEconomyStats.disputes_investigating}</p>
                    </div>
                    <div className="p-1.5 bg-emerald-900/20 border border-emerald-700/30 rounded text-center">
                      <p className="text-[10px] text-emerald-400 uppercase">Resueltas</p>
                      <p className="text-base font-bold text-emerald-300">{p2pEconomyStats.disputes_resolved}</p>
                    </div>
                  </div>
                  {(p2pEconomyStats.disputes_open + p2pEconomyStats.disputes_investigating) > 0 && (
                    <p className="text-[10px] text-red-400 mt-2">
                      ⚠ {p2pEconomyStats.disputes_open + p2pEconomyStats.disputes_investigating} disputa(s) pendiente(s) de resolución
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Nota explicativa */}
        <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
          <p className="text-xs text-emerald-300">
            <strong>Balance Disponible Admin:</strong> Este es el total de ingresos por fees (mercado, retiros, construcciones instantaneas).
            Puedes retirar hasta este monto sin afectar los fondos de los usuarios.
            El sistema registra automaticamente cada ingreso por comisiones.
          </p>
        </div>

        {/* Historial Semanal de Ingresos */}
        <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-sky-400" />
              Historial Semanal de Ingresos
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setIsTakingSnapshot(true);
                  setSnapshotMessage(null);
                  const result = await takeWeeklySnapshotNow();
                  if (result.success) {
                    setSnapshotMessage({ type: 'success', text: 'Snapshot de semana anterior guardado' });
                  } else {
                    setSnapshotMessage({ type: 'error', text: result.error || 'Error' });
                  }
                  setIsTakingSnapshot(false);
                  setTimeout(() => setSnapshotMessage(null), 4000);
                }}
                disabled={isTakingSnapshot}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-sky-900/40 hover:bg-sky-800/50 text-sky-300 rounded border border-sky-700/30 transition-colors disabled:opacity-50"
              >
                {isTakingSnapshot ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                Tomar Snapshot
              </button>
              <button
                onClick={() => fetchWeeklySnapshots()}
                className="p-1 hover:bg-slate-700 rounded transition-colors"
                title="Actualizar"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {snapshotMessage && (
            <div className={`mb-3 flex items-center gap-2 p-2 rounded text-xs ${
              snapshotMessage.type === 'success'
                ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                : 'bg-red-900/30 border border-red-700/50 text-red-300'
            }`}>
              {snapshotMessage.type === 'success' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {snapshotMessage.text}
            </div>
          )}

          {currentWeekSnapshot && (
            <div className="mb-4 p-3 bg-sky-900/20 border border-sky-700/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-sky-300">
                  Semana Actual (Sem {currentWeekSnapshot.week_number}, {currentWeekSnapshot.year})
                </span>
                <div className="text-right">
                  <span className="text-sm font-bold text-sky-400">
                    {Number(currentWeekSnapshot.total).toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG
                  </span>
                  <span className="text-xs text-green-400 ml-2">
                    ({fmtUsdt(Number(currentWeekSnapshot.total))} USD)
                  </span>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                {currentWeekSnapshot.week_start} a {currentWeekSnapshot.week_end}
              </div>
              {currentWeekSnapshot.breakdown && Object.keys(currentWeekSnapshot.breakdown).length > 0 && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {Object.entries(currentWeekSnapshot.breakdown).map(([type, amount]) => {
                    const typeLabels: Record<string, string> = {
                      'market_fee': 'Mercado', 'withdrawal_fee': 'Retiros', 'instant_build': 'Construir',
                      'instant_research': 'Investigar', 'instant_ship': 'Naves', 'fleet_acceleration': 'Acelerar',
                      'officer_fxu': 'Oficiales', 'referral_bonus': 'Referidos', 'supply_box': 'Cajas',
                      'swap_fee': 'Swap', 'expedition_fee': 'Expedicion', 'transfer_fee': 'Transfer', 'blueprint_sale': 'Planos', 'other': 'Otros',
                      'demolish_fee': 'Demoler', 'abandon_colony': 'Abandonar', 'plus_subscription': 'VIP Plus',
                      'planet_rename': 'Renombrar', 'alliance_creation': 'Alianza', 'lottery_fee': 'Loteria', 'casino_roulette': 'Ruleta Casino', 'casino_slots': 'Tragamonedas Casino', 'casino_dice': 'Dados Casino', 'casino_battleship': 'Batalla de Naves', 'sports_football': 'Apuestas Fútbol', 'p2p_fee': 'P2P',
                    };
                    return (
                      <div key={type} className="flex justify-between items-center px-2 py-0.5 bg-slate-800/50 rounded text-xs">
                        <span className="text-slate-400">{typeLabels[type] || type}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sky-300 font-medium">{Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          <span className="text-green-400/70">{fmtUsdt(Number(amount))}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {weeklySnapshots.length > 0 ? (
              weeklySnapshots.map((snapshot, index) => {
                const prevSnapshot = weeklySnapshots[index + 1];
                const change = prevSnapshot ? ((Number(snapshot.total) - Number(prevSnapshot.total)) / Number(prevSnapshot.total)) * 100 : null;
                const isExpanded = expandedSnapshotId === snapshot.id;
                const isBest = weeklySnapshots.length > 1 && Number(snapshot.total) === Math.max(...weeklySnapshots.map(s => Number(s.total)));

                return (
                  <div key={snapshot.id}>
                    <button
                      onClick={() => setExpandedSnapshotId(isExpanded ? null : snapshot.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left ${
                        isExpanded ? 'bg-slate-700/50 border border-slate-600/50' : 'bg-slate-800/50 hover:bg-slate-800 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[48px]">
                          <div className="text-xs text-slate-500">Sem</div>
                          <div className="text-sm font-bold text-slate-200">{snapshot.week_number}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">
                            {snapshot.week_start} - {snapshot.week_end}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-emerald-400">
                              {Number(snapshot.total).toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG
                            </span>
                            <span className="text-xs text-green-400/80">
                              ({fmtUsdt(Number(snapshot.total))})
                            </span>
                            {isBest && (
                              <span className="text-xs px-1.5 py-0.5 bg-amber-900/40 text-amber-400 rounded border border-amber-700/30">
                                Mejor
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {change !== null && (
                          <span className={`text-xs font-medium flex items-center gap-0.5 ${
                            change >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(change).toFixed(1)}%
                          </span>
                        )}
                        <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    {isExpanded && snapshot.breakdown && Object.keys(snapshot.breakdown).length > 0 && (
                      <div className="mt-1 ml-14 p-3 bg-slate-800/30 rounded-lg border border-slate-700/20">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(snapshot.breakdown)
                            .sort(([, a], [, b]) => Number(b) - Number(a))
                            .map(([type, amount]) => {
                              const typeLabels: Record<string, { label: string; color: string }> = {
                                'market_fee': { label: 'Mercado', color: 'text-amber-400' },
                                'withdrawal_fee': { label: 'Retiros', color: 'text-orange-400' },
                                'instant_build': { label: 'Construir', color: 'text-blue-400' },
                                'instant_research': { label: 'Investigar', color: 'text-cyan-400' },
                                'instant_ship': { label: 'Naves', color: 'text-sky-400' },
                                'fleet_acceleration': { label: 'Acelerar', color: 'text-teal-400' },
                                'officer_fxu': { label: 'Oficiales', color: 'text-yellow-400' },
                                'referral_bonus': { label: 'Referidos', color: 'text-green-400' },
                                'supply_box': { label: 'Cajas', color: 'text-blue-300' },
                                'swap_fee': { label: 'Swap', color: 'text-pink-400' },
                                'expedition_fee': { label: 'Expedicion', color: 'text-teal-300' },
                                'transfer_fee': { label: 'Transfer', color: 'text-slate-300' },
                                'demolish_fee': { label: 'Demoler', color: 'text-red-300' },
                                'abandon_colony': { label: 'Abandonar', color: 'text-red-400' },
                                'plus_subscription': { label: 'VIP Plus', color: 'text-emerald-300' },
                                'planet_rename': { label: 'Renombrar', color: 'text-fuchsia-300' },
                                'alliance_creation': { label: 'Alianza', color: 'text-violet-300' },
                                'lottery_fee': { label: 'Loteria', color: 'text-red-300' },
                                'casino_roulette': { label: 'Ruleta Casino', color: 'text-fuchsia-300' },
                                'casino_slots': { label: 'Tragamonedas Casino', color: 'text-fuchsia-300' },
                                'casino_dice': { label: 'Dados Casino', color: 'text-amber-300' },
                                'casino_battleship': { label: 'Batalla de Naves', color: 'text-sky-300' },
                                'sports_football': { label: 'Apuestas Fútbol', color: 'text-green-300' },
                                'p2p_fee': { label: 'P2P', color: 'text-indigo-300' },
                                'blueprint_sale': { label: 'Planos', color: 'text-cyber-yellow' },
                                'other': { label: 'Otros', color: 'text-slate-400' },
                              };
                              const info = typeLabels[type] || { label: type, color: 'text-slate-400' };
                              const pct = Number(snapshot.total) > 0 ? (Number(amount) / Number(snapshot.total)) * 100 : 0;
                              return (
                                <div key={type} className="flex justify-between items-center px-2 py-1 bg-slate-900/40 rounded">
                                  <span className="text-xs text-slate-400">{info.label}</span>
                                  <div className="text-right flex items-center gap-1.5">
                                    <span className={`text-xs font-medium ${info.color}`}>
                                      {Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </span>
                                    <span className="text-xs text-green-400/60">{fmtUsdt(Number(amount))}</span>
                                    <span className="text-xs text-slate-600">({pct.toFixed(1)}%)</span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-700/30 flex justify-between items-center px-2">
                          <span className="text-xs font-medium text-slate-300">Total Semana</span>
                          <span className="text-xs font-bold text-green-400">{fmtUsdt(Number(snapshot.total))} USDT</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-slate-500 text-sm text-center py-6">
                Aun no hay snapshots semanales. Se generan automaticamente cada lunes o puedes tomar uno manualmente.
              </p>
            )}
          </div>
        </div>

        {/* Admin Withdrawal Message */}
        {adminWithdrawMessage && (
          <div className={`mt-4 flex items-center gap-2 p-3 rounded ${
            adminWithdrawMessage.type === 'success'
              ? 'bg-green-900/30 border border-green-700/50 text-green-300'
              : 'bg-red-900/30 border border-red-700/50 text-red-300'
          }`}>
            {adminWithdrawMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span className="text-sm">{adminWithdrawMessage.text}</span>
          </div>
        )}

        {/* Admin Withdrawal History */}
        {adminWithdrawals.length > 0 && (
          <div className="mt-4 p-4 bg-slate-900/50 rounded-lg">
            <h4 className="text-sm font-medium text-slate-300 mb-3">Retiros Admin Recientes</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {adminWithdrawals.slice(0, 10).map((w) => (
                <div key={w.id} className="flex items-center justify-between text-xs p-2 bg-slate-800/50 rounded">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      w.status === 'confirmed' ? 'bg-green-900/50 text-green-400' :
                      w.status === 'pending' ? 'bg-amber-900/50 text-amber-400' :
                      w.status === 'processing' ? 'bg-blue-900/50 text-blue-400' :
                      w.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {w.status}
                    </span>
                    <span className="text-green-400 font-mono">{w.amount.toLocaleString()} TUNG</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{formatDistanceToNow(new Date(w.created_at), { addSuffix: true })}</span>
                    {(w.status === 'pending' || w.status === 'failed') && (
                      <button
                        onClick={async () => {
                          const result = await adminCancelWithdrawal(w.id);
                          if (result.success) {
                            setAdminWithdrawMessage({ type: 'success', text: 'Retiro cancelado. Balance liberado.' });
                          } else {
                            setAdminWithdrawMessage({ type: 'error', text: result.error || 'Error al cancelar' });
                          }
                          setTimeout(() => setAdminWithdrawMessage(null), 5000);
                        }}
                        className="p-1 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded transition-colors"
                        title="Cancelar y liberar balance"
                      >
                        <X className="w-3 h-3 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal de Retiro Admin */}
        {showAdminWithdrawModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-green-400" />
                  Retirar Ganancias Admin
                </h3>
                <button
                  onClick={() => setShowAdminWithdrawModal(false)}
                  className="p-1 hover:bg-slate-700 rounded"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-green-900/20 border border-green-700/30 rounded-lg">
                <p className="text-xs text-green-300">
                  <strong>Sin comision:</strong> Como admin, tus retiros no tienen fee.
                  Solo puedes retirar del balance disponible (comisiones acumuladas).
                </p>
                <p className="text-lg font-bold text-green-400 mt-2">
                  Disponible: {financialStats?.admin_available_balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Monto a retirar (TUNG)
                  </label>
                  <input
                    type="number"
                    value={adminWithdrawAmount}
                    onChange={(e) => setAdminWithdrawAmount(e.target.value)}
                    max={financialStats?.admin_available_balance || 0}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                  <button
                    onClick={() => setAdminWithdrawAmount(String(financialStats?.admin_available_balance || 0))}
                    className="mt-1 text-xs text-green-400 hover:text-green-300"
                  >
                    Retirar todo
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Direccion Wallet (BSC)
                  </label>
                  <input
                    type="text"
                    value={adminWithdrawAddress}
                    onChange={(e) => setAdminWithdrawAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500 font-mono text-sm"
                  />
                </div>

                <button
                  onClick={handleAdminWithdraw}
                  disabled={isLoading || !adminWithdrawAmount || !adminWithdrawAddress}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {isLoading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Banknote className="w-5 h-5" />
                  )}
                  <span>{isLoading ? 'Procesando...' : 'Solicitar Retiro'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Graficas de ingresos por periodo */}
        <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Grafica de Ingresos
            </h3>
            <div className="flex gap-1">
              <button
                onClick={() => setChartPeriod('daily')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  chartPeriod === 'daily'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Diario
              </button>
              <button
                onClick={() => setChartPeriod('weekly')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  chartPeriod === 'weekly'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Semanal
              </button>
              <button
                onClick={() => setChartPeriod('monthly')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  chartPeriod === 'monthly'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Mensual
              </button>
            </div>
          </div>

          {/* Grafica de barras */}
          <div className="h-48 flex items-end gap-1 pt-4 px-2">
            {(() => {
              const data = chartPeriod === 'daily' ? dailyRevenue
                : chartPeriod === 'weekly' ? weeklyRevenue
                : monthlyRevenue;

              const maxAmount = Math.max(...data.map(d => d.amount), 1);
              const displayData = chartPeriod === 'daily' ? data.slice(-14) : data;

              if (displayData.length === 0) {
                return (
                  <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                    Sin datos de ingresos
                  </div>
                );
              }

              return displayData.map((item, index) => {
                const height = (item.amount / maxAmount) * 100;
                const label = chartPeriod === 'daily'
                  ? new Date(item.date!).toLocaleDateString('es', { day: '2-digit', month: 'short' })
                  : chartPeriod === 'weekly'
                  ? `S${item.week_number}`
                  : ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][(item.month || 1) - 1];

                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="relative w-full flex justify-center">
                      <div
                        className="w-full max-w-8 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t transition-all hover:from-emerald-500 hover:to-emerald-300 cursor-pointer"
                        style={{ height: `${Math.max(height, 2)}%`, minHeight: item.amount > 0 ? '4px' : '2px' }}
                        title={`${item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG`}
                      />
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 rounded text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                        {item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate w-full text-center">
                      {label}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          {/* Resumen comparativo */}
          {revenueSummary && (
            <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-700/50">
              <div className="text-center">
                <p className="text-xs text-slate-400 mb-1">Hoy</p>
                <p className="text-lg font-bold text-emerald-400">
                  {revenueSummary.today.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className={`text-xs flex items-center justify-center gap-1 ${
                  revenueSummary.today_change >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {revenueSummary.today_change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(revenueSummary.today_change).toFixed(1)}% vs ayer
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400 mb-1">Esta Semana</p>
                <p className="text-lg font-bold text-cyan-400">
                  {revenueSummary.this_week.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className={`text-xs flex items-center justify-center gap-1 ${
                  revenueSummary.week_change >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {revenueSummary.week_change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(revenueSummary.week_change).toFixed(1)}% vs anterior
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400 mb-1">Este Mes</p>
                <p className="text-lg font-bold text-amber-400">
                  {revenueSummary.this_month.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className={`text-xs flex items-center justify-center gap-1 ${
                  revenueSummary.month_change >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {revenueSummary.month_change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(revenueSummary.month_change).toFixed(1)}% vs anterior
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Seccion de Restaurar Base de Datos */}
        <DatabaseRestoreSection />
      </div>
      )}

      {/* TAB: Usuarios */}
      {activeTab === 'users' && economyUser && (
        <AdminUserEconomyModal
          userId={economyUser.id}
          username={economyUser.username}
          tungPriceUsd={tungPriceUsd}
          onClose={() => setEconomyUser(null)}
        />
      )}
      {activeTab === 'users' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-cyan-400" />
              <h2 className="text-xl font-semibold text-white">Gestion de Usuarios</h2>
              <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                {totalUsers.toLocaleString()} total
              </span>
            </div>
            <button
              onClick={() => fetchUsers(usersPage, userSearchTerm)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Refrescar"
            >
              <RefreshCw className={`w-5 h-5 text-slate-400 ${usersLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mb-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setUsersPage(0);
                      fetchUsers(0, userSearchTerm);
                    }
                  }}
                  placeholder="Buscar por username o email..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => {
                  setUsersPage(0);
                  fetchUsers(0, userSearchTerm);
                }}
                className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
              >
                Buscar
              </button>
              {userSearchTerm && (
                <button
                  onClick={() => {
                    setUserSearchTerm('');
                    setUsersPage(0);
                    fetchUsers(0, '');
                  }}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {userSearchTerm ? 'No se encontraron usuarios con ese criterio' : 'No hay usuarios registrados'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Usuario</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Email</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">Verificado</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">TUNG</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Registro</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">Acciones</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">Autopilot</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">VIP</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">Cuenta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${user.is_banned ? 'bg-red-900/20' : ''}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${user.is_banned ? 'text-red-300 line-through' : 'text-white'}`}>{user.username}</span>
                            <button
                              onClick={() => setEconomyUser({ id: user.id, username: user.username })}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/40"
                              title="Ver economía y wallets"
                            >
                              <Wallet className="w-3.5 h-3.5" />Economía
                            </button>
                            {user.is_admin && (
                              <span className="px-1.5 py-0.5 text-xs bg-red-600/30 text-red-400 rounded">Admin</span>
                            )}
                            {user.is_banned && (
                              <span className="px-1.5 py-0.5 text-xs bg-red-600/40 text-red-300 rounded">Baneado</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300 text-sm">{user.email}</td>
                        <td className="py-3 px-4 text-center">
                          {user.email_verified ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400 mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-cyan-400 font-mono text-sm">
                          {(user.tung_balance || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-sm">
                          {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => handleToggleFeeExempt(user.id, user.username, !!user.fee_exempt)}
                            disabled={togglingFee === user.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 whitespace-nowrap ${
                              user.fee_exempt
                                ? 'bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300'
                                : 'bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 text-slate-400'
                            }`}
                            title={user.fee_exempt
                              ? 'No paga comision al retirar - click para volver a cobrarle'
                              : 'Paga comision al retirar - click para eximirle'}
                          >
                            {togglingFee === user.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>Fee retiro: {user.fee_exempt ? 'Exento' : 'Cobra'}</>
                            )}
                          </button>
                          {!user.email_verified && (
                            <button
                              onClick={() => handleManualVerification(user.id)}
                              disabled={resendingVerification === user.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600/20 hover:bg-green-600/40 border border-green-600/50 text-green-400 rounded transition-colors disabled:opacity-50"
                              title="Verificar cuenta manualmente"
                            >
                              {resendingVerification === user.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <MailCheck className="w-3 h-3" />
                              )}
                              Verificar
                            </button>
                          )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleToggleAutopilotEligible(user.id, user.autopilot_eligible)}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                              user.autopilot_eligible
                                ? 'bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-400'
                                : 'bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 text-slate-400'
                            }`}
                            title={user.autopilot_eligible ? 'Deshabilitar piloto automatico' : 'Habilitar piloto automatico'}
                          >
                            🤖 {user.autopilot_eligible ? 'ON' : 'OFF'}
                            {user.autopilot_active && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleToggleUserPlus(user.id, !!user.is_plus)}
                            disabled={togglingPlus === user.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
                              user.is_plus
                                ? 'bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-300'
                                : 'bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 text-slate-400'
                            }`}
                            title={user.is_plus
                              ? `VIP activo hasta ${user.plus_expires_at ? new Date(user.plus_expires_at).toLocaleDateString() : '?'} - click para retirar`
                              : 'Activar VIP manualmente (sin cobro)'}
                          >
                            {togglingPlus === user.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>👑 {user.is_plus ? 'ON' : 'OFF'}</>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {!user.is_admin && (
                            <button
                              onClick={() => handleToggleUserBan(user.id, user.username, !!user.is_banned)}
                              disabled={togglingBan === user.id}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
                                user.is_banned
                                  ? 'bg-red-600/40 hover:bg-red-600/60 border border-red-500/50 text-red-300'
                                  : 'bg-slate-700/50 hover:bg-red-600/30 border border-slate-600/50 hover:border-red-500/50 text-slate-400 hover:text-red-300'
                              }`}
                              title={user.is_banned
                                ? 'Cuenta baneada - click para reactivarla'
                                : 'Banear cuenta (no podra iniciar sesion)'}
                            >
                              {togglingBan === user.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <Ban className="w-3 h-3" />
                                  {user.is_banned ? 'Baneado' : 'Banear'}
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700">
                <div className="text-sm text-slate-400">
                  Mostrando {usersPage * USERS_PER_PAGE + 1} - {Math.min((usersPage + 1) * USERS_PER_PAGE, totalUsers)} de {totalUsers.toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUsersPage(p => Math.max(0, p - 1))}
                    disabled={usersPage === 0}
                    className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors text-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Anterior
                  </button>
                  <span className="px-3 py-2 text-slate-400 text-sm">
                    Pagina {usersPage + 1} de {Math.ceil(totalUsers / USERS_PER_PAGE) || 1}
                  </span>
                  <button
                    onClick={() => setUsersPage(p => p + 1)}
                    disabled={(usersPage + 1) * USERS_PER_PAGE >= totalUsers}
                    className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors text-sm"
                  >
                    Siguiente
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: Comunicados */}
      {activeTab === 'broadcast' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Megaphone className="w-6 h-6 text-orange-400" />
          <h2 className="text-xl font-semibold text-white">Enviar Comunicado</h2>
        </div>

        <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-4 mb-6">
          <p className="text-orange-300 text-sm">
            Envia un comunicado a todos los usuarios del juego. Puedes elegir enviarlo por mensaje interno, email o ambos.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-slate-300 mb-2 font-medium">Asunto</label>
            <input
              type="text"
              value={broadcastSubject}
              onChange={(e) => setBroadcastSubject(e.target.value)}
              placeholder="Ej: Actualizacion importante del servidor"
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500"
              disabled={isSendingBroadcast}
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-2 font-medium">Mensaje</label>
            <textarea
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="Escribe el contenido del comunicado..."
              rows={8}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 resize-none"
              disabled={isSendingBroadcast}
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendInGame}
                onChange={(e) => setSendInGame(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500"
                disabled={isSendingBroadcast}
              />
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-cyan-400" />
                <span className="text-white">Mensaje en el juego</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500"
                disabled={isSendingBroadcast}
              />
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                <span className="text-white">Correo electronico</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendTelegram}
                onChange={(e) => setSendTelegram(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500"
                disabled={isSendingBroadcast || !telegramGroups.some(g => g.is_enabled)}
              />
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-sky-400" />
                <span className="text-white">Grupo de Telegram</span>
              </div>
            </label>
          </div>

          {sendEmail && (
            <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Asegurate de tener SMTP configurado y habilitado en la pestana SMTP para enviar emails.
              </p>
            </div>
          )}

          {sendTelegram && telegramGroups.length === 0 && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4">
              <p className="text-amber-300 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Sincroniza los grupos de Telegram abajo antes de enviar.
              </p>
            </div>
          )}

          {broadcastMessage && (
            <div className={`p-4 rounded-lg flex items-center gap-2 ${
              broadcastMessage.type === 'success'
                ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300'
                : 'bg-red-900/30 border border-red-700/50 text-red-300'
            }`}>
              {broadcastMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              {broadcastMessage.text}
            </div>
          )}

          <button
            onClick={handleSendBroadcast}
            disabled={isSendingBroadcast || (!sendInGame && !sendEmail && !sendTelegram) || !broadcastSubject.trim() || !broadcastBody.trim()}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {isSendingBroadcast ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Enviando comunicado...
              </>
            ) : (
              <>
                <Megaphone className="w-5 h-5" />
                Enviar Comunicado
              </>
            )}
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-700/50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-6 h-6 text-sky-400" />
              <h3 className="text-lg font-semibold text-white">Grupos de Telegram</h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSyncTelegramGroups}
                disabled={isSyncingGroups}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                {isSyncingGroups ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sincronizar Grupos
                  </>
                )}
              </button>
              <button
                onClick={handleVerifyMemberships}
                disabled={isVerifyingMemberships}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                {isVerifyingMemberships ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    Verificar Membresias
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-sky-900/20 border border-sky-700/50 rounded-lg p-4 mb-6">
            <p className="text-sky-300 text-sm">
              Agrega el bot @TUNGuniverseBot a tus grupos/canales de Telegram y envia un mensaje. Luego presiona "Sincronizar Grupos" para detectar automaticamente todos los grupos donde el bot esta presente.
            </p>
          </div>

          {telegramMessage && (
            <div className={`p-4 rounded-lg flex items-center gap-2 mb-4 ${
              telegramMessage.type === 'success'
                ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300'
                : 'bg-red-900/30 border border-red-700/50 text-red-300'
            }`}>
              {telegramMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              {telegramMessage.text}
            </div>
          )}

          {telegramGroups.length === 0 ? (
            <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-8 text-center">
              <MessageCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">No hay grupos sincronizados</p>
              <p className="text-slate-500 text-sm mt-2">Agrega el bot a tus grupos y presiona "Sincronizar Grupos"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {telegramGroups.map((group) => (
                <div
                  key={group.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    group.is_enabled
                      ? 'bg-sky-900/20 border-sky-700/50'
                      : 'bg-slate-700/30 border-slate-600/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className={`w-5 h-5 ${group.is_enabled ? 'text-sky-400' : 'text-slate-500'}`} />
                    <div>
                      <p className={`font-medium ${group.is_enabled ? 'text-white' : 'text-slate-400'}`}>
                        {group.title}
                      </p>
                      <p className="text-slate-500 text-xs">
                        ID: {group.chat_id}
                        {group.username && ` | @${group.username}`}
                      </p>
                      {group.last_message_at && (
                        <p className="text-slate-500 text-xs">
                          Ultimo envio: {formatDistanceToNow(new Date(group.last_message_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleTelegramGroup(group.id, !group.is_enabled)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        group.is_enabled
                          ? 'bg-emerald-600/30 text-emerald-400 hover:bg-emerald-600/50'
                          : 'bg-slate-600/30 text-slate-400 hover:bg-slate-600/50'
                      }`}
                    >
                      {group.is_enabled ? 'Activo' : 'Inactivo'}
                    </button>
                    <button
                      onClick={() => handleRemoveTelegramGroup(group.id)}
                      className="p-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm text-slate-400 pt-2">
                <span>Total: {telegramGroups.length} grupos</span>
                <span>{telegramGroups.filter(g => g.is_enabled).length} activos</span>
              </div>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <Store className="w-6 h-6 text-emerald-400" />
              <h3 className="text-lg font-semibold text-white">Notificaciones del Mercado</h3>
            </div>
            <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4 mb-4">
              <p className="text-emerald-300 text-sm">
                Cuando esta activo, se enviara automaticamente un mensaje al grupo de Telegram cada vez que un jugador publique una nueva oferta en el mercado. Los mensajes incluyen emojis segun la cantidad ofertada.
              </p>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-700/30 border border-slate-600/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${marketNotificationsEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <div>
                  <p className="font-medium text-white">Notificaciones automaticas</p>
                  <p className="text-slate-400 text-sm">
                    {marketNotificationsEnabled
                      ? 'Las ofertas nuevas se publicaran en Telegram'
                      : 'Las notificaciones estan desactivadas'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleMarketNotifications}
                disabled={isTogglingMarketNotifications || telegramGroups.filter(g => g.is_enabled).length === 0}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  marketNotificationsEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-600 hover:bg-slate-500 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isTogglingMarketNotifications ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : marketNotificationsEnabled ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {marketNotificationsEnabled ? 'Activado' : 'Desactivado'}
              </button>
            </div>
            {telegramGroups.filter(g => g.is_enabled).length === 0 && (
              <p className="text-amber-400 text-sm mt-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Debes tener al menos un grupo de Telegram activo para usar esta funcion.
              </p>
            )}
          </div>
        </div>
      </div>
      )}

      {/* TAB: Velocidad del Juego */}
      {activeTab === 'speeds' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Gauge className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">Velocidad del Juego</h2>
        </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <label className="text-sm font-medium text-slate-300">
                  Velocidad de Construccion/Investigacion
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={gameSpeed}
                  onChange={(e) => setGameSpeed(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-lg font-bold text-cyan-400 w-16 text-right">{gameSpeed}x</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {speedPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setGameSpeed(preset.value)}
                    className={`px-3 py-1 text-xs rounded ${
                      gameSpeed === preset.value
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Rocket className="w-4 h-4 text-blue-400" />
                <label className="text-sm font-medium text-slate-300">
                  Velocidad de Marcha
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={fleetSpeed}
                  onChange={(e) => setFleetSpeed(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-lg font-bold text-blue-400 w-16 text-right">{fleetSpeed}x</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {speedPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setFleetSpeed(preset.value)}
                    className={`px-3 py-1 text-xs rounded ${
                      fleetSpeed === preset.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-green-400" />
                <label className="text-sm font-medium text-slate-300">
                  Velocidad de Produccion de Recursos
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={resourceSpeed}
                  onChange={(e) => setResourceSpeed(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
                <span className="text-lg font-bold text-green-400 w-16 text-right">{resourceSpeed}x</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {speedPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setResourceSpeed(preset.value)}
                    className={`px-3 py-1 text-xs rounded ${
                      resourceSpeed === preset.value
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-700/50">
              <div className="flex items-center gap-3 mb-4">
                <FlaskConical className="w-5 h-5 text-orange-400" />
                <h3 className="text-base font-semibold text-slate-200">Campo de Escombros (CDR)</h3>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Porcentaje de los costes de unidades destruidas que se convierte en escombros reciclables.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Rocket className="w-4 h-4 text-red-400" />
                    <label className="text-sm font-medium text-slate-300">
                      CDR Flotas (naves destruidas)
                    </label>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={fleetDebrisRatio}
                      onChange={(e) => setFleetDebrisRatio(Number(e.target.value))}
                      className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <span className="text-lg font-bold text-red-400 w-16 text-right">{fleetDebrisRatio}%</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[0, 20, 30, 40, 50, 70, 100].map((val) => (
                      <button
                        key={val}
                        onClick={() => setFleetDebrisRatio(val)}
                        className={`px-3 py-1 text-xs rounded ${
                          fleetDebrisRatio === val
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                    <label className="text-sm font-medium text-slate-300">
                      CDR Defensas (defensas destruidas)
                    </label>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={defenseDebrisRatio}
                      onChange={(e) => setDefenseDebrisRatio(Number(e.target.value))}
                      className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                    <span className="text-lg font-bold text-teal-400 w-16 text-right">{defenseDebrisRatio}%</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[0, 10, 20, 30, 50].map((val) => (
                      <button
                        key={val}
                        onClick={() => setDefenseDebrisRatio(val)}
                        className={`px-3 py-1 text-xs rounded ${
                          defenseDebrisRatio === val
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 p-3 bg-slate-700/30 border border-slate-600/40 rounded-lg">
                <p className="text-xs text-slate-400">
                  <strong className="text-slate-300">Clásico:</strong> Flotas 30%, Defensas 0% (las defensas se reconstruyen al 70%).
                  <br />
                  <strong className="text-slate-300">OGame moderno:</strong> Flotas 30-70%, Defensas 0%.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-purple-400" />
                <label className="text-base font-semibold text-slate-200">
                  Control de Registro de Cuentas
                </label>
              </div>

              <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${registrationEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                    <div>
                      <p className="font-medium text-white">
                        {registrationEnabled ? 'Registro Abierto' : 'Registro Cerrado'}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {registrationEnabled
                          ? 'Los nuevos usuarios pueden registrarse'
                          : 'El registro de nuevas cuentas esta temporalmente deshabilitado'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleRegistration}
                    disabled={isLoadingRegistrationConfig}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      registrationEnabled
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isLoadingRegistrationConfig ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : registrationEnabled ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {registrationEnabled ? 'Cerrar Registro' : 'Abrir Registro'}
                  </button>
                </div>
              </div>

              {registrationMessage && (
                <div
                  className={`flex items-center gap-2 p-3 rounded mt-3 ${
                    registrationMessage.type === 'success'
                      ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                      : 'bg-red-900/30 border border-red-700/50 text-red-300'
                  }`}
                >
                  {registrationMessage.type === 'success' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">{registrationMessage.text}</span>
                </div>
              )}
            </div>

            {speedMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded ${
                  speedMessage.type === 'success'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                    : 'bg-red-900/30 border border-red-700/50 text-red-300'
                }`}
              >
                {speedMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{speedMessage.text}</span>
              </div>
            )}

          <button
            onClick={handleSaveSpeeds}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <Save className="w-5 h-5" />
            <span>{isLoading ? 'Guardando...' : 'Guardar Velocidades'}</span>
          </button>
        </div>
      </div>
      )}

      {/* TAB: Proteccion de Jugadores */}
      {activeTab === 'protection' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-6 h-6 text-amber-400" />
          <h2 className="text-xl font-semibold text-white">Proteccion de Jugadores</h2>
        </div>

        <p className="text-slate-400 text-sm mb-6">
          Configura el sistema de proteccion que impide ataques entre jugadores con gran diferencia de puntos. Estilo OGame clásico.
        </p>

        {isLoadingProtection ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <label className="text-sm font-medium text-slate-300">
                  Ratio de Proteccion (puntos)
                </label>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Un ratio de 5 significa que un jugador con 5x o mas puntos que otro no puede atacarlo (y viceversa).
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="2"
                  max="20"
                  value={protectionRatio}
                  onChange={(e) => setProtectionRatio(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-lg font-bold text-amber-400 w-16 text-right">{protectionRatio}:1</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {[2, 3, 5, 7, 10, 15].map((val) => (
                  <button
                    key={val}
                    onClick={() => setProtectionRatio(val)}
                    className={`px-3 py-1 text-xs rounded ${
                      protectionRatio === val
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {val}:1
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                <strong className="text-slate-400">Clásico:</strong> 5:1 | <strong className="text-slate-400">OGame:</strong> 5:1
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <label className="text-sm font-medium text-slate-300">
                  Limite de Proteccion de Novatos (puntos)
                </label>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Los jugadores con menos de estos puntos no pueden ser atacados por jugadores que superen el limite.
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="1000"
                  value={noobProtectionPoints}
                  onChange={(e) => setNoobProtectionPoints(Number(e.target.value))}
                  className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {[0, 1000, 5000, 10000, 25000, 50000].map((val) => (
                  <button
                    key={val}
                    onClick={() => setNoobProtectionPoints(val)}
                    className={`px-3 py-1 text-xs rounded ${
                      noobProtectionPoints === val
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {val === 0 ? 'Desactivado' : val.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <label className="text-sm font-medium text-slate-300">
                  Proteccion Anti-Bashing
                </label>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Limita a 6 ataques por jugador cada 24 horas sobre el mismo objetivo.
              </p>
              <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${bashingProtection ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                    <p className="font-medium text-white">
                      {bashingProtection ? 'Anti-Bashing Activo' : 'Anti-Bashing Desactivado'}
                    </p>
                  </div>
                  <button
                    onClick={() => setBashingProtection(!bashingProtection)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      bashingProtection
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {bashingProtection ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-300/80 space-y-1">
                  <p><strong className="text-amber-300">Ejemplo con ratio {protectionRatio}:1:</strong></p>
                  <p>Jugador A (10,000 pts) NO puede atacar a Jugador B ({'<'} {Math.floor(10000 / protectionRatio).toLocaleString()} pts)</p>
                  <p>Jugador B (2,000 pts) NO puede atacar a Jugador A ({'>'} {(2000 * protectionRatio).toLocaleString()} pts)</p>
                  {noobProtectionPoints > 0 && (
                    <p>Jugadores con {'<'} {noobProtectionPoints.toLocaleString()} pts estan protegidos de jugadores que superen ese limite.</p>
                  )}
                </div>
              </div>
            </div>

            {protectionMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded ${
                  protectionMessage.type === 'success'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                    : 'bg-red-900/30 border border-red-700/50 text-red-300'
                }`}
              >
                {protectionMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{protectionMessage.text}</span>
              </div>
            )}

            <button
              onClick={handleSaveProtection}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
            >
              <Save className="w-5 h-5" />
              <span>Guardar Proteccion</span>
            </button>
          </div>
        )}
      </div>
      )}


      {/* TAB: Disputas P2P */}
      {activeTab === 'p2p_disputes' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <AdminP2PDisputes />
        </div>
      )}

      {/* TAB: KYC */}
      {activeTab === 'kyc' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <AdminKYC />
        </div>
      )}

      {/* [FTFLAG1] TAB: Fortaleza - limite por alianza */}
      {activeTab === 'fortress' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Castle className="w-6 h-6 text-purple-400" />
          <h2 className="text-xl font-semibold text-white">Fortaleza - Limite por Alianza</h2>
        </div>

        <p className="text-slate-400 text-sm mb-6">
          Controla cuantas Fortalezas y Planetas del Tesoro puede tener una misma alianza. Con el limite activo solo puede controlar una posicion; al desactivarlo las alianzas pueden tomar todas las Fortalezas y ademas el Planeta del Tesoro.
        </p>

        {isLoadingStrongholdLimit ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-4 h-4 rounded-full ${strongholdLimitEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`} />
                  <div>
                    <p className="font-semibold text-lg text-white">
                      {strongholdLimitEnabled ? 'Limite Activo (1 por alianza)' : 'Fortalezas Libres (sin limite)'}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      {strongholdLimitEnabled
                        ? 'Cada alianza solo puede controlar una Fortaleza o el Planeta del Tesoro, no ambos.'
                        : 'Una alianza puede controlar varias Fortalezas y tambien el Planeta del Tesoro.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleStrongholdLimit}
                  disabled={isTogglingStrongholdLimit}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors min-w-[160px] flex items-center justify-center gap-2 ${
                    strongholdLimitEnabled
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  } disabled:opacity-50`}
                >
                  {isTogglingStrongholdLimit ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : strongholdLimitEnabled ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isTogglingStrongholdLimit ? 'Cambiando...' : strongholdLimitEnabled ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>

            {strongholdInfo && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
                  <p className="text-xs text-slate-400">Fortalezas ocupadas</p>
                  <p className="text-2xl font-bold text-white mt-1">{strongholdInfo.fortresses_owned}</p>
                </div>
                <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
                  <p className="text-xs text-slate-400">Planetas del Tesoro ocupados</p>
                  <p className="text-2xl font-bold text-white mt-1">{strongholdInfo.treasures_owned}</p>
                </div>
                <div className={`border rounded-lg p-4 ${strongholdInfo.alliances_over_limit > 0 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-700/30 border-slate-600/50'}`}>
                  <p className="text-xs text-slate-400">Alianzas por encima del limite</p>
                  <p className={`text-2xl font-bold mt-1 ${strongholdInfo.alliances_over_limit > 0 ? 'text-amber-300' : 'text-white'}`}>
                    {strongholdInfo.alliances_over_limit}
                  </p>
                </div>
              </div>
            )}

            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200/80 space-y-2">
                  <p><strong className="text-amber-300">Al desactivar el limite:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Una alianza puede tomar las 5 Fortalezas y ademas el Planeta del Tesoro</li>
                    <li>No se toca nada de lo ya capturado</li>
                  </ul>
                  <p className="mt-2"><strong className="text-amber-300">Al volver a activarlo:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Cada alianza conserva solo la posicion que capturo primero</li>
                    <li>Las demas quedan libres para ser reclamadas</li>
                    <li>Las naves estacionadas vuelven al planeta desde el que salieron (o al principal si ese planeta ya no existe)</li>
                    <li>Los miembros de la alianza reciben un mensaje avisando</li>
                  </ul>
                </div>
              </div>
            </div>

            {strongholdLimitMessage && (
              <div className={`p-4 rounded-lg border ${
                strongholdLimitMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                <div className="flex items-center gap-2 text-sm">
                  {strongholdLimitMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  {strongholdLimitMessage.text}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* TAB: Mercado P2P - Limitaciones */}
      {activeTab === 'market' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Store className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">Mercado P2P - Limitaciones</h2>
        </div>

        <p className="text-slate-400 text-sm mb-6">
          Controla las limitaciones semanales de venta en el mercado P2P. Cuando estan activadas, cada jugador tiene un limite de venta semanal basado en sus puntos + TUNG gastados.
        </p>

        {isLoadingMarketLimits ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-4 h-4 rounded-full ${marketLimitsEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                  <div>
                    <p className="font-semibold text-lg text-white">
                      {marketLimitsEnabled ? 'Limitaciones Activas' : 'Limitaciones Desactivadas'}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      {marketLimitsEnabled
                        ? 'Los jugadores tienen limite semanal de venta de recursos y naves basado en sus puntos.'
                        : 'Los jugadores pueden vender sin limite en el mercado P2P.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleMarketLimits}
                  disabled={isTogglingMarketLimits}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors min-w-[160px] flex items-center justify-center gap-2 ${
                    marketLimitsEnabled
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  } disabled:opacity-50`}
                >
                  {isTogglingMarketLimits ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : marketLimitsEnabled ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isTogglingMarketLimits ? 'Cambiando...' : marketLimitsEnabled ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>

            <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-cyan-300/80 space-y-2">
                  <p><strong className="text-cyan-300">Cuando las limitaciones estan activas:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Cada jugador tiene un limite semanal = Puntos + (TUNG gastados × multiplicador)</li>
                    <li>Los recursos (metal, cristal, deuterio) se limitan por unidades</li>
                    <li>Las naves se limitan por valor en recursos (metal + cristal + deuterio)</li>
                    <li>Las ventas se siguen registrando incluso con limitaciones desactivadas</li>
                  </ul>
                  <p className="mt-2"><strong className="text-cyan-300">Al desactivar:</strong> Los jugadores pueden vender sin restricciones, pero el tracking sigue activo para cuando se reactiven.</p>
                </div>
              </div>
            </div>

            {marketLimitsMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded ${
                  marketLimitsMessage.type === 'success'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                    : 'bg-red-900/30 border border-red-700/50 text-red-300'
                }`}
              >
                {marketLimitsMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{marketLimitsMessage.text}</span>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* TAB: Comisiones del Sistema */}
      {activeTab === 'fees' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Percent className="w-6 h-6 text-green-400" />
          <h2 className="text-xl font-semibold text-white">Comisiones del Sistema</h2>
        </div>

          <p className="text-slate-400 text-sm mb-4">
            Configura las comisiones del mercado P2P y el programa de referidos.
          </p>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Store className="w-4 h-4 text-amber-400" />
                <label className="text-sm font-medium text-slate-300">
                  Comision del Mercado P2P
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={marketFeePercent}
                  onChange={(e) => setMarketFeePercent(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-lg font-bold text-amber-400 w-16 text-right">{marketFeePercent}%</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Este porcentaje se cobra en cada transaccion del mercado. El vendedor recibe el monto menos esta comision.
              </p>
            </div>

            <div className="rounded-lg border border-cyan-700/40 bg-cyan-900/10 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-cyan-300" />
                <label className="text-sm font-medium text-cyan-200">Fee Mercado P2P Tokens</label>
              </div>

              <div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.1"
                    value={p2pFeePercent}
                    onChange={(e) => setP2pFeePercent(Number(e.target.value))}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="text-lg font-bold text-cyan-300 w-16 text-right">{p2pFeePercent}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Fee total del mercado P2P de tokens.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Split Admin (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={p2pFeeAdminShare}
                    onChange={(e) => setP2pFeeAdminShare(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Split Referido (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={p2pFeeReferrerShare}
                    onChange={(e) => setP2pFeeReferrerShare(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Split Pool (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={p2pFeePoolShare}
                    onChange={(e) => setP2pFeePoolShare(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              </div>

              <p className={`text-xs ${Math.abs((p2pFeeAdminShare + p2pFeeReferrerShare + p2pFeePoolShare) - 100) < 0.001 ? 'text-emerald-300' : 'text-red-300'}`}>
                Suma split P2P: {(p2pFeeAdminShare + p2pFeeReferrerShare + p2pFeePoolShare).toFixed(2)}%
              </p>
              <p className="text-xs text-slate-400">
                Regla runtime: si el vendedor no tiene referido, el split de referido se suma al pool.
              </p>
            </div>

            {/* NEW: 4-3-3 Market Fee Split */}
            <div className="rounded-lg border border-amber-700/40 bg-amber-900/10 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-amber-300" />
                <label className="text-sm font-medium text-amber-200">Split Comision Mercado (4-3-3)</label>
              </div>
              <p className="text-xs text-slate-400">
                Como se reparte la comision del mercado ({marketFeePercent}%) entre empresa, pool y referidos.
                Si el vendedor no tiene referido, la parte de referido va al pool.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">🏢 Admin / Empresa (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={marketFeeAdminShare}
                    onChange={(e) => setMarketFeeAdminShare(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">🎁 Pool / Jackpot (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={marketFeePoolShare}
                    onChange={(e) => setMarketFeePoolShare(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">👥 Referidos (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={marketFeeReferralShare}
                    onChange={(e) => setMarketFeeReferralShare(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              </div>

              <p className={`text-xs ${Math.abs((marketFeeAdminShare + marketFeePoolShare + marketFeeReferralShare) - 100) < 0.001 ? 'text-emerald-300' : 'text-red-300'}`}>
                Suma split mercado: {(marketFeeAdminShare + marketFeePoolShare + marketFeeReferralShare).toFixed(2)}%
                {Math.abs((marketFeeAdminShare + marketFeePoolShare + marketFeeReferralShare) - 100) >= 0.001 && ' ⚠️ Debe sumar 100%'}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <label className="text-sm font-medium text-slate-300">
                  Contribucion al Jackpot
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={jackpotFeePercent}
                  onChange={(e) => setJackpotFeePercent(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                />
                <span className="text-lg font-bold text-yellow-400 w-16 text-right">{jackpotFeePercent}%</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Porcentaje de la comision del mercado ({marketFeePercent}%) que va al Jackpot. El resto va al admin.
              </p>
              {marketFeePercent > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Ejemplo: De una venta de 1000 TUNG, {Math.floor(1000 * marketFeePercent / 100)} TUNG es la comision.
                  De eso, {Math.floor(1000 * marketFeePercent / 100 * jackpotFeePercent / 100)} TUNG va al Jackpot
                  y {Math.floor(1000 * marketFeePercent / 100) - Math.floor(1000 * marketFeePercent / 100 * jackpotFeePercent / 100)} TUNG al admin.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-400" />
                <label className="text-sm font-medium text-slate-300">
                  Comision de Referidos
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={referralCommissionPercent}
                  onChange={(e) => setReferralCommissionPercent(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-lg font-bold text-blue-400 w-16 text-right">{referralCommissionPercent}%</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Este porcentaje se paga al referidor cuando su referido realiza una venta en el mercado.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Rocket className="w-4 h-4 text-cyan-400" />
                <label className="text-sm font-medium text-slate-300">
                  Fee Expedicion Extra (TUNG)
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={expeditionExtraFee}
                  onChange={(e) => setExpeditionExtraFee(Number(e.target.value))}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500"
                />
                <span className="text-lg font-bold text-cyan-400 w-16 text-right">TUNG</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Costo en TUNG por cada expedicion adicional simultanea. La primera expedicion es GRATIS.
              </p>
            </div>

            {feeMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded ${
                  feeMessage.type === 'success'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                    : 'bg-red-900/30 border border-red-700/50 text-red-300'
                }`}
              >
                {feeMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{feeMessage.text}</span>
              </div>
            )}

          <button
            onClick={handleSaveFees}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <Save className="w-5 h-5" />
            <span>{isLoading ? 'Guardando...' : 'Guardar Comisiones'}</span>
          </button>
        </div>
      </div>
      )}

      {/* TAB: Costos TUNG */}
      {activeTab === 'fxu' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Coins className="w-6 h-6 text-amber-400" />
          <h2 className="text-xl font-semibold text-white">Costos de Completar Rapido (TUNG)</h2>
        </div>

          <div className="p-4 bg-emerald-900/20 border border-emerald-700/30 rounded-lg mb-6">
            <h3 className="text-sm font-medium text-emerald-300 mb-2">Precio en USD (principal):</h3>
            <p className="text-xs text-slate-300">
              El costo se define en USD. El jugador paga el equivalente en TUNG segun el precio de mercado
              (igual que los oficiales): si TUNG sube, se cobra menos TUNG; si baja, mas TUNG. El costo en USD queda fijo.
              Si dejas el campo en 0, se usa el costo TUNG por defecto del sistema.
              {liveTungPrice ? ` Precio TUNG actual: $${liveTungPrice}.` : ' (Precio TUNG live no disponible ahora; se usaria el fallback).'}
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-cyan-400" />
                <label className="text-sm font-medium text-slate-300">
                  Ratio Edificios
                </label>
              </div>
              {renderUsdField('recursos por 1 USD', buildingRatioUsd, setBuildingRatioUsd, 1000)}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical className="w-4 h-4 text-blue-400" />
                <label className="text-sm font-medium text-slate-300">
                  Ratio Investigacion
                </label>
              </div>
              {renderUsdField('recursos por 1 USD', researchRatioUsd, setResearchRatioUsd, 1000)}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Rocket className="w-4 h-4 text-purple-400" />
                <label className="text-sm font-medium text-slate-300">
                  Ratio Naves
                </label>
              </div>
              {renderUsdField('recursos por 1 USD', shipsRatioUsd, setShipsRatioUsd, 1000)}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <label className="text-sm font-medium text-slate-300">
                  Ratio Defensa
                </label>
              </div>
              {renderUsdField('recursos por 1 USD', defenseRatioUsd, setDefenseRatioUsd, 1000)}
            </div>

            <div className="pt-4 border-t border-slate-700/50">
              <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                <Send className="w-5 h-5" />
                Aceleracion de Flotas
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Los jugadores pueden pagar TUNG para acelerar el viaje de sus flotas. Un porcentaje va al jackpot.
              </p>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Rocket className="w-4 h-4 text-orange-400" />
                    <label className="text-sm font-medium text-slate-300">
                      Ratio Flotas
                    </label>
                  </div>
                  {renderUsdField('USD por minuto de viaje', fleetRatioUsd, setFleetRatioUsd, 0.0001)}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <PiggyBank className="w-4 h-4 text-yellow-400" />
                    <label className="text-sm font-medium text-slate-300">
                      % al Jackpot por aceleracion
                    </label>
                  </div>
                  <input
                    type="number"
                    value={fleetJackpotPercent}
                    onChange={(e) => setFleetJackpotPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                    min="0"
                    max="100"
                    step="1"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-yellow-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {fleetJackpotPercent}% va al jackpot, {100 - fleetJackpotPercent}% es revenue directo
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/50">
              <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                ✏️ Costos de Renombrar
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                La primera vez que un jugador pone nombre a su planeta o alianza es GRATIS. Los cambios posteriores cuestan TUNG. VIP tiene 50% de descuento.
              </p>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <label className="text-sm font-medium text-slate-300">
                      Costo Renombrar Planeta
                    </label>
                  </div>
                  {renderUsdField('USD', renamePlanetCostUsd, setRenamePlanetCostUsd, 0.01, liveTungPrice ? Math.ceil((renamePlanetCostUsd || 0) / liveTungPrice) : null)}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    <label className="text-sm font-medium text-slate-300">
                      Costo Renombrar Alianza
                    </label>
                  </div>
                  {renderUsdField('USD', renameAllianceCostUsd, setRenameAllianceCostUsd, 0.01, liveTungPrice ? Math.ceil((renameAllianceCostUsd || 0) / liveTungPrice) : null)}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-4 h-4 text-green-400" />
                    <label className="text-sm font-medium text-slate-300">
                      Costo Crear Alianza
                    </label>
                  </div>
                  {renderUsdField('USD', createAllianceCostUsd, setCreateAllianceCostUsd, 0.01, liveTungPrice ? Math.ceil((createAllianceCostUsd || 0) / liveTungPrice) : null)}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/50">
              <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                🔥 Racha Diaria
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Costo diario en TUNG para activar la racha. Cada día consecutivo suma +5% producción acumulable. Si falla un día, se pierde la racha.
              </p>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <label className="text-sm font-medium text-slate-300">
                      Costo Racha Diaria
                    </label>
                  </div>
                  {renderUsdField('USD', dailyStreakCostUsd, setDailyStreakCostUsd, 0.01, liveTungPrice ? Math.ceil((dailyStreakCostUsd || 0) / liveTungPrice) : null)}
                </div>
              </div>
            </div>

            {fxuMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded ${
                  fxuMessage.type === 'success'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                    : 'bg-red-900/30 border border-red-700/50 text-red-300'
                }`}
              >
                {fxuMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{fxuMessage.text}</span>
              </div>
            )}

          <button
            onClick={handleSaveFxuRatios}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <Save className="w-5 h-5" />
            <span>{isLoading ? 'Guardando...' : 'Guardar Costos TUNG'}</span>
          </button>
        </div>
      </div>
      )}

      {/* TAB: Precios de Oficiales */}
      {activeTab === 'officers' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Crown className="w-6 h-6 text-amber-400" />
          <h2 className="text-xl font-semibold text-white">Precios de Oficiales</h2>
        </div>

        <p className="text-slate-400 text-sm mb-6">
          Configura el precio en <span className="text-emerald-400">USDT</span> de cada oficial. Se cobra en TUNG segun el precio del token en el momento.
          La compra con Materia Oscura esta deshabilitada (los oficiales se pagan solo en TUNG).
        </p>

        <div className="space-y-6">
          {editedOfficerPricing.map((officer) => (
            <div key={officer.id} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                <Crown className="w-5 h-5" />
                {officer.name}
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Precios en Materia Oscura */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-blue-400 flex items-center gap-2">
                    <Gem className="w-4 h-4" />
                    Materia Oscura
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">7 dias</label>
                      <input
                        type="number"
                        value={officer.dark_matter_cost_7d}
                        onChange={(e) => updateOfficerPrice(officer.id, 'dark_matter_cost_7d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">30 dias</label>
                      <input
                        type="number"
                        value={officer.dark_matter_cost_30d}
                        onChange={(e) => updateOfficerPrice(officer.id, 'dark_matter_cost_30d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">90 dias</label>
                      <input
                        type="number"
                        value={officer.dark_matter_cost_90d}
                        onChange={(e) => updateOfficerPrice(officer.id, 'dark_matter_cost_90d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Precios en TUNG */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-orange-400 flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    TUNG (Tokens)
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">7 dias</label>
                      <input
                        type="number"
                        value={officer.fxu_cost_7d}
                        onChange={(e) => updateOfficerPrice(officer.id, 'fxu_cost_7d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">30 dias</label>
                      <input
                        type="number"
                        value={officer.fxu_cost_30d}
                        onChange={(e) => updateOfficerPrice(officer.id, 'fxu_cost_30d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">90 dias</label>
                      <input
                        type="number"
                        value={officer.fxu_cost_90d}
                        onChange={(e) => updateOfficerPrice(officer.id, 'fxu_cost_90d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Precios en USDT (se cobra en TUNG al precio del momento) */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    USDT (se cobra en TUNG)
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">7 dias</label>
                      <input
                        type="number"
                        step="0.01"
                        value={officer.usdt_cost_7d ?? 0}
                        onChange={(e) => updateOfficerPrice(officer.id, 'usdt_cost_7d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        {tungPriceUsd ? `≈ ${Math.ceil((officer.usdt_cost_7d || 0) / tungPriceUsd).toLocaleString()} TUNG` : '…'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">30 dias</label>
                      <input
                        type="number"
                        step="0.01"
                        value={officer.usdt_cost_30d ?? 0}
                        onChange={(e) => updateOfficerPrice(officer.id, 'usdt_cost_30d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        {tungPriceUsd ? `≈ ${Math.ceil((officer.usdt_cost_30d || 0) / tungPriceUsd).toLocaleString()} TUNG` : '…'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">90 dias</label>
                      <input
                        type="number"
                        step="0.01"
                        value={officer.usdt_cost_90d ?? 0}
                        onChange={(e) => updateOfficerPrice(officer.id, 'usdt_cost_90d', Number(e.target.value))}
                        min="0"
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        {tungPriceUsd ? `≈ ${Math.ceil((officer.usdt_cost_90d || 0) / tungPriceUsd).toLocaleString()} TUNG` : '…'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {officerMessage && (
            <div
              className={`flex items-center gap-2 p-3 rounded ${
                officerMessage.type === 'success'
                  ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                  : 'bg-red-900/30 border border-red-700/50 text-red-300'
              }`}
            >
              {officerMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{officerMessage.text}</span>
            </div>
          )}

          <button
            onClick={handleSaveOfficerPricing}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <Save className="w-5 h-5" />
            <span>{isLoading ? 'Guardando...' : 'Guardar Precios de Oficiales'}</span>
          </button>
        </div>
      </div>
      )}

      {/* TAB: Precios de Cosmeticos */}
      {activeTab === 'cosmetics' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Gem className="w-6 h-6 text-fuchsia-400" />
          <h2 className="text-xl font-semibold text-white">💎 Precios de Cosméticos</h2>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Configura el precio en <span className="text-emerald-400">USDT</span> de cada cosmético. Al comprar, el jugador
          paga la cantidad equivalente en <span className="text-orange-400">TUNG</span> según el precio del token en el momento.
          Si dejas el precio en 0, se usa el precio fijo en TUNG antiguo como respaldo.
        </p>
        <div className="mb-6 inline-flex items-center gap-2 text-xs bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-slate-300">
          <Coins className="w-4 h-4 text-orange-400" />
          Precio de mercado en vivo: 1 TUNG = {cosmeticTungPrice != null ? `$${cosmeticTungPrice.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 })}` : '…'}
        </div>

        {(() => {
          const COSMETIC_TYPE_LABELS: Record<string, string> = {
            title: '🏷️ Títulos',
            badge: '🎖️ Insignias',
            planet_effect: '🪐 Efectos de Planeta',
            hero_skin: '🚀 Skins de Nave Héroe',
            battle_effect: '⚡ Efectos de Batalla',
          };
          const grouped = editedCosmeticPricing.reduce((acc, item) => {
            (acc[item.type] = acc[item.type] || []).push(item);
            return acc;
          }, {} as Record<string, typeof editedCosmeticPricing>);

          return (
            <div className="space-y-6">
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
                  <h3 className="text-sm font-semibold text-fuchsia-300 mb-3">
                    {COSMETIC_TYPE_LABELS[type] || type} ({items.length})
                  </h3>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const liveTung = cosmeticTungPrice && item.usd_cost > 0
                        ? Math.ceil(item.usd_cost / cosmeticTungPrice)
                        : item.fxu_cost;
                      return (
                        <div key={item.id} className="grid grid-cols-12 gap-3 items-center py-1.5 border-b border-slate-800/50 last:border-0">
                          <div className="col-span-12 sm:col-span-6 flex items-center gap-2 min-w-0">
                            <span className="text-lg shrink-0">{item.icon}</span>
                            <span className="text-sm text-white truncate">{item.name}</span>
                            <span className="text-[10px] text-slate-500 shrink-0">{item.duration_days}d</span>
                          </div>
                          <div className="col-span-7 sm:col-span-4">
                            <div className="flex items-center gap-1">
                              <span className="text-emerald-400 text-sm">$</span>
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={item.usd_cost}
                                onChange={(e) => updateCosmeticPrice(item.id, Number(e.target.value))}
                                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                              />
                              <span className="text-slate-500 text-xs">USDT</span>
                            </div>
                          </div>
                          <div className="col-span-5 sm:col-span-2 text-right">
                            <span className="text-[11px] text-orange-300 font-orbitron">
                              ≈ {liveTung.toLocaleString()} TUNG
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {cosmeticMessage && (
                <div
                  className={`flex items-center gap-2 p-3 rounded ${
                    cosmeticMessage.type === 'success'
                      ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                      : 'bg-red-900/30 border border-red-700/50 text-red-300'
                  }`}
                >
                  {cosmeticMessage.type === 'success' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">{cosmeticMessage.text}</span>
                </div>
              )}

              <button
                onClick={handleSaveCosmeticPricing}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
              >
                <Save className="w-5 h-5" />
                <span>{isLoading ? 'Guardando...' : 'Guardar Precios de Cosméticos'}</span>
              </button>
            </div>
          );
        })()}
      </div>
      )}

      {/* TAB: Configuracion SMTP */}
      {activeTab === 'smtp' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">Configuracion SMTP</h2>
        </div>

          <p className="text-slate-400 text-sm mb-4">
            Configura tu propio servidor de correo para enviar emails de registro y recuperacion de contrasena.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
              <input
                type="checkbox"
                id="smtpEnabled"
                checked={smtpEnabled}
                onChange={(e) => setSmtpEnabled(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
              <label htmlFor="smtpEnabled" className="text-sm text-slate-300">
                Habilitar SMTP personalizado
              </label>
            </div>

            <div className={smtpEnabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Host SMTP
                </label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.ejemplo.com"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Puerto
                </label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  placeholder="587"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Usuario
                </label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Contrasena
                </label>
                <input
                  type="password"
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email del remitente
                </label>
                <input
                  type="email"
                  value={smtpFromEmail}
                  onChange={(e) => setSmtpFromEmail(e.target.value)}
                  placeholder="noreply@tudominio.com"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Nombre del remitente
                </label>
                <input
                  type="text"
                  value={smtpFromName}
                  onChange={(e) => setSmtpFromName(e.target.value)}
                  placeholder="Falco-X Universo"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {smtpMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded ${
                  smtpMessage.type === 'success'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                    : 'bg-red-900/30 border border-red-700/50 text-red-300'
                }`}
              >
                {smtpMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{smtpMessage.text}</span>
              </div>
            )}

            <button
              onClick={handleSaveSmtp}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <Save className="w-5 h-5" />
              <span>{isLoading ? 'Guardando...' : 'Guardar Configuracion SMTP'}</span>
            </button>
          </div>

          {smtpEnabled && (
            <div className="mt-6 p-4 bg-cyan-900/20 border border-cyan-700/30 rounded-lg">
              <h3 className="text-sm font-medium text-cyan-300 mb-3 flex items-center gap-2">
                <Send className="w-4 h-4" />
                Enviar Correo de Prueba
              </h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="tu@email.com"
                  className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleSendTestEmail}
                  disabled={isSendingTestEmail || !testEmailAddress}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {isSendingTestEmail ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">
                    {isSendingTestEmail ? 'Enviando...' : 'Enviar'}
                  </span>
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Ingresa tu email para recibir un correo de prueba y verificar la configuracion.
              </p>
            </div>
          )}

        <div className="mt-6 p-4 bg-slate-900/50 rounded-lg">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Servicios SMTP recomendados:</h3>
          <ul className="text-xs text-slate-400 space-y-1">
            <li>- Resend (resend.com) - 3,000 emails gratis/mes</li>
            <li>- SendGrid - 100 emails/dia gratis</li>
            <li>- Mailgun - prueba gratuita</li>
            <li>- Postmark - buena entrega</li>
          </ul>
        </div>
      </div>
      )}

      {/* TAB: Configuracion Wallet */}
      {activeTab === 'wallet' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Wallet className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-semibold text-white">Configuracion Wallet</h2>
          </div>

          <div className="space-y-4">
            {walletConfig?.deposit_wallet_address && (
              <div className="p-3 bg-slate-900/50 rounded-lg">
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Direccion del Servidor (Depositos/Retiros)
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-amber-400 font-mono break-all">
                    {walletConfig.deposit_wallet_address}
                  </code>
                  <button
                    onClick={() => copyToClipboard(walletConfig.deposit_wallet_address)}
                    className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                    title="Copiar direccion"
                  >
                    <Copy className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            )}

            {serverWalletInfo && (
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-lg ${parseFloat(serverWalletInfo.bnbBalance) < 0.001 ? 'bg-red-900/30 border border-red-700/50' : 'bg-slate-900/50'}`}>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    BNB para Gas
                  </label>
                  <div className={`text-lg font-mono ${parseFloat(serverWalletInfo.bnbBalance) < 0.001 ? 'text-red-400' : 'text-green-400'}`}>
                    {parseFloat(serverWalletInfo.bnbBalance).toFixed(6)} BNB
                  </div>
                </div>
                <div className="p-3 bg-slate-900/50 rounded-lg">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Tokens Disponibles
                  </label>
                  <div className="text-lg font-mono text-amber-400">
                    {parseFloat(serverWalletInfo.tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}

            {serverWalletInfo && parseFloat(serverWalletInfo.bnbBalance) < 0.001 && (
              <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-medium">BNB Insuficiente para Retiros</p>
                    <p className="text-red-400/80 text-sm mt-1">
                      La wallet del servidor necesita BNB para pagar las fees de gas. Envia al menos 0.01 BNB a:
                    </p>
                    <code className="block mt-2 text-xs text-amber-400 font-mono break-all bg-slate-900/50 p-2 rounded">
                      {walletConfig?.deposit_wallet_address}
                    </code>
                  </div>
                </div>
              </div>
            )}

            {serverWalletInfo && parseFloat(serverWalletInfo.tokenBalance) < 1 && (
              <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-medium">Tokens Insuficientes para Retiros</p>
                    <p className="text-red-400/80 text-sm mt-1">
                      La wallet del servidor no tiene tokens del contrato correcto. Los retiros fallaran.
                    </p>
                    <p className="text-slate-400 text-xs mt-2">
                      Contrato del token: <code className="text-amber-400">0xb957D98a9a57AfbBf7944f3616CdB4802eb2E646</code>
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      Envia tokens de este contrato a la wallet del servidor para habilitar retiros.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                <input
                  type="checkbox"
                  id="depositsEnabled"
                  checked={depositsEnabled}
                  onChange={(e) => setDepositsEnabled(e.target.checked)}
                  className="w-4 h-4 accent-green-500"
                />
                <label htmlFor="depositsEnabled" className="text-sm text-slate-300">
                  Depositos activos
                </label>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                <input
                  type="checkbox"
                  id="withdrawalsEnabled"
                  checked={withdrawalsEnabled}
                  onChange={(e) => setWithdrawalsEnabled(e.target.checked)}
                  className="w-4 h-4 accent-green-500"
                />
                <label htmlFor="withdrawalsEnabled" className="text-sm text-slate-300">
                  Retiros activos
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Monto minimo (TUNG)
              </label>
              <input
                type="number"
                value={minDeposit}
                onChange={(e) => setMinDeposit(Number(e.target.value))}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <p className="text-xs text-slate-500 mt-1">Aplica para depositos y retiros</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Limite diario de retiro (TUNG)
              </label>
              <input
                type="number"
                value={maxWithdrawalDaily}
                onChange={(e) => setMaxWithdrawalDaily(Number(e.target.value))}
                min="0"
                step="1"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Modo de comision de retiro
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWithdrawalFeeMode('flat')}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    withdrawalFeeMode === 'flat'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-900/50 border-slate-600 text-slate-400 hover:text-white'
                  }`}
                >
                  Monto fijo
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawalFeeMode('percent')}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    withdrawalFeeMode === 'percent'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-900/50 border-slate-600 text-slate-400 hover:text-white'
                  }`}
                >
                  Porcentaje (%)
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {withdrawalFeeMode === 'flat'
                  ? 'Se cobra un monto fijo por cada retiro (TUNG y USDT).'
                  : 'Se cobra un porcentaje del monto retirado (TUNG y USDT).'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Tarifa fija de retiro TUNG (en USD)
              </label>
              <input
                type="number"
                value={withdrawalFeeUsd}
                onChange={(e) => setWithdrawalFeeUsd(Number(e.target.value))}
                min="0"
                step="0.01"
                disabled={withdrawalFeeMode !== 'flat'}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
              <p className="text-xs text-slate-400 mt-1">
                Se cobra el equivalente en TUNG a este valor en USD. Ej: 1 = se descuenta 1 USD en TUNG segun el precio actual.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Comision de retiro TUNG (%)
              </label>
              <input
                type="number"
                value={withdrawalFeePercent}
                onChange={(e) => setWithdrawalFeePercent(Number(e.target.value))}
                min="0"
                max="50"
                step="0.1"
                disabled={withdrawalFeeMode !== 'percent'}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
              <p className="text-xs text-slate-400 mt-1">
                {withdrawalFeeMode === 'percent'
                  ? 'Porcentaje que se cobra por cada retiro de TUNG.'
                  : 'Solo se usa como respaldo si no hay precio de TUNG disponible.'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Confirmaciones requeridas
              </label>
              <input
                type="number"
                value={requiredConfirmations}
                onChange={(e) => setRequiredConfirmations(Number(e.target.value))}
                min="1"
                max="50"
                step="1"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="border-t border-slate-600/50 pt-4 mt-4">
              <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Configuracion USDT
              </h3>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                  <input
                    type="checkbox"
                    id="usdtDepositsEnabled"
                    checked={usdtDepositsEnabled}
                    onChange={(e) => setUsdtDepositsEnabled(e.target.checked)}
                    className="w-4 h-4 accent-green-500"
                  />
                  <label htmlFor="usdtDepositsEnabled" className="text-sm text-slate-300">
                    Depositos USDT activos
                  </label>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                  <input
                    type="checkbox"
                    id="usdtWithdrawalsEnabled"
                    checked={usdtWithdrawalsEnabled}
                    onChange={(e) => setUsdtWithdrawalsEnabled(e.target.checked)}
                    className="w-4 h-4 accent-green-500"
                  />
                  <label htmlFor="usdtWithdrawalsEnabled" className="text-sm text-slate-300">
                    Retiros USDT activos
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Monto minimo (USDT)
                  </label>
                  <input
                    type="number"
                    value={usdtMinDeposit}
                    onChange={(e) => setUsdtMinDeposit(Number(e.target.value))}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Aplica para depositos y retiros</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Limite diario de retiro (USDT)
                  </label>
                  <input
                    type="number"
                    value={usdtMaxWithdrawalDaily}
                    onChange={(e) => setUsdtMaxWithdrawalDaily(Number(e.target.value))}
                    min="0"
                    step="1"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Tarifa fija de retiro USDT
                  </label>
                  <input
                    type="number"
                    value={usdtWithdrawalFeeFlat}
                    onChange={(e) => setUsdtWithdrawalFeeFlat(Number(e.target.value))}
                    min="0"
                    step="0.01"
                    disabled={withdrawalFeeMode !== 'flat'}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500 disabled:opacity-50"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Monto fijo en USDT que se descuenta al retirar. Ej: 1 = se descuenta 1 USDT.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Comision de retiro USDT (%)
                  </label>
                  <input
                    type="number"
                    value={usdtWithdrawalFeePercent}
                    onChange={(e) => setUsdtWithdrawalFeePercent(Number(e.target.value))}
                    min="0"
                    max="50"
                    step="0.1"
                    disabled={withdrawalFeeMode !== 'percent'}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-900/30 p-4 rounded-lg border border-cyan-500/30">
              <h3 className="text-cyan-400 font-medium mb-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Configuracion de Swap TUNG/USDT
              </h3>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Comision de Swap (%)
                </label>
                <input
                  type="number"
                  value={swapFeePercent}
                  onChange={(e) => setSwapFeePercent(Number(e.target.value))}
                  min="0"
                  max="50"
                  step="0.1"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Comision aplicada a cada swap entre TUNG y USDT
                </p>
              </div>
            </div>

            {walletMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded ${
                  walletMessage.type === 'success'
                    ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                    : 'bg-red-900/30 border border-red-700/50 text-red-300'
                }`}
              >
                {walletMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{walletMessage.text}</span>
              </div>
            )}

            <button
              onClick={handleSaveWalletConfig}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <Save className="w-5 h-5" />
              <span>{isLoading ? 'Guardando...' : 'Guardar Configuracion'}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-6 h-6 text-orange-400" />
              <h2 className="text-xl font-semibold text-white">Retiros Pendientes</h2>
              <span className="px-2 py-0.5 bg-orange-600/30 text-orange-400 text-sm rounded-full">
                {pendingWithdrawals.length}
              </span>
            </div>
            <button
              onClick={() => fetchPendingWithdrawals()}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Actualizar lista"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
            {pendingWithdrawals.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No hay retiros pendientes
              </div>
            ) : (
              pendingWithdrawals.map((withdrawal) => (
                <div
                  key={withdrawal.id}
                  className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">{withdrawal.username}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-mono">
                        {withdrawal.amount.toFixed(2)} TUNG
                      </span>
                      <button
                        onClick={() => handleApproveWithdrawal(withdrawal.id, withdrawal.username, withdrawal.amount)}
                        disabled={approvingId === withdrawal.id || cancellingId === withdrawal.id}
                        className="p-1.5 bg-green-600/20 hover:bg-green-600/40 disabled:opacity-50 border border-green-600/50 rounded transition-colors"
                        title="Aprobar y enviar tokens"
                      >
                        {approvingId === withdrawal.id ? (
                          <RefreshCw className="w-3.5 h-3.5 text-green-400 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleCancelWithdrawal(withdrawal.id, withdrawal.username)}
                        disabled={cancellingId === withdrawal.id || approvingId === withdrawal.id}
                        className="p-1.5 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 border border-red-600/50 rounded transition-colors"
                        title="Cancelar y devolver saldo"
                      >
                        {cancellingId === withdrawal.id ? (
                          <RefreshCw className="w-3.5 h-3.5 text-red-400 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-xs text-slate-400 font-mono truncate flex-1">
                      {withdrawal.wallet_address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(withdrawal.wallet_address)}
                      className="p-1 hover:bg-slate-700 rounded"
                    >
                      <Copy className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Fee: {withdrawal.fee_amount.toFixed(2)} TUNG
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(withdrawal.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={handleProcessWithdrawals}
            disabled={isLoading || pendingWithdrawals.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Play className="w-5 h-5" />
            <span>
              {isLoading ? 'Procesando...' : `Procesar ${pendingWithdrawals.length} Retiros`}
            </span>
          </button>

          <p className="mt-3 text-xs text-slate-500 text-center">
            Los retiros seran enviados automaticamente a las direcciones de wallet de cada usuario.
          </p>
        </div>
      </div>
      )}

      {activeTab === 'antimulti' && <MultiAccountDetection />}

      {activeTab === 'jackpot' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Sistema de Jackpot</h2>
            </div>

            {jackpotMessage && (
              <div className={`mb-6 p-4 rounded-lg ${jackpotMessage.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50' : 'bg-red-900/30 border border-red-700/50'}`}>
                <div className="flex items-center gap-2">
                  {jackpotMessage.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={jackpotMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                    {jackpotMessage.text}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/10 border border-yellow-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <span className="text-slate-400">Jackpot Actual</span>
                </div>
                <p className="text-2xl font-bold text-yellow-400">
                  {jackpotStats?.balance?.toLocaleString() ?? 0} TUNG
                </p>
              </div>

              <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <span className="text-slate-400">Total Contribuido</span>
                </div>
                <p className="text-2xl font-bold text-emerald-400">
                  {jackpotStats?.total_contributed?.toLocaleString() ?? 0} TUNG
                </p>
              </div>

              <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="w-5 h-5 text-cyan-400" />
                  <span className="text-slate-400">Total Ganado</span>
                </div>
                <p className="text-2xl font-bold text-cyan-400">
                  {jackpotStats?.total_won?.toLocaleString() ?? 0} TUNG
                </p>
              </div>
            </div>

            {jackpotStats?.last_winner && (
              <div className="bg-gradient-to-r from-yellow-900/20 to-transparent border border-yellow-700/30 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <Crown className="w-6 h-6 text-yellow-400" />
                  <div>
                    <p className="text-yellow-400 font-semibold">Ultimo Ganador: {jackpotStats.last_winner}</p>
                    <p className="text-sm text-slate-400">
                      Gano {jackpotStats.last_won_amount?.toLocaleString()} TUNG
                      {jackpotStats.last_won_at && ` - ${formatDistanceToNow(new Date(jackpotStats.last_won_at), { addSuffix: true })}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-blue-400" />
                  Configuracion
                </h3>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    % del Fee de Mercado al Jackpot
                  </label>
                  <input
                    type="number"
                    value={jackpotContributionRate}
                    onChange={(e) => setJackpotContributionRate(Number(e.target.value))}
                    min={0}
                    max={100}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Del 10% de fee, el {jackpotContributionRate}% va al jackpot ({(10 * jackpotContributionRate / 100).toFixed(1)}% del total de venta)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    % Probabilidad de Ganar (en Expedicion)
                  </label>
                  <input
                    type="number"
                    value={jackpotWinChance}
                    onChange={(e) => setJackpotWinChance(Number(e.target.value))}
                    min={0}
                    max={100}
                    step={0.1}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      % Min del Jackpot a Ganar
                    </label>
                    <input
                      type="number"
                      value={jackpotMinWinPercent}
                      onChange={(e) => setJackpotMinWinPercent(Number(e.target.value))}
                      min={1}
                      max={100}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      % Max del Jackpot a Ganar
                    </label>
                    <input
                      type="number"
                      value={jackpotMaxWinPercent}
                      onChange={(e) => setJackpotMaxWinPercent(Number(e.target.value))}
                      min={1}
                      max={100}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Jackpot Minimo para Activar Premios
                  </label>
                  <input
                    type="number"
                    value={jackpotMinForWin}
                    onChange={(e) => setJackpotMinForWin(Number(e.target.value))}
                    min={0}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>

                <button
                  onClick={async () => {
                    const result = await updateJackpotConfig({
                      contribution_rate: jackpotContributionRate,
                      win_chance: jackpotWinChance,
                      min_win_percent: jackpotMinWinPercent,
                      max_win_percent: jackpotMaxWinPercent,
                      min_jackpot_for_win: jackpotMinForWin,
                    });
                    setJackpotMessage(result.success
                      ? { type: 'success', text: 'Configuracion actualizada' }
                      : { type: 'error', text: result.error || 'Error al actualizar' }
                    );
                    setTimeout(() => setJackpotMessage(null), 3000);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Guardar Configuracion
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <PiggyBank className="w-5 h-5 text-emerald-400" />
                  Agregar al Jackpot
                </h3>

                <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-4">
                    Puedes agregar TUNG al jackpot manualmente para promociones o eventos especiales.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={jackpotAddAmount}
                      onChange={(e) => setJackpotAddAmount(e.target.value)}
                      placeholder="Cantidad TUNG"
                      min={1}
                      className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    />
                    <button
                      onClick={async () => {
                        const amount = parseFloat(jackpotAddAmount);
                        if (amount > 0) {
                          const result = await addToJackpot(amount);
                          setJackpotMessage(result.success
                            ? { type: 'success', text: `Se agregaron ${amount.toLocaleString()} TUNG al jackpot` }
                            : { type: 'error', text: result.error || 'Error al agregar' }
                          );
                          if (result.success) setJackpotAddAmount('');
                          setTimeout(() => setJackpotMessage(null), 3000);
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <Gift className="w-4 h-4" />
                      Agregar
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mt-6">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                  Historial Reciente
                </h3>

                <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg max-h-[300px] overflow-y-auto">
                  {jackpotHistory.length === 0 ? (
                    <p className="text-center py-8 text-slate-500">Sin historial</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800/50 sticky top-0">
                        <tr>
                          <th className="text-left p-3 text-slate-400 font-medium">Tipo</th>
                          <th className="text-left p-3 text-slate-400 font-medium">Usuario</th>
                          <th className="text-right p-3 text-slate-400 font-medium">Monto</th>
                          <th className="text-right p-3 text-slate-400 font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {jackpotHistory.map((entry) => (
                          <tr key={entry.id} className="hover:bg-slate-700/30">
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                entry.type === 'win'
                                  ? 'bg-yellow-600/30 text-yellow-400'
                                  : 'bg-emerald-600/30 text-emerald-400'
                              }`}>
                                {entry.type === 'win' ? 'PREMIO' : entry.source}
                              </span>
                            </td>
                            <td className="p-3 text-white">{entry.username || '-'}</td>
                            <td className={`p-3 text-right font-medium ${
                              entry.type === 'win' ? 'text-yellow-400' : 'text-emerald-400'
                            }`}>
                              {entry.type === 'win' ? '-' : '+'}{entry.amount.toLocaleString()}
                            </td>
                            <td className="p-3 text-right text-slate-400">
                              {entry.jackpot_balance_after.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'plus' && (
        <PlusAdminSection />
      )}

      {activeTab === 'supply_boxes' && (
        <SupplyBoxesAdminSection />
      )}

      {activeTab === 'blueprints' && (
        <ShipBlueprintsAdminSection />
      )}

      {activeTab === 'instant_shipyard' && (
        <InstantShipyardAdminSection />
      )}

      {activeTab === 'hallOfFame' && (
        <HallOfFameAdminSection />
      )}

      {activeTab === 'maintenance' && (
        <MaintenanceAdminSection />
      )}

      {activeTab === 'inactive' && (
        <InactiveAccountsAdminSection />
      )}

      {activeTab === 'recaptcha' && (
        <RecaptchaSection />
      )}

      {activeTab === 'premium_missions' && (
        <PremiumMissionsPricingSection />
      )}

      {activeTab === 'twitter' && (
        <TwitterAdminSection />
      )}

      {activeTab === 'lottery' && (
        <LotteryAdminSection />
      )}

      {activeTab === 'raffles' && (
        <RaffleAdminPanel />
      )}

      {activeTab === 'bots' && (
        <BotMonitorSection />
      )}

      {activeTab === 'npc_roles' && (
        <NpcRoleManagerSection />
      )}

      {activeTab === 'inventory' && (
        <PlanetInventoryAdminSection />
      )}

      {activeTab === 'depletion' && <AdminDepletionSection />}

      {activeTab === 'accionistas' && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-emerald-400" /> Accionistas
          </h3>
          <p className="text-sm text-slate-400">
            Los accionistas reciben en tiempo real su % exacto de cada ingreso que entra a la empresa (TUNG o USDT).
            Las fracciones menores a 1 TUNG se acumulan como pendiente y se pagan solas al completar 1 TUNG; nada se pierde.
          </p>

          {shMessage && (
            <div className={`p-3 rounded-lg text-sm ${shMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
              {shMessage.text}
            </div>
          )}

          {/* Resumen de reparto */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400">% total repartido a accionistas</div>
              <div className="text-2xl font-bold text-emerald-400">{shareholdersTotalPercentage.toFixed(2)}%</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400">% que conserva el admin</div>
              <div className="text-2xl font-bold text-white">{(100 - shareholdersTotalPercentage).toFixed(2)}%</div>
            </div>
            <div className="bg-slate-800/50 border border-emerald-700/40 rounded-lg p-4">
              <div className="text-xs text-slate-400">Total repartido a accionistas</div>
              <div className="text-2xl font-bold text-emerald-400">
                {shareholdersTotalPaidFxu.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal text-slate-400">TUNG</span>
              </div>
              <div className="text-xs text-green-400/80 mt-0.5">≈ {fmtUsdt(shareholdersTotalPaidFxu)} USDT</div>
              {shareholdersTotalPaidUsdt > 0 && (
                <div className="text-xs text-slate-400 mt-0.5">+ {shareholdersTotalPaidUsdt.toFixed(2)} USDT directos</div>
              )}
            </div>
            <div className="bg-slate-800/50 border border-blue-700/40 rounded-lg p-4">
              <div className="text-xs text-slate-400">Repartido este mes</div>
              <div className="text-2xl font-bold text-blue-300">
                {shareholdersMonthPaidFxu.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal text-slate-400">TUNG</span>
              </div>
              <div className="text-xs text-green-400/80 mt-0.5">≈ {fmtUsdt(shareholdersMonthPaidFxu)} USDT</div>
              {shareholdersMonthPaidUsdt > 0 && (
                <div className="text-xs text-slate-400 mt-0.5">+ {shareholdersMonthPaidUsdt.toFixed(2)} USDT directos</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400">Repartido hoy</div>
              <div className="text-xl font-bold text-white">
                {shareholdersTodayPaidFxu.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-slate-400">TUNG</span>
              </div>
              <div className="text-xs text-green-400/80 mt-0.5">≈ {fmtUsdt(shareholdersTodayPaidFxu)} USDT</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400">Repartido ultimos 7 dias</div>
              <div className="text-xl font-bold text-white">
                {shareholdersWeekPaidFxu.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-slate-400">TUNG</span>
              </div>
              <div className="text-xs text-green-400/80 mt-0.5">≈ {fmtUsdt(shareholdersWeekPaidFxu)} USDT</div>
            </div>
            <div className="bg-slate-800/50 border border-amber-700/40 rounded-lg p-4">
              <div className="text-xs text-slate-400">Acumulado pendiente (fracciones aun no pagadas)</div>
              <div className="text-xl font-bold text-amber-300">
                {shareholdersPendingFxu.toLocaleString('en-US', { maximumFractionDigits: 4 })} <span className="text-sm font-normal text-slate-400">TUNG</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Se paga automaticamente al llegar a 1 TUNG</div>
            </div>
          </div>

          {/* Agregar accionista */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Agregar accionista</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="email"
                value={shEmail}
                onChange={(e) => setShEmail(e.target.value)}
                placeholder="Correo de la cuenta"
                className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-white text-sm"
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={shPercentage}
                onChange={(e) => setShPercentage(e.target.value)}
                placeholder="% (ej. 5)"
                className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-white text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={shCanView} onChange={(e) => setShCanView(e.target.checked)} />
                Ver Dashboard Financiero
              </label>
            </div>
            <div className="mt-3">
              <button
                disabled={shSaving}
                onClick={async () => {
                  const pct = parseFloat(shPercentage);
                  if (!shEmail.trim() || isNaN(pct)) {
                    setShMessage({ type: 'error', text: 'Ingresa un correo valido y un porcentaje' });
                    return;
                  }
                  setShSaving(true);
                  const res = await addShareholder(shEmail.trim(), pct, shCanView);
                  setShSaving(false);
                  if (res.success) {
                    setShMessage({ type: 'success', text: 'Accionista agregado' });
                    setShEmail('');
                    setShPercentage('');
                    setShCanView(true);
                  } else {
                    setShMessage({ type: 'error', text: res.error || 'Error al agregar' });
                  }
                  setTimeout(() => setShMessage(null), 6000);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium"
              >
                {shSaving ? 'Guardando...' : 'Agregar accionista'}
              </button>
              <span className="ml-3 text-xs text-slate-400">Disponible: {(100 - shareholdersTotalPercentage).toFixed(2)}%</span>
            </div>
          </div>

          {/* Lista de accionistas */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Cuenta</th>
                    <th className="text-left px-4 py-3">%</th>
                    <th className="text-left px-4 py-3">Ganado total</th>
                    <th className="text-left px-4 py-3">Este mes</th>
                    <th className="text-left px-4 py-3">Hoy / 7 dias</th>
                    <th className="text-left px-4 py-3">Pendiente / Wallet</th>
                    <th className="text-center px-4 py-3">Dashboard</th>
                    <th className="text-center px-4 py-3">Activo</th>
                    <th className="text-right px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shareholders.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500">Aun no hay accionistas</td></tr>
                  )}
                  {shareholders.map((s) => (
                    <Fragment key={s.id}>
                    <tr className="border-t border-slate-700/50">
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{s.username || '(sin nombre)'}</div>
                        <div className="text-xs text-slate-400">{s.email}</div>
                        {s.by_source?.length > 0 && (
                          <button
                            onClick={() => setShExpandedId(shExpandedId === s.id ? null : s.id)}
                            className="mt-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                          >
                            {shExpandedId === s.id ? 'Ocultar detalle' : 'Ver detalle por fuente'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {shEditingId === s.id ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.001"
                            value={shEditPct}
                            onChange={(e) => setShEditPct(e.target.value)}
                            className="w-24 px-2 py-1 bg-slate-900/60 border border-slate-700 rounded text-white"
                          />
                        ) : (
                          <span className="text-emerald-400 font-semibold">{Number(s.percentage).toFixed(2)}%</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="text-emerald-400 font-semibold">
                          {Number(s.total_paid_fxu).toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-xs text-slate-500 font-normal">TUNG</span>
                        </div>
                        <div className="text-[11px] text-green-400/70">≈ {fmtUsdt(Number(s.total_paid_fxu))} USDT</div>
                        {Number(s.total_paid_usdt) > 0 && (
                          <div className="text-xs text-slate-400">+ {Number(s.total_paid_usdt).toFixed(4)} USDT</div>
                        )}
                        {Number(s.payout_count) > 0 && (
                          <div className="text-[10px] text-slate-600 mt-0.5">{Number(s.payout_count)} pagos</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="text-blue-300 font-medium">
                          {Number(s.month_paid_fxu).toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-xs text-slate-500 font-normal">TUNG</span>
                        </div>
                        <div className="text-[11px] text-green-400/70">≈ {fmtUsdt(Number(s.month_paid_fxu))} USDT</div>
                        {Number(s.month_paid_usdt) > 0 && (
                          <div className="text-xs text-slate-400">+ {Number(s.month_paid_usdt).toFixed(4)} USDT</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="text-white font-medium">
                          {Number(s.today_paid_fxu).toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-xs text-slate-500 font-normal">hoy</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {Number(s.week_paid_fxu).toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-slate-500">7d</span>
                        </div>
                        {s.last_payout_at && (
                          <div className="text-[10px] text-slate-600 mt-0.5">Ultimo: {new Date(s.last_payout_at).toLocaleString()}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="text-amber-300 font-medium">
                          {Number(s.pending_fxu).toLocaleString('en-US', { maximumFractionDigits: 4 })} <span className="text-xs text-slate-500 font-normal">pend.</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {Number(s.wallet_fxu).toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-slate-500">en wallet</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={async () => {
                            const res = await updateShareholder(s.id, Number(s.percentage), s.is_active, !s.can_view_dashboard);
                            if (!res.success) { setShMessage({ type: 'error', text: res.error || 'Error' }); setTimeout(() => setShMessage(null), 6000); }
                          }}
                          className={`px-2 py-1 rounded text-xs font-medium ${s.can_view_dashboard ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700 text-slate-400'}`}
                        >
                          {s.can_view_dashboard ? 'Si' : 'No'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={async () => {
                            const res = await updateShareholder(s.id, Number(s.percentage), !s.is_active, s.can_view_dashboard);
                            if (!res.success) { setShMessage({ type: 'error', text: res.error || 'Error' }); setTimeout(() => setShMessage(null), 6000); }
                          }}
                          className={`px-2 py-1 rounded text-xs font-medium ${s.is_active ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-400'}`}
                        >
                          {s.is_active ? 'Activo' : 'Pausado'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {shEditingId === s.id ? (
                          <>
                            <button
                              onClick={async () => {
                                const pct = parseFloat(shEditPct);
                                if (isNaN(pct)) return;
                                const res = await updateShareholder(s.id, pct, s.is_active, s.can_view_dashboard);
                                if (res.success) { setShEditingId(null); }
                                else { setShMessage({ type: 'error', text: res.error || 'Error' }); setTimeout(() => setShMessage(null), 6000); }
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded mr-2"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setShEditingId(null)}
                              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setShEditingId(s.id); setShEditPct(String(s.percentage)); }}
                              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded mr-2"
                            >
                              Editar %
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Quitar a ${s.username || s.email} como accionista?`)) return;
                                const res = await removeShareholder(s.id);
                                if (!res.success) { setShMessage({ type: 'error', text: res.error || 'Error' }); setTimeout(() => setShMessage(null), 6000); }
                              }}
                              className="px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white text-xs rounded"
                            >
                              Quitar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {shExpandedId === s.id && (
                      <tr className="bg-slate-900/40">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="text-xs text-slate-400 mb-2">Ganancias de {s.username || s.email} por fuente de ingreso</div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {s.by_source.map((b) => (
                              <div key={b.revenue_type} className="bg-slate-800/60 border border-slate-700/50 rounded px-3 py-2">
                                <div className="text-[11px] text-slate-400 truncate">{b.revenue_type}</div>
                                <div className="text-sm text-emerald-400 font-semibold">
                                  {Number(b.fxu).toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-[10px] text-slate-500 font-normal">TUNG</span>
                                </div>
                                {Number(b.usdt) > 0 && (
                                  <div className="text-[11px] text-slate-400">+ {Number(b.usdt).toFixed(4)} USDT</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ShareholderReferralsPanel tungPriceUsd={tungPriceUsd} />
        </div>
      )}

      {activeTab === 'wars' && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Swords className="w-5 h-5 text-red-400"/> Sistema de Guerras</h3>
          
          {warMessage && (
            <div className={`p-3 rounded-lg text-sm ${warMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
              {warMessage.text}
            </div>
          )}

          {/* Create War */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Crear Nueva Guerra</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <input value={warTitle} onChange={e=>setWarTitle(e.target.value)} placeholder="Título (ej: Choque de Titanes)" className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white" />
              <input type="number" value={warEntryFee} onChange={e=>setWarEntryFee(Number(e.target.value))} placeholder="Entrada TUNG" className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white" />
              <input type="number" value={warDuration} onChange={e=>setWarDuration(Number(e.target.value))} placeholder="Duración en días (ej: 7)" className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white" />
            </div>
            <button onClick={createWar} disabled={!warTitle} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Crear Guerra</button>
          </div>

          {/* War List */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white">Guerras</h4>
              <button onClick={loadWars} disabled={warLoading} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs">
                {warLoading ? '...' : 'Refrescar'}
              </button>
            </div>
            {warList.length === 0 ? (
              <p className="text-sm text-slate-500">No hay guerras. Crea una nueva.</p>
            ) : (
              <div className="space-y-3">
                {warList.map((war:any) => (
                  <div key={war.id} className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold text-white text-sm">{war.title}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          war.status==='open'?'bg-blue-500/20 text-blue-400':
                          war.status==='active'?'bg-green-500/20 text-green-400':
                          war.status==='completed'?'bg-slate-500/20 text-slate-400':'bg-red-500/20 text-red-400'
                        }`}>{war.status}</span>
                      </div>
                      <div className="flex gap-2">
                        {war.status==='open' && <button onClick={()=>startWar(war.id)} className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs">Iniciar</button>}
                        {war.status==='active' && <button onClick={()=>resolveWar(war.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs">Resolver</button>}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px] text-slate-400">
                      <span>Entrada: {war.entry_fee_fxu} TUNG</span>
                      <span>Pozo: {war.total_pool_fxu} TUNG</span>
                      <span>Inscritas: {war.entry_count}</span>
                      <span>{war.war_type} • {war.start_time ? new Date(war.start_time).toLocaleString() : '-'}</span>
                    </div>
                    {war.scores?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-600/50">
                        <table className="w-full text-xs">
                          <thead><tr className="text-slate-500"><th className="text-left w-6">#</th><th className="text-left">Alianza</th><th className="text-right">Pts</th><th className="text-right">Batallas</th>{war.status==='completed' && <th className="text-right">Premio</th>}</tr></thead>
                          <tbody>
                            {war.scores.map((s:any,i:number) => {
                              const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
                              const share = i===0?Math.floor(war.total_pool_fxu*0.40):i===1?Math.floor(war.total_pool_fxu*0.20):i===2?Math.floor(war.total_pool_fxu*0.10):0;
                              return (
                              <tr key={i} className={`text-slate-300 ${i<3?'font-semibold':''}`}>
                                <td>{medal || i+1}</td>
                                <td>{s.alliance_name} [{s.alliance_tag}]</td>
                                <td className="text-right font-mono">{s.total_score?.toLocaleString()}</td>
                                <td className="text-right">{s.battle_count}</td>
                                {war.status==='completed' && <td className="text-right text-yellow-400">{i<3?share.toLocaleString()+' TUNG':'-'}</td>}
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'hero' && <HeroShipAdminSection />}
    </div>
  );
}


function HeroShipAdminSection() {
  // [TUNGAUTO] Costo reinicio en USD (cobrado en TUNG a precio de mercado)
  const [respecUsd, setRespecUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expeditions, setExpeditions] = useState<Array<{
    id: string; name: string; duration_minutes: number;
    prob_common: number; prob_rare: number; prob_epic: number; prob_legendary: number;
    drop_chance: number;
  }>>([]);
  // [HEROAUDIT3] Edicion por expedicion (valores como texto mientras se escribe)
  const [expEdits, setExpEdits] = useState<Record<string, { c: string; r: string; e: string; l: string; d: string }>>({});
  const [savingExpId, setSavingExpId] = useState<string | null>(null);

  // [HEROTUNG1] Costo USD (cobrado en TUNG) de reparacion en hangar
  const [repairUsd, setRepairUsd] = useState(1);
  const [savingKitPrices, setSavingKitPrices] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [costRes, expsRes, settingsRes] = await Promise.all([
        supabase.from('game_settings').select('value').eq('key', 'hero_respec_cost_usd').maybeSingle(),
        supabase.rpc('get_hero_expeditions'),
        supabase.from('game_settings').select('key, value').eq('key', 'hero_repair_cost_usd'),
      ]);
      if (costRes.data) setRespecUsd(parseFloat(costRes.data.value) || 0);
      const exps = Array.isArray(expsRes.data) ? expsRes.data : [];
      setExpeditions(exps);
      const edits: Record<string, { c: string; r: string; e: string; l: string; d: string }> = {};
      for (const x of exps) {
        edits[x.id] = {
          c: String(x.prob_common ?? 50), r: String(x.prob_rare ?? 25),
          e: String(x.prob_epic ?? 15), l: String(x.prob_legendary ?? 5),
          d: String(x.drop_chance ?? 100),
        };
      }
      setExpEdits(edits);
      if (settingsRes.data && settingsRes.data[0]) {
        setRepairUsd(parseFloat(settingsRes.data[0].value) || 1);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSaveRespec = async () => {
    setSaving(true); setMessage(null);
    const { data, error } = await supabase.rpc('admin_update_hero_respec_cost_usd', { p_usd: respecUsd });
    if (error) setMessage({ type: 'error', text: 'Error: ' + error.message });
    else if (!data?.success) setMessage({ type: 'error', text: 'Error: ' + (data?.error || 'desconocido') });
    else setMessage({ type: 'success', text: `Costo reinicio: $${respecUsd} USD en TUNG` });
    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveKitPrices = async () => {
    setSavingKitPrices(true); setMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_update_hero_repair_cost_usd', { p_usd: repairUsd });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error');
      setMessage({ type: 'success', text: `Reparacion en hangar: $${repairUsd} USD en TUNG` });
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error: ' + (err.message || 'desconocido') });
    } finally {
      setSavingKitPrices(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // [HEROAUDIT3] Parseo y validacion local (el servidor valida igual)
  const parseExp = (ed: { c: string; r: string; e: string; l: string; d: string }) => {
    const n = { c: parseFloat(ed.c), r: parseFloat(ed.r), e: parseFloat(ed.e), l: parseFloat(ed.l), d: parseFloat(ed.d) };
    const vals = [n.c, n.r, n.e, n.l, n.d];
    let error: string | null = null;
    if (vals.some(v => isNaN(v))) error = 'Todos los campos deben ser numeros';
    else if (vals.some(v => v < 0 || v > 100)) error = 'Cada valor debe estar entre 0 y 100';
    else if (n.c + n.r + n.e + n.l <= 0) error = 'La suma de rarezas debe ser mayor que 0';
    const sum = n.c + n.r + n.e + n.l;
    const pct = (v: number) => (error || sum <= 0 ? 0 : (v / sum) * 100);
    return { n, error, sum, eff: { c: pct(n.c), r: pct(n.r), e: pct(n.e), l: pct(n.l) } };
  };

  const handleSaveExpedition = async (id: string, name: string) => {
    const ed = expEdits[id];
    if (!ed) return;
    const p = parseExp(ed);
    if (p.error) { setMessage({ type: 'error', text: `${name}: ${p.error}` }); return; }
    setSavingExpId(id); setMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_update_hero_expedition', {
        p_expedition_id: id,
        p_prob_common: p.n.c, p_prob_rare: p.n.r, p_prob_epic: p.n.e, p_prob_legendary: p.n.l,
        p_drop_chance: p.n.d,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error');
      setExpeditions(prev => prev.map(x => x.id === id ? {
        ...x, prob_common: p.n.c, prob_rare: p.n.r, prob_epic: p.n.e, prob_legendary: p.n.l, drop_chance: p.n.d,
      } : x));
      setExpEdits(prev => ({ ...prev, [id]: { c: String(p.n.c), r: String(p.n.r), e: String(p.n.e), l: String(p.n.l), d: String(p.n.d) } }));
      setMessage({ type: 'success', text: `${name}: probabilidades guardadas` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `${name}: ` + (err.message || 'Error desconocido') });
    } finally {
      setSavingExpId(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />Cargando...</div>;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Rocket className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-semibold text-white">Configuracion Nave Heroe</h2>
      </div>

      {/* Respec cost */}
      <div className="bg-slate-700/30 rounded-lg p-4 space-y-3">
        <label className="block text-sm text-slate-300">Costo de reinicio de puntos (USD en TUNG)</label>
        <p className="text-xs text-slate-400">Precio fijo en USD; el jugador paga en TUNG segun el precio de mercado en ese momento (ej: $1 con TUNG a $0.0066 = 152 TUNG). Reparto: 50% pool / 50% empresa (referido 20% de empresa; accionistas sobre empresa).</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">USD</span>
          <input type="number" min={0.01} step={0.01} value={respecUsd}
            onChange={e => setRespecUsd(parseFloat(e.target.value) || 0)}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" />
          <button onClick={handleSaveRespec} disabled={saving || respecUsd <= 0}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar
          </button>
        </div>
      </div>

      {/* [HEROTUNG1] Costo reparacion en hangar (USD cobrado en TUNG) */}
      <div className="bg-slate-700/30 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Reparacion en Hangar Nave Heroe (USD en TUNG)</h3>
        <p className="text-xs text-slate-400">Unica forma de reparar pagando. Este monto es por reparar el 100% de HP; se cobra proporcional al dano (10% danada = 10% del monto), en TUNG al precio vivo. Reparto: 50% pool / 50% empresa (referido 20% de empresa; accionistas sobre empresa).</p>
        <div className="max-w-[200px]">
          <label className="block text-xs text-slate-400 mb-1">Costo reparacion 100% HP (USD)</label>
          <input type="number" min={0.01} step={0.01} value={repairUsd}
            onChange={e => setRepairUsd(parseFloat(e.target.value) || 0)}
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-yellow-300 text-sm text-center" />
        </div>
        <button onClick={handleSaveKitPrices} disabled={savingKitPrices || repairUsd <= 0}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium">
          {savingKitPrices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar
        </button>
      </div>

      {/* [HEROAUDIT3] Probabilidades por Expedicion (loot items) */}
      <div className="bg-slate-700/30 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Probabilidades de botin por Expedicion</h3>
        <div className="text-xs text-slate-400 space-y-1">
          <p><span className="text-cyan-300 font-medium">Botin %</span>: probabilidad de que la expedicion entregue un item al reclamar (100 = siempre, 0 = nunca).</p>
          <p><span className="text-slate-200 font-medium">Comun / Raro / Epico / Legendario</span>: pesos de rareza cuando SI sale item. No tienen que sumar 100: el % real se calcula como peso / suma (se muestra debajo de cada campo).</p>
          <p>Los kits de reparacion nunca salen en expediciones. Cada fila se guarda por separado.</p>
        </div>
        {expeditions.length === 0 ? (
          <p className="text-xs text-slate-500">No hay expediciones configuradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-600/50">
                  <th className="text-left py-2 pr-4">Expedicion</th>
                  <th className="py-1 px-1 text-cyan-400">Botin %</th>
                  <th className="py-1 px-1 text-green-400">Comun</th>
                  <th className="py-1 px-1 text-blue-400">Raro</th>
                  <th className="py-1 px-1 text-purple-400">Epico</th>
                  <th className="py-1 px-1 text-fuchsia-400">Legendario</th>
                  <th className="py-1 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {expeditions.map(x => {
                  const ed = expEdits[x.id] || { c: '0', r: '0', e: '0', l: '0', d: '0' };
                  const p = parseExp(ed);
                  const dirty = ed.c !== String(x.prob_common) || ed.r !== String(x.prob_rare) || ed.e !== String(x.prob_epic)
                    || ed.l !== String(x.prob_legendary) || ed.d !== String(x.drop_chance);
                  const setField = (k: 'c' | 'r' | 'e' | 'l' | 'd', v: string) =>
                    setExpEdits(prev => ({ ...prev, [x.id]: { ...ed, [k]: v } }));
                  const cell = (k: 'c' | 'r' | 'e' | 'l' | 'd', color: string, eff?: number) => (
                    <td className="py-2 px-1 text-center align-top">
                      <input type="text" inputMode="decimal" value={ed[k]} onChange={e => setField(k, e.target.value)}
                        className={`w-16 bg-slate-800 border border-slate-600 rounded px-1 py-1 text-xs text-center ${color}`} />
                      {eff !== undefined && <div className="text-[10px] text-slate-500 mt-0.5">{p.error ? '-' : `${eff.toFixed(eff < 1 ? 2 : 1)}%`}</div>}
                    </td>
                  );
                  const hours = x.duration_minutes >= 60 ? `${+(x.duration_minutes / 60).toFixed(1)}h` : `${x.duration_minutes}m`;
                  return (
                    <tr key={x.id} className="border-b border-slate-700/30">
                      <td className="py-2 pr-4 text-white font-medium whitespace-nowrap align-top">{x.name}
                        <div className="text-[10px] text-slate-500">{hours}</div>
                        {p.error && <div className="text-[10px] text-red-400 whitespace-normal">{p.error}</div>}
                      </td>
                      {cell('d', 'text-cyan-300')}
                      {cell('c', 'text-green-300', p.eff.c)}
                      {cell('r', 'text-blue-300', p.eff.r)}
                      {cell('e', 'text-purple-300', p.eff.e)}
                      {cell('l', 'text-fuchsia-300', p.eff.l)}
                      <td className="py-2 px-2 align-top">
                        <button onClick={() => handleSaveExpedition(x.id, x.name)}
                          disabled={!!p.error || !dirty || savingExpId !== null}
                          className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded transition-colors text-xs font-medium">
                          {savingExpId === x.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          {dirty ? 'Guardar' : 'Guardado'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}
    </div>
  );
}

function SupplyBoxesAdminSection() {
  const [boxes, setBoxes] = useState<Array<{
    id: number;
    name: string;
    code: string;
    description: string;
    metal_amount: number;
    crystal_amount: number;
    deuterium_amount: number;
    price_fxu: number;
    price_usdt: number;
    is_active: boolean;
  }>>([]);
  const [editedBoxes, setEditedBoxes] = useState<typeof boxes>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const emptyNewBox = { name: '', description: '', metal_amount: 0, crystal_amount: 0, deuterium_amount: 0, price_usdt: 0, price_fxu: 0, is_active: true };
  const [newBox, setNewBox] = useState(emptyNewBox);
  const [showNewBox, setShowNewBox] = useState(false);
  const [busy, setBusy] = useState(false);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_live_tung_price_usd');
      if (data != null) setTungPriceUsd(Number(data));
    })();
  }, []);

  const loadBoxes = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('supply_boxes')
      .select('*')
      .is('archived_at', null)
      .order('sort_order');

    if (data) {
      setBoxes(data);
      setEditedBoxes(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadBoxes();
  }, []);

  const handleSaveBox = async (box: typeof editedBoxes[0]) => {
    const { error } = await supabase.rpc('admin_update_supply_box', {
      p_box_code: box.code,
      p_name: box.name,
      p_description: box.description,
      p_metal_amount: box.metal_amount,
      p_crystal_amount: box.crystal_amount,
      p_deuterium_amount: box.deuterium_amount,
      p_price_fxu: box.price_fxu,
      p_price_usdt: box.price_usdt,
      p_is_active: box.is_active
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Caja actualizada correctamente' });
      loadBoxes();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreateBox = async () => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_create_supply_box', {
      p_name: newBox.name,
      p_description: newBox.description,
      p_metal_amount: Math.floor(newBox.metal_amount || 0),
      p_crystal_amount: Math.floor(newBox.crystal_amount || 0),
      p_deuterium_amount: Math.floor(newBox.deuterium_amount || 0),
      p_price_usdt: newBox.price_usdt || 0,
      p_price_fxu: newBox.price_fxu || 0,
      p_is_active: newBox.is_active
    });
    setBusy(false);
    if (error || !data?.success) {
      showMessage('error', error?.message || data?.error || 'No se pudo crear la caja');
      return;
    }
    showMessage('success', 'Caja creada correctamente');
    setNewBox(emptyNewBox);
    setShowNewBox(false);
    loadBoxes();
  };

  const handleDeleteBox = async (box: typeof editedBoxes[0]) => {
    if (busy) return;
    if (!confirm(`¿Quitar la caja "${box.name}"? Dejara de venderse en el mercado.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_delete_supply_box', { p_box_code: box.code });
    setBusy(false);
    if (error || !data?.success) {
      showMessage('error', error?.message || data?.error || 'No se pudo quitar la caja');
      return;
    }
    showMessage('success', data.mode === 'archived'
      ? 'Caja retirada (tiene compras o rifas, se conserva en el historial)'
      : 'Caja eliminada');
    loadBoxes();
  };

  const formatNumber = (num: number) => num.toLocaleString();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Box className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Cajas de Suministro</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewBox(v => !v)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2 px-3 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva caja
            </button>
            <button
              onClick={loadBoxes}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {showNewBox && (
          <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-4">Nueva caja de suministro</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre</label>
                <input
                  type="text"
                  maxLength={60}
                  value={newBox.name}
                  onChange={(e) => setNewBox({ ...newBox, name: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripcion</label>
                <input
                  type="text"
                  maxLength={300}
                  value={newBox.description}
                  onChange={(e) => setNewBox({ ...newBox, description: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Metal</label>
                <input
                  type="number"
                  min={0}
                  value={newBox.metal_amount}
                  onChange={(e) => setNewBox({ ...newBox, metal_amount: Number(e.target.value) })}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-blue-400 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cristal</label>
                <input
                  type="number"
                  min={0}
                  value={newBox.crystal_amount}
                  onChange={(e) => setNewBox({ ...newBox, crystal_amount: Number(e.target.value) })}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-cyan-400 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Deuterio</label>
                <input
                  type="number"
                  min={0}
                  value={newBox.deuterium_amount}
                  onChange={(e) => setNewBox({ ...newBox, deuterium_amount: Number(e.target.value) })}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-green-400 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Precio USDT (dinamico)</label>
                <input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={newBox.price_usdt}
                  onChange={(e) => setNewBox({ ...newBox, price_usdt: Number(e.target.value) })}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-emerald-400 text-sm font-semibold"
                />
                {newBox.price_usdt > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {tungPriceUsd && tungPriceUsd > 0
                      ? `≈ ${formatNumber(Math.ceil(newBox.price_usdt / tungPriceUsd))} TUNG al precio actual`
                      : 'Precio TUNG no disponible'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Precio TUNG (fijo)</label>
                <input
                  type="number"
                  min={0}
                  value={newBox.price_fxu}
                  onChange={(e) => setNewBox({ ...newBox, price_fxu: Number(e.target.value) })}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-yellow-400 text-sm font-semibold"
                />
                <p className="text-[11px] text-slate-500 mt-1">Solo se usa si USDT = 0</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newBox.is_active}
                  onChange={(e) => setNewBox({ ...newBox, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-sm text-slate-400">Activa (visible en el mercado)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowNewBox(false); setNewBox(emptyNewBox); }}
                  className="bg-slate-600 hover:bg-slate-500 text-white text-sm py-2 px-4 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateBox}
                  disabled={busy}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Crear caja
                </button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50' : 'bg-red-900/30 border border-red-700/50'}`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                {message.text}
              </span>
            </div>
          </div>
        )}

        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-6">
          <p className="text-sm text-blue-300">
            Configura las cajas de suministro que los jugadores pueden comprar con TUNG.
            Los recursos se agregan instantaneamente al planeta seleccionado del jugador.
          </p>
        </div>

        <div className="space-y-4">
          {editedBoxes.map((box, idx) => (
            <div key={box.id} className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Box className={`w-5 h-5 ${box.is_active ? 'text-yellow-400' : 'text-slate-500'}`} />
                  <input
                    type="text"
                    value={box.name}
                    onChange={(e) => {
                      const updated = [...editedBoxes];
                      updated[idx] = { ...box, name: e.target.value };
                      setEditedBoxes(updated);
                    }}
                    className="bg-transparent border-b border-slate-600 text-white font-semibold focus:outline-none focus:border-cyan-500 px-1"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={box.is_active}
                    onChange={(e) => {
                      const updated = [...editedBoxes];
                      updated[idx] = { ...box, is_active: e.target.checked };
                      setEditedBoxes(updated);
                    }}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-sm text-slate-400">Activo</span>
                </label>
              </div>

              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-1">Descripcion</label>
                <input
                  type="text"
                  value={box.description || ''}
                  onChange={(e) => {
                    const updated = [...editedBoxes];
                    updated[idx] = { ...box, description: e.target.value };
                    setEditedBoxes(updated);
                  }}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Metal</label>
                  <input
                    type="number"
                    value={box.metal_amount}
                    onChange={(e) => {
                      const updated = [...editedBoxes];
                      updated[idx] = { ...box, metal_amount: Number(e.target.value) };
                      setEditedBoxes(updated);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-blue-400 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cristal</label>
                  <input
                    type="number"
                    value={box.crystal_amount}
                    onChange={(e) => {
                      const updated = [...editedBoxes];
                      updated[idx] = { ...box, crystal_amount: Number(e.target.value) };
                      setEditedBoxes(updated);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-cyan-400 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Deuterio</label>
                  <input
                    type="number"
                    value={box.deuterium_amount}
                    onChange={(e) => {
                      const updated = [...editedBoxes];
                      updated[idx] = { ...box, deuterium_amount: Number(e.target.value) };
                      setEditedBoxes(updated);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-green-400 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Precio USDT (dinamico)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={box.price_usdt ?? 0}
                    onChange={(e) => {
                      const updated = [...editedBoxes];
                      updated[idx] = { ...box, price_usdt: Number(e.target.value) };
                      setEditedBoxes(updated);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-emerald-400 text-sm font-semibold"
                  />
                  {box.price_usdt > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      {tungPriceUsd && tungPriceUsd > 0
                        ? `≈ ${formatNumber(Math.ceil(box.price_usdt / tungPriceUsd))} TUNG al precio actual`
                        : 'Precio TUNG no disponible'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Precio TUNG (fijo)</label>
                  <input
                    type="number"
                    value={box.price_fxu}
                    onChange={(e) => {
                      const updated = [...editedBoxes];
                      updated[idx] = { ...box, price_fxu: Number(e.target.value) };
                      setEditedBoxes(updated);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-yellow-400 text-sm font-semibold"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Solo se usa si USDT = 0</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-600/50 pt-4">
                <div className="text-xs text-slate-500">
                  Total recursos: {formatNumber(box.metal_amount + box.crystal_amount + box.deuterium_amount)}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteBox(editedBoxes[idx])}
                    disabled={busy}
                    className="bg-red-700/80 hover:bg-red-600 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Quitar
                  </button>
                  <button
                    onClick={() => handleSaveBox(editedBoxes[idx])}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanetInventoryAdminSection() {
  // OGame-style: edificios permitidos por tipo de cuerpo celeste
  // Planeta: minas, energia, almacenes, robotica, nanitas, hangar, lab, silo, terraformer, deposito alianza
  const PLANET_BUILDING_IDS = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18]);
  // Luna: solo almacenes, robotica, hangar, base lunar, falange, puerta de salto
  const MOON_BUILDING_IDS = new Set<number>([6, 7, 8, 9, 11, 15, 16, 17]);

  type UserRow = {
    id: string;
    username: string | null;
    email: string | null;
    fxu_balance?: number | null;
    usdt_balance?: number | null;
  };

  type PlanetRow = {
    planet_id: string;
    planet_name: string;
    galaxy: number;
    solar_system: number;
    planet_position: number;
    planet_type: string;
    is_main_planet: boolean;
    is_destroyed: boolean;
  };

  type ShipInventoryRow = {
    ship_type_id: number;
    code: string;
    name: string;
    quantity: number;
  };

  type BuildingInventoryRow = {
    building_type_id: number;
    code: string;
    name: string;
    level: number;
    is_upgrading: boolean;
  };

  type DefenseInventoryRow = {
    defense_type_id: number;
    code: string;
    name: string;
    quantity: number;
    max_per_planet: number | null;
  };

  type ResearchRow = {
    technology_type_id: number;
    code: string;
    name: string;
    category: string | null;
    level: number;
    max_level: number | null;
    is_researching: boolean;
  };

  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const [planets, setPlanets] = useState<PlanetRow[]>([]);
  const [selectedPlanetId, setSelectedPlanetId] = useState<string>('');

  const [ships, setShips] = useState<ShipInventoryRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingInventoryRow[]>([]);
  const [defenses, setDefenses] = useState<DefenseInventoryRow[]>([]);
  const [research, setResearch] = useState<ResearchRow[]>([]);
  const [shipInputs, setShipInputs] = useState<Record<number, string>>({});
  const [buildingInputs, setBuildingInputs] = useState<Record<number, string>>({});
  const [defenseInputs, setDefenseInputs] = useState<Record<number, string>>({});
  const [researchInputs, setResearchInputs] = useState<Record<number, string>>({});

  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isLoadingPlanets, setIsLoadingPlanets] = useState(false);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [isLoadingResearch, setIsLoadingResearch] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [resourceInputs, setResourceInputs] = useState<{ metal: string; crystal: string; deuterium: string }>({
    metal: '',
    crystal: '',
    deuterium: '',
  });
  const [isLoadingResources, setIsLoadingResources] = useState(false);

  const searchUsers = async () => {
    const term = search.trim();
    if (!term) {
      setUsers([]);
      return;
    }

    setIsSearchingUsers(true);
    setMessage(null);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, fxu_balance, usdt_balance')
      .or(`username.ilike.%${term}%,email.ilike.%${term}%`)
      .order('username', { ascending: true })
      .limit(30);

    if (error) {
      setUsers([]);
      setMessage({ type: 'error', text: error.message || 'No se pudo buscar usuarios' });
    } else {
      setUsers((data ?? []) as UserRow[]);
    }

    setIsSearchingUsers(false);
  };

  const loadUserPlanets = async (userId: string) => {
    setIsLoadingPlanets(true);
    setPlanets([]);
    setSelectedPlanetId('');
    setShips([]);
    setBuildings([]);
    setDefenses([]);
    setShipInputs({});
    setBuildingInputs({});
    setDefenseInputs({});

    const { data, error } = await supabase.rpc('admin_get_user_planets', { p_user_id: userId });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudieron cargar planetas' });
      setIsLoadingPlanets(false);
      return;
    }

    const nextPlanets = (data ?? []) as PlanetRow[];
    setPlanets(nextPlanets);
    if (nextPlanets.length > 0) {
      setSelectedPlanetId(nextPlanets[0].planet_id);
    }

    setIsLoadingPlanets(false);
  };

  const loadPlanetInventory = async (planetId: string) => {
    setIsLoadingInventory(true);

    const { data, error } = await supabase.rpc('admin_get_planet_inventory', { p_planet_id: planetId });

    if (error || !data) {
      setShips([]);
      setBuildings([]);
      setDefenses([]);
      setShipInputs({});
      setBuildingInputs({});
      setDefenseInputs({});
      setMessage({ type: 'error', text: error?.message || 'No se pudo cargar inventario' });
      setIsLoadingInventory(false);
      return;
    }

    const nextShips = (data.ships ?? []) as ShipInventoryRow[];
    const nextBuildings = (data.buildings ?? []) as BuildingInventoryRow[];
    const nextDefenses = (data.defenses ?? []) as DefenseInventoryRow[];

    setShips(nextShips);
    setBuildings(nextBuildings);
    setDefenses(nextDefenses);

    const initialShipInputs: Record<number, string> = {};
    nextShips.forEach((s) => {
      initialShipInputs[s.ship_type_id] = String(s.quantity);
    });
    setShipInputs(initialShipInputs);

    const initialBuildingInputs: Record<number, string> = {};
    nextBuildings.forEach((b) => {
      initialBuildingInputs[b.building_type_id] = String(b.level);
    });
    setBuildingInputs(initialBuildingInputs);

    const initialDefenseInputs: Record<number, string> = {};
    nextDefenses.forEach((d) => {
      initialDefenseInputs[d.defense_type_id] = String(d.quantity);
    });
    setDefenseInputs(initialDefenseInputs);

    setIsLoadingInventory(false);
  };

  const loadUserResearch = async (userId: string) => {
    setIsLoadingResearch(true);
    setResearch([]);
    setResearchInputs({});

    const { data, error } = await supabase.rpc('admin_get_user_research', { p_user_id: userId });

    if (error || !data) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo cargar investigaciones' });
      setIsLoadingResearch(false);
      return;
    }

    const nextTech = (data.technologies ?? []) as ResearchRow[];
    setResearch(nextTech);

    const initialResearchInputs: Record<number, string> = {};
    nextTech.forEach((tt) => {
      initialResearchInputs[tt.technology_type_id] = String(tt.level);
    });
    setResearchInputs(initialResearchInputs);

    setIsLoadingResearch(false);
  };

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }
    void loadUserPlanets(selectedUserId);
    void loadUserResearch(selectedUserId);
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedPlanetId) {
      setResourceInputs({ metal: '', crystal: '', deuterium: '' });
      return;
    }
    void loadPlanetInventory(selectedPlanetId);
    void loadPlanetResources(selectedPlanetId);
  }, [selectedPlanetId]);

  // [NOMONEY1] Las funciones creditTokens/debitTokens/creditUsdt/debitUsdt se
  // eliminaron a proposito. Ningun admin puede acreditar ni quitar TUNG o USDT.

  const loadPlanetResources = async (planetId: string) => {
    setIsLoadingResources(true);

    const { data, error } = await supabase.rpc('admin_get_planet_resources', { p_planet_id: planetId });

    if (error || !data) {
      setResourceInputs({ metal: '', crystal: '', deuterium: '' });
      setMessage({ type: 'error', text: error?.message || 'No se pudieron cargar los recursos' });
    } else {
      setResourceInputs({
        metal: String(Number(data.metal ?? 0)),
        crystal: String(Number(data.crystal ?? 0)),
        deuterium: String(Number(data.deuterium ?? 0)),
      });
    }

    setIsLoadingResources(false);
  };

  const saveResources = async () => {
    if (!selectedPlanetId) {
      setMessage({ type: 'error', text: 'Selecciona un planeta primero' });
      return;
    }

    const metal = Number(resourceInputs.metal);
    const crystal = Number(resourceInputs.crystal);
    const deuterium = Number(resourceInputs.deuterium);

    if (
      !Number.isFinite(metal) || metal < 0 ||
      !Number.isFinite(crystal) || crystal < 0 ||
      !Number.isFinite(deuterium) || deuterium < 0
    ) {
      setMessage({ type: 'error', text: 'Los recursos deben ser números mayores o iguales a 0' });
      return;
    }

    setBusyKey('resources');

    const { data, error } = await supabase.rpc('admin_set_planet_resources', {
      p_planet_id: selectedPlanetId,
      p_metal: Math.floor(metal),
      p_crystal: Math.floor(crystal),
      p_deuterium: Math.floor(deuterium),
    });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudieron guardar los recursos' });
    } else {
      setResourceInputs({
        metal: String(Number(data?.new_metal ?? Math.floor(metal))),
        crystal: String(Number(data?.new_crystal ?? Math.floor(crystal))),
        deuterium: String(Number(data?.new_deuterium ?? Math.floor(deuterium))),
      });
      setMessage({
        type: 'success',
        text: `Recursos actualizados en ${(data?.planet_name as string) || 'el planeta'}: ${Math.floor(metal).toLocaleString()} metal · ${Math.floor(crystal).toLocaleString()} cristal · ${Math.floor(deuterium).toLocaleString()} deuterio`,
      });
    }

    setBusyKey(null);
  };

  const saveShip = async (shipTypeId: number) => {
    if (!selectedPlanetId) return;

    const raw = shipInputs[shipTypeId] ?? '0';
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setMessage({ type: 'error', text: 'Cantidad de nave inválida' });
      return;
    }

    const key = `ship-${shipTypeId}`;
    setBusyKey(key);

    const { data, error } = await supabase.rpc('admin_set_planet_ship', {
      p_planet_id: selectedPlanetId,
      p_ship_type_id: shipTypeId,
      p_quantity: quantity,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo guardar nave' });
    } else {
      setMessage({
        type: 'success',
        text: `Nave actualizada: ${(data?.ship_name as string) || `ID ${shipTypeId}`}`,
      });
      setShips((prev) => prev.map((row) => (row.ship_type_id === shipTypeId ? { ...row, quantity } : row)));
    }

    setBusyKey(null);
  };

  const saveBuilding = async (buildingTypeId: number) => {
    if (!selectedPlanetId) return;

    const raw = buildingInputs[buildingTypeId] ?? '0';
    const level = Number(raw);
    if (!Number.isInteger(level) || level < 0 || level > 50) {
      setMessage({ type: 'error', text: 'Nivel de edificio inválido (0-50)' });
      return;
    }

    const key = `building-${buildingTypeId}`;
    setBusyKey(key);

    const { data, error } = await supabase.rpc('admin_set_planet_building', {
      p_planet_id: selectedPlanetId,
      p_building_type_id: buildingTypeId,
      p_level: level,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo guardar edificio' });
    } else {
      setMessage({
        type: 'success',
        text: `Edificio actualizado: ${(data?.building_name as string) || `ID ${buildingTypeId}`}`,
      });
      setBuildings((prev) => prev.map((row) => (row.building_type_id === buildingTypeId ? { ...row, level } : row)));
    }

    setBusyKey(null);
  };

  const saveDefense = async (defenseTypeId: number) => {
    if (!selectedPlanetId) return;

    const raw = defenseInputs[defenseTypeId] ?? '0';
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setMessage({ type: 'error', text: 'Cantidad de defensa inválida' });
      return;
    }

    const key = `defense-${defenseTypeId}`;
    setBusyKey(key);

    const { data, error } = await supabase.rpc('admin_set_planet_defense', {
      p_planet_id: selectedPlanetId,
      p_defense_type_id: defenseTypeId,
      p_quantity: quantity,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo guardar defensa' });
    } else {
      setMessage({
        type: 'success',
        text: `Defensa actualizada: ${(data?.defense_name as string) || `ID ${defenseTypeId}`}`,
      });
      setDefenses((prev) => prev.map((row) => (row.defense_type_id === defenseTypeId ? { ...row, quantity } : row)));
    }

    setBusyKey(null);
  };

  const saveResearch = async (technologyTypeId: number) => {
    if (!selectedUserId) return;

    const raw = researchInputs[technologyTypeId] ?? '0';
    const level = Number(raw);
    if (!Number.isInteger(level) || level < 0) {
      setMessage({ type: 'error', text: 'Nivel de investigación inválido' });
      return;
    }

    const key = `research-${technologyTypeId}`;
    setBusyKey(key);

    const { data, error } = await supabase.rpc('admin_set_user_research', {
      p_user_id: selectedUserId,
      p_technology_type_id: technologyTypeId,
      p_level: level,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo guardar investigación' });
    } else {
      setMessage({
        type: 'success',
        text: `Investigación actualizada: ${(data?.technology_name as string) || `ID ${technologyTypeId}`}`,
      });
      setResearch((prev) => prev.map((row) => (row.technology_type_id === technologyTypeId ? { ...row, level } : row)));
    }

    setBusyKey(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Gift className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Inventario por Cuenta</h2>
        </div>

        <p className="text-slate-300 text-sm mb-5">
          Busca una cuenta, elige planeta y ajusta naves, defensas o edificios. Las investigaciones se editan por cuenta.
        </p>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg border text-sm ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-2">Buscar cuenta</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void searchUsers();
                    }
                  }}
                  placeholder="username o email"
                  className="flex-1 px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm"
                />
                <button
                  onClick={() => {
                    void searchUsers();
                  }}
                  disabled={isSearchingUsers}
                  className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50"
                >
                  {isSearchingUsers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2">Cuenta</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="">Selecciona una cuenta</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {(u.username || '(sin username)') + (u.email ? ` · ${u.email}` : '')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2">Planeta</label>
              <select
                value={selectedPlanetId}
                onChange={(e) => setSelectedPlanetId(e.target.value)}
                disabled={!selectedUserId || isLoadingPlanets}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-60"
              >
                <option value="">Selecciona un planeta</option>
                {planets.map((p) => (
                  <option key={p.planet_id} value={p.planet_id}>
                    {`${p.planet_name} [${p.galaxy}:${p.solar_system}:${p.planet_position}]${p.is_main_planet ? ' · Principal' : ''}${p.is_destroyed ? ' · Destruido' : ''}`}
                  </option>
                ))}
              </select>
            </div>

            {/* [NOMONEY1] Paneles de acreditar/quitar TUNG y USDT eliminados a proposito.
                Nadie -ni el admin- puede modificar saldos de dinero desde el panel.
                Los saldos solo cambian por depositos, retiros, mercado y premios del juego. */}

            <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-amber-300 font-semibold text-sm">Recursos del planeta</h3>
                {isLoadingResources && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
              </div>
              <p className="text-slate-400 text-xs mb-3">
                Fija la cantidad exacta de metal, cristal y deuterio del planeta seleccionado. Solo admin.
              </p>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <label className="col-span-4 text-slate-200 text-sm">Metal</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={resourceInputs.metal}
                    onChange={(e) => setResourceInputs((prev) => ({ ...prev, metal: e.target.value }))}
                    disabled={!selectedPlanetId || isLoadingResources || busyKey === 'resources'}
                    placeholder="0"
                    className="col-span-8 px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-60"
                  />
                </div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <label className="col-span-4 text-slate-200 text-sm">Cristal</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={resourceInputs.crystal}
                    onChange={(e) => setResourceInputs((prev) => ({ ...prev, crystal: e.target.value }))}
                    disabled={!selectedPlanetId || isLoadingResources || busyKey === 'resources'}
                    placeholder="0"
                    className="col-span-8 px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-60"
                  />
                </div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <label className="col-span-4 text-slate-200 text-sm">Deuterio</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={resourceInputs.deuterium}
                    onChange={(e) => setResourceInputs((prev) => ({ ...prev, deuterium: e.target.value }))}
                    disabled={!selectedPlanetId || isLoadingResources || busyKey === 'resources'}
                    placeholder="0"
                    className="col-span-8 px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-60"
                  />
                </div>
              </div>

              <button
                onClick={() => void saveResources()}
                disabled={!selectedPlanetId || isLoadingResources || busyKey === 'resources'}
                className="mt-3 w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2"
              >
                {busyKey === 'resources' && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar recursos
              </button>
            </div>
          </div>

          <div className="xl:col-span-2 space-y-6">
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Naves</h3>
                {isLoadingInventory && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
              </div>

              <div className="max-h-64 overflow-auto space-y-2 pr-1">
                {ships.map((s) => {
                  const key = `ship-${s.ship_type_id}`;
                  return (
                    <div key={s.ship_type_id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6 text-slate-200 text-sm">{s.name}</div>
                      <input
                        type="number"
                        min={0}
                        value={shipInputs[s.ship_type_id] ?? ''}
                        onChange={(e) =>
                          setShipInputs((prev) => ({
                            ...prev,
                            [s.ship_type_id]: e.target.value,
                          }))
                        }
                        className="col-span-4 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                      />
                      <button
                        onClick={() => {
                          void saveShip(s.ship_type_id);
                        }}
                        disabled={!selectedPlanetId || busyKey === key}
                        className="col-span-2 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-60"
                      >
                        {busyKey === key ? '...' : 'Guardar'}
                      </button>
                    </div>
                  );
                })}
                {ships.length === 0 && !isLoadingInventory && (
                  <p className="text-slate-400 text-sm">Selecciona un planeta para editar naves.</p>
                )}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Defensas</h3>
                {isLoadingInventory && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
              </div>

              <div className="max-h-64 overflow-auto space-y-2 pr-1">
                {defenses.map((d) => {
                  const key = `defense-${d.defense_type_id}`;
                  return (
                    <div key={d.defense_type_id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6 text-slate-200 text-sm">{d.name}</div>
                      <input
                        type="number"
                        min={0}
                        value={defenseInputs[d.defense_type_id] ?? ''}
                        onChange={(e) =>
                          setDefenseInputs((prev) => ({
                            ...prev,
                            [d.defense_type_id]: e.target.value,
                          }))
                        }
                        className="col-span-4 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                      />
                      <button
                        onClick={() => {
                          void saveDefense(d.defense_type_id);
                        }}
                        disabled={!selectedPlanetId || busyKey === key}
                        className="col-span-2 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-60"
                      >
                        {busyKey === key ? '...' : 'Guardar'}
                      </button>
                    </div>
                  );
                })}
                {defenses.length === 0 && !isLoadingInventory && (
                  <p className="text-slate-400 text-sm">Selecciona un planeta para editar defensas.</p>
                )}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">
                  Edificios
                  {selectedPlanetId && (() => {
                    const sel = planets.find((p) => p.planet_id === selectedPlanetId);
                    if (!sel) return null;
                    return (
                      <span className="ml-2 text-xs text-slate-400">
                        ({sel.planet_type === 'moon' ? 'Luna' : 'Planeta'})
                      </span>
                    );
                  })()}
                </h3>
                {isLoadingInventory && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
              </div>

              <div className="max-h-64 overflow-auto space-y-2 pr-1">
                {(() => {
                  const sel = planets.find((p) => p.planet_id === selectedPlanetId);
                  const isMoon = sel?.planet_type === 'moon';
                  const allowed = isMoon ? MOON_BUILDING_IDS : PLANET_BUILDING_IDS;
                  const visible = selectedPlanetId
                    ? buildings.filter((b) => allowed.has(b.building_type_id))
                    : buildings;
                  return visible.map((b) => {
                  const key = `building-${b.building_type_id}`;
                  return (
                    <div key={b.building_type_id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6 text-slate-200 text-sm">{b.name}</div>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={buildingInputs[b.building_type_id] ?? ''}
                        onChange={(e) =>
                          setBuildingInputs((prev) => ({
                            ...prev,
                            [b.building_type_id]: e.target.value,
                          }))
                        }
                        className="col-span-4 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                      />
                      <button
                        onClick={() => {
                          void saveBuilding(b.building_type_id);
                        }}
                        disabled={!selectedPlanetId || busyKey === key}
                        className="col-span-2 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-60"
                      >
                        {busyKey === key ? '...' : 'Guardar'}
                      </button>
                    </div>
                  );
                  });
                })()}
                {buildings.length === 0 && !isLoadingInventory && (
                  <p className="text-slate-400 text-sm">Selecciona un planeta para editar edificios.</p>
                )}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">
                  Investigaciones
                  <span className="ml-2 text-xs text-slate-400">(por cuenta)</span>
                </h3>
                {isLoadingResearch && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
              </div>

              <div className="max-h-64 overflow-auto space-y-2 pr-1">
                {research.map((tt) => {
                  const key = `research-${tt.technology_type_id}`;
                  return (
                    <div key={tt.technology_type_id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6 text-slate-200 text-sm">
                        {tt.name}
                        {tt.max_level != null && <span className="ml-1 text-xs text-slate-500">(máx {tt.max_level})</span>}
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={tt.max_level ?? undefined}
                        value={researchInputs[tt.technology_type_id] ?? ''}
                        onChange={(e) =>
                          setResearchInputs((prev) => ({
                            ...prev,
                            [tt.technology_type_id]: e.target.value,
                          }))
                        }
                        className="col-span-4 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                      />
                      <button
                        onClick={() => {
                          void saveResearch(tt.technology_type_id);
                        }}
                        disabled={!selectedUserId || busyKey === key}
                        className="col-span-2 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-60"
                      >
                        {busyKey === key ? '...' : 'Guardar'}
                      </button>
                    </div>
                  );
                })}
                {research.length === 0 && !isLoadingResearch && (
                  <p className="text-slate-400 text-sm">Selecciona una cuenta para editar investigaciones.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShipBlueprintsAdminSection() {
  type BlueprintRow = {
    id: number;
    code: string;
    ship_type_id: number | null;
    defense_type_id: number | null;
    name: string;
    description: string | null;
    image_url: string | null;
    price_usd: number;
    is_active: boolean;
    is_droppable: boolean;
    expedition_drop_chance: number;
    drop_cooldown_seconds: number;
    last_drop_at: string | null;
  };
  const [rows, setRows] = useState<BlueprintRow[]>([]);
  const [edited, setEdited] = useState<BlueprintRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tungPrice, setTungPrice] = useState<number | null>(null);

  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('ship_blueprints')
      .select('id, code, ship_type_id, defense_type_id, name, description, image_url, price_usd, is_active, is_droppable, expedition_drop_chance, drop_cooldown_seconds, last_drop_at')
      .order('price_usd', { ascending: true });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      setRows(data as BlueprintRow[]);
      setEdited(data as BlueprintRow[]);
    }
    const { data: priceData } = await supabase.rpc('get_live_tung_price_usd');
    setTungPrice(priceData != null ? Number(priceData) : null);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (idx: number, patch: Partial<BlueprintRow>) => {
    setEdited((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const save = async (row: BlueprintRow) => {
    setSavingCode(row.code);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_update_ship_blueprint', {
        p_blueprint_code: row.code,
        p_name: row.name,
        p_description: row.description ?? '',
        p_image_url: row.image_url ?? '',
        p_price_usd: row.price_usd,
        p_is_active: row.is_active,
        p_is_droppable: row.is_droppable,
        p_expedition_drop_chance: row.expedition_drop_chance,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al guardar');
      setMessage({ type: 'success', text: `Plano "${row.name}" actualizado` });
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al guardar' });
    } finally {
      setSavingCode(null);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const renderCard = (bp: BlueprintRow, idx: number) => (
    <div
      key={bp.id}
      className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Tag className={`w-5 h-5 ${bp.is_active ? 'text-amber-400' : 'text-slate-500'}`} />
          <input
            type="text"
            value={bp.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            className="bg-transparent border-b border-slate-600 text-white font-semibold focus:outline-none focus:border-cyan-500 px-1 min-w-[280px]"
          />
          <span className="text-xs text-slate-500 font-mono">{bp.code}</span>
        </div>
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bp.is_active}
              onChange={(e) => update(idx, { is_active: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-sm text-slate-400">Activo (a la venta)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bp.is_droppable}
              onChange={(e) => update(idx, { is_droppable: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-sm text-slate-400">Puede salir en expediciones</span>
          </label>
          {bp.is_droppable && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={bp.expedition_drop_chance}
                onChange={(e) => update(idx, { expedition_drop_chance: Math.max(0, Math.min(100, Number(e.target.value))) })}
                className="w-16 bg-slate-700/50 border border-slate-600 rounded px-2 py-1 text-yellow-400 text-sm font-semibold text-center"
              />
              <span className="text-xs text-slate-400">%</span>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-slate-400 mb-1">Descripcion</label>
        <input
          type="text"
          value={bp.description ?? ''}
          onChange={(e) => update(idx, { description: e.target.value })}
          className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-400 mb-1">URL de imagen</label>
          <input
            type="text"
            value={bp.image_url ?? ''}
            onChange={(e) => update(idx, { image_url: e.target.value })}
            className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-cyan-300 text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Precio USDT</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={bp.price_usd}
            onChange={(e) => update(idx, { price_usd: Number(e.target.value) })}
            className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-yellow-400 text-sm font-semibold"
          />
          {tungPrice != null && tungPrice > 0 && bp.price_usd > 0 && (
            <p className="text-[11px] text-cyan-300 mt-1">
              ≈ {Math.ceil(bp.price_usd / tungPrice).toLocaleString()} TUNG hoy
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-600/50 pt-4">
        <div className="text-xs text-slate-500">
          Reparto: <span className="text-purple-300">50% pools</span> +{' '}
          <span className="text-emerald-300">50% empresa</span>{' '}
          (<span className="text-amber-300">20% de empresa a referido</span>)
        </div>
        <button
          onClick={() => save(edited[idx])}
          disabled={savingCode === bp.code}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
        >
          {savingCode === bp.code ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Guardar
        </button>
      </div>
    </div>
  );

  const shipRows = edited.map((bp, idx) => ({ bp, idx })).filter((x) => x.bp.defense_type_id == null);
  const defenseRows = edited.map((bp, idx) => ({ bp, idx })).filter((x) => x.bp.defense_type_id != null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Planos de Naves y Defensa</h2>
          </div>
          <button
            onClick={load}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-emerald-900/30 border border-emerald-700/50'
                : 'bg-red-900/30 border border-red-700/50'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                {message.text}
              </span>
            </div>
          </div>
        )}

        <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 mb-6 space-y-3">
          <p className="text-sm text-amber-200">
            Un plano por cada tipo de nave. El precio se fija en <strong>USDT</strong> y se cobra al jugador en
            <strong> TUNG</strong> al precio de mercado en el momento de la compra. Los planos son
            <strong> consumibles</strong>: <strong>1 plano = 1 nave</strong>. Al construir se gasta un plano por unidad
            y el jugador se salta los requisitos de tecnologías/edificios (solo necesita Hangar nivel 1 y los recursos).
          </p>
          <p className="text-xs text-amber-200/80">
            Reparto de cada compra: <strong>50% a los pools de recompensa</strong>,
            <strong> 50% a la empresa</strong>, y de la parte de empresa un <strong>20% al referido</strong>
            (si no tiene referido, queda para la empresa). Categoria de cuadre:{' '}
            <code className="bg-slate-800 px-1 rounded">blueprint_sale</code>.
            {tungPrice != null && (
              <span className="block mt-1 text-cyan-300">
                Precio TUNG actual: 1 TUNG = ${tungPrice} USDT
              </span>
            )}
          </p>
        </div>

        {edited.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">No hay planos definidos en la BD.</p>
        ) : (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Rocket className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-cyan-300">Planos de Naves ({shipRows.length})</h3>
              </div>
              {shipRows.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No hay planos de naves.</p>
              ) : (
                <div className="space-y-4">
                  {shipRows.map(({ bp, idx }) => renderCard(bp, idx))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-emerald-300">Planos de Defensa ({defenseRows.length})</h3>
              </div>
              {defenseRows.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No hay planos de defensa.</p>
              ) : (
                <div className="space-y-4">
                  {defenseRows.map(({ bp, idx }) => renderCard(bp, idx))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 p-3 bg-slate-900/40 border border-slate-700/40 rounded-lg text-xs text-slate-400">
          <p className="mb-1">
            <strong className="text-slate-300">Nota:</strong> para crear o eliminar planos hay que hacerlo via SQL:
          </p>
          <code className="block bg-slate-800/60 p-2 rounded mt-1 text-cyan-300">
            INSERT INTO ship_blueprints (code, ship_type_id, name, description, image_url, price_fxu, is_active) VALUES (...);
          </code>
        </div>
      </div>
    </div>
  );
}

function InstantShipyardAdminSection() {
  type OfferRow = {
    code: string;
    item_type: 'ship' | 'defense';
    name: string;
    description: string | null;
    image_url: string | null;
    price_usd: number;
    max_per_order: number;
    is_active: boolean;
    sort_order: number;
    blueprint_price_usd: number | null;
    sold_units: number;
    sold_tung: number;
  };

  const [rows, setRows] = useState<OfferRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tungPrice, setTungPrice] = useState<number | null>(null);

  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc('admin_list_instant_unit_offers');
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (!data?.success) {
      setMessage({ type: 'error', text: data?.error || 'Error al cargar' });
    } else {
      setRows((data.offers || []) as OfferRow[]);
    }
    const { data: priceData } = await supabase.rpc('get_live_tung_price_usd');
    setTungPrice(priceData != null ? Number(priceData) : null);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (idx: number, patch: Partial<OfferRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const save = async (row: OfferRow) => {
    setSavingCode(row.code);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_update_instant_unit_offer', {
        p_code: row.code,
        p_price_usd: row.price_usd,
        p_is_active: row.is_active,
        p_max_per_order: row.max_per_order,
        p_name: row.name,
        p_description: row.description ?? '',
        p_image_url: row.image_url ?? '',
        p_sort_order: row.sort_order,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al guardar');
      setMessage({ type: 'success', text: `"${row.name}" actualizado` });
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al guardar' });
    } finally {
      setSavingCode(null);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const renderCard = (row: OfferRow, idx: number) => (
    <div key={row.code} className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Factory className={`w-5 h-5 ${row.is_active ? 'text-cyan-400' : 'text-slate-500'}`} />
          <input
            type="text"
            value={row.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            className="bg-transparent border-b border-slate-600 text-white font-semibold focus:outline-none focus:border-cyan-500 px-1 min-w-[260px]"
          />
          <span className="text-xs text-slate-500 font-mono">{row.code}</span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={row.is_active}
            onChange={(e) => update(idx, { is_active: e.target.checked })}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-sm text-slate-400">A la venta</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-400 mb-1">URL de imagen (vacio = la del tipo de unidad)</label>
          <input
            type="text"
            value={row.image_url ?? ''}
            onChange={(e) => update(idx, { image_url: e.target.value })}
            className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-cyan-300 text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Precio USDT por unidad</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={row.price_usd}
            onChange={(e) => update(idx, { price_usd: Number(e.target.value) })}
            className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-yellow-400 text-sm font-semibold"
          />
          {tungPrice != null && tungPrice > 0 && row.price_usd > 0 && (
            <p className="text-[11px] text-cyan-300 mt-1">
              ≈ {Math.ceil(row.price_usd / tungPrice).toLocaleString()} TUNG hoy
            </p>
          )}
          {row.blueprint_price_usd != null && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Plano: ${row.blueprint_price_usd}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Maximo por pedido</label>
          <input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={row.max_per_order}
            onChange={(e) => update(idx, { max_per_order: Math.max(1, Math.min(100000, Number(e.target.value))) })}
            className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-600/50 pt-4 flex-wrap gap-3">
        <div className="text-xs text-slate-500">
          Vendidas: <span className="text-cyan-300">{Number(row.sold_units || 0).toLocaleString()}</span> uds ·{' '}
          <span className="text-emerald-300">{Number(row.sold_tung || 0).toLocaleString()} TUNG</span>
        </div>
        <button
          onClick={() => save(row)}
          disabled={savingCode === row.code}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
        >
          {savingCode === row.code ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
      </div>
    </div>
  );

  const ships = rows.map((r, idx) => ({ r, idx })).filter((x) => x.r.item_type === 'ship');
  const defenses = rows.map((r, idx) => ({ r, idx })).filter((x) => x.r.item_type === 'defense');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Factory className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">Astillero Corporativo</h2>
          </div>
          <button onClick={load} className="p-2 hover:bg-slate-700 rounded-lg transition-colors" title="Actualizar">
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-emerald-900/30 border border-emerald-700/50'
                : 'bg-red-900/30 border border-red-700/50'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>{message.text}</span>
            </div>
          </div>
        )}

        <div className="bg-cyan-900/20 border border-cyan-700/40 rounded-lg p-4 mb-6 space-y-3">
          <p className="text-sm text-cyan-100">
            Venta directa de naves y defensas <strong>ya ensambladas</strong>. El jugador elige planeta y cantidad,
            paga en <strong>TUNG</strong> al cambio del momento y la unidad se entrega al instante: sin cola de
            hangar y sin gastar recursos del planeta.
          </p>
          <p className="text-xs text-cyan-200/80">
            Reparto de cada venta: <strong>50% a los pools</strong>, <strong>50% a la empresa</strong> (y de ahi a los
            accionistas), y de la parte de empresa un <strong>20% al referido</strong>. Categoria de cuadre:{' '}
            <code className="bg-slate-800 px-1 rounded">instant_unit_sale</code>. Precios iniciales sembrados a{' '}
            <strong>1.5x el precio del plano</strong>.
            {tungPrice != null && (
              <span className="block mt-1 text-cyan-300">Precio TUNG actual: 1 TUNG = ${tungPrice} USDT</span>
            )}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">No hay unidades configuradas.</p>
        ) : (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Rocket className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-cyan-300">Naves ({ships.length})</h3>
              </div>
              <div className="space-y-4">{ships.map(({ r, idx }) => renderCard(r, idx))}</div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-emerald-300">Defensas ({defenses.length})</h3>
              </div>
              <div className="space-y-4">{defenses.map(({ r, idx }) => renderCard(r, idx))}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HallOfFameAdminSection() {
  const [roundName, setRoundName] = useState('');
  const [roundNotes, setRoundNotes] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<{ success: boolean; message: string } | null>(null);
  const [rounds, setRounds] = useState<Array<{
    id: string;
    round_number: number;
    name: string;
    ended_at: string;
    total_players: number;
    total_alliances: number;
  }>>([]);
  const [loadingRounds, setLoadingRounds] = useState(true);

  useEffect(() => {
    loadRounds();
  }, []);

  const loadRounds = async () => {
    setLoadingRounds(true);
    try {
      const { data, error } = await supabase
        .from('game_rounds')
        .select('*')
        .order('round_number', { ascending: false });

      if (error) throw error;
      setRounds(data || []);
    } catch (error) {
      console.error('Error loading rounds:', error);
    } finally {
      setLoadingRounds(false);
    }
  };

  const handleCloseRound = async () => {
    if (!confirm('ATENCION: Esta accion cerrara la ronda actual y guardara el top 10 de todas las categorias en el Salon de la Fama. Esta accion NO se puede deshacer. Continuar?')) {
      return;
    }

    setIsClosing(true);
    setCloseResult(null);

    try {
      const { data, error } = await supabase.rpc('admin_close_round', {
        p_round_name: roundName || null,
        p_notes: roundNotes || null,
      });

      if (error) throw error;

      if (data.success) {
        setCloseResult({
          success: true,
          message: `Ronda "${data.round_name}" cerrada exitosamente. ${data.total_players} jugadores y ${data.total_alliances} alianzas registrados en el Salon de la Fama.`,
        });
        setRoundName('');
        setRoundNotes('');
        loadRounds();
      } else {
        setCloseResult({ success: false, message: data.error || 'Error desconocido' });
      }
    } catch (error) {
      console.error('Error closing round:', error);
      setCloseResult({ success: false, message: 'Error al cerrar la ronda' });
    } finally {
      setIsClosing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Award className="w-6 h-6 text-yellow-400" />
          <h2 className="text-xl font-bold text-white">Salon de la Fama - Administracion</h2>
        </div>

        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-red-300 font-semibold">Importante</p>
              <p className="text-red-300/80 text-sm mt-1">
                Cerrar una ronda guarda permanentemente el top 10 de jugadores y alianzas en todas las categorias.
                Esta accion esta pensada para cuando el servidor se reinicia o termina una temporada.
              </p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Cerrar Ronda Actual
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Nombre de la Ronda (opcional)
                </label>
                <input
                  type="text"
                  value={roundName}
                  onChange={(e) => setRoundName(e.target.value)}
                  placeholder="Ej: Temporada 1, Beta, etc."
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={roundNotes}
                  onChange={(e) => setRoundNotes(e.target.value)}
                  placeholder="Notas sobre esta ronda..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 resize-none"
                />
              </div>

              <button
                onClick={handleCloseRound}
                disabled={isClosing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
              >
                {isClosing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cerrando ronda...
                  </>
                ) : (
                  <>
                    <Award className="w-5 h-5" />
                    Cerrar Ronda y Guardar Hall of Fame
                  </>
                )}
              </button>
            </div>

            {closeResult && (
              <div className={`p-4 rounded-lg ${closeResult.success ? 'bg-emerald-900/30 border border-emerald-700/50' : 'bg-red-900/30 border border-red-700/50'}`}>
                <div className="flex items-start gap-2">
                  {closeResult.success ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <p className={closeResult.success ? 'text-emerald-300' : 'text-red-300'}>
                    {closeResult.message}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Rondas Anteriores
            </h3>

            <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg max-h-[400px] overflow-y-auto">
              {loadingRounds ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : rounds.length === 0 ? (
                <p className="text-center py-8 text-slate-500">
                  No hay rondas cerradas aun
                </p>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {rounds.map((round) => (
                    <div key={round.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-white">{round.name}</span>
                        <span className="text-xs text-slate-400">#{round.round_number}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-1 text-slate-400">
                          <Calendar className="w-4 h-4" />
                          {formatDate(round.ended_at)}
                        </div>
                        <div className="flex items-center gap-1 text-cyan-400">
                          <Users className="w-4 h-4" />
                          {round.total_players} jugadores
                        </div>
                        <div className="flex items-center gap-1 text-emerald-400">
                          <Shield className="w-4 h-4" />
                          {round.total_alliances} alianzas
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlusAdminSection() {
  const [pools, setPools] = useState<{
    id: number;
    expedition_balance: number;
    monthly_balance: number;
    plus_balance: number;
    destruction_balance: number;
    expedition_percent: number;
    monthly_percent: number;
    plus_percent: number;
    destruction_percent: number;
  } | null>(null);
  const [plans, setPlans] = useState<Array<{
    id: number;
    name: string;
    code: string;
    duration_months: number;
    duration_days: number | null;
    price_fxu: number;
    price_usdt: number;
    commission_share_percent: number;
    is_active: boolean;
  }>>([]);
  const [subscriptions, setSubscriptions] = useState<Array<{
    id: string;
    user_id: string;
    username: string;
    plan_name: string;
    expires_at: string;
    total_commissions_received: number;
  }>>([]);
  const [editedPlans, setEditedPlans] = useState<typeof plans>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [editingPercents, setEditingPercents] = useState(false);
  const [editedPercents, setEditedPercents] = useState({
    expedition_percent: 10,
    monthly_percent: 10,
    plus_percent: 10,
    destruction_percent: 50
  });
  const [isSavingPercents, setIsSavingPercents] = useState(false);
  // Precio de mercado en vivo de TUNG, obtenido del servidor via RPC
  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
  const fetchTungPrice = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_live_tung_price_usd');
      if (!error && data != null) {
        const price = typeof data === 'number' ? data : parseFloat(data as string);
        if (!isNaN(price) && price > 0) setTungPriceUsd(price);
      }
    } catch { /* ignore */ }
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [poolsRes, plansRes, subsRes] = await Promise.all([
        supabase.from('jackpot_pools').select('*').single(),
        supabase.from('plus_plans').select('*').order('duration_months'),
        supabase.from('plus_subscriptions')
          .select(`
            id, user_id, expires_at, total_commissions_received,
            profiles!inner(username),
            plus_plans!inner(name)
          `)
          .eq('is_active', true)
          .gte('expires_at', new Date().toISOString())
      ]);

      if (poolsRes.data) {
        setPools(poolsRes.data);
        setEditedPercents({
          expedition_percent: poolsRes.data.expedition_percent || 10,
          monthly_percent: poolsRes.data.monthly_percent || 10,
          plus_percent: poolsRes.data.plus_percent || 10,
          destruction_percent: poolsRes.data.destruction_percent || 50
        });
      }
      if (plansRes.data) {
        setPlans(plansRes.data);
        setEditedPlans(plansRes.data);
      }
      if (subsRes.data) {
        setSubscriptions(subsRes.data.map((s: { id: string; user_id: string; expires_at: string; total_commissions_received: number; profiles: { username: string }; plus_plans: { name: string } }) => ({
          id: s.id,
          user_id: s.user_id,
          username: s.profiles?.username || 'Desconocido',
          plan_name: s.plus_plans?.name || 'Plan',
          expires_at: s.expires_at,
          total_commissions_received: s.total_commissions_received
        })));
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar datos' });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    fetchTungPrice();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSavePlan = async (plan: typeof editedPlans[0]) => {
    const { error } = await supabase.rpc('admin_update_plus_plan', {
      p_plan_code: plan.code,
      p_price_fxu: plan.price_fxu,
      p_price_usdt: plan.price_usdt,
      p_commission_share_percent: plan.commission_share_percent,
      p_is_active: plan.is_active,
      p_duration_days: plan.duration_days
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Plan actualizado' });
      loadData();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDistributeMonthly = async () => {
    setIsDistributing(true);
    const { data, error } = await supabase.rpc('admin_distribute_monthly_pool');

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setMessage({ type: 'success', text: `Distribuido ${data.total_distributed?.toLocaleString()} TUNG a ${data.players_rewarded} jugadores` });
      loadData();
    } else {
      setMessage({ type: 'error', text: data?.error || 'Error desconocido' });
    }
    setIsDistributing(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleDistributeFortressPool = async () => {
    setIsDistributing(true);
    const { data, error } = await supabase.rpc('admin_distribute_fortress_pool');

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setMessage({ type: 'success', text: `Distribuido ${data.total_distributed?.toLocaleString()} TUNG entre ${data.total_recipients} jugadores de ${data.total_alliances} alianza(s).` });
      loadData();
    } else {
      setMessage({ type: 'error', text: data?.error || 'Error desconocido' });
    }
    setIsDistributing(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleDistributeDestruction = async () => {
    setIsDistributing(true);
    const { data, error } = await supabase.rpc('admin_distribute_treasure_pool');

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setMessage({ type: 'success', text: `Distribuido ${data.total_distributed?.toLocaleString()} TUNG entre ${data.total_recipients} jugadores de ${data.total_alliances} alianza(s) con Planeta del Tesoro.` });
      loadData();
    } else {
      setMessage({ type: 'error', text: data?.error || 'Error desconocido' });
    }
    setIsDistributing(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSavePercents = async () => {
    const total = editedPercents.expedition_percent + editedPercents.monthly_percent + 
                  editedPercents.plus_percent + editedPercents.destruction_percent;
    
    if (total !== 100) {
      setMessage({ type: 'error', text: `La suma de los porcentajes debe ser 100% (actualmente ${total}%).` });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    setIsSavingPercents(true);
    const { data, error } = await supabase.rpc('admin_update_pool_percents', {
      p_expedition_percent: editedPercents.expedition_percent,
      p_monthly_percent: editedPercents.monthly_percent,
      p_plus_percent: editedPercents.plus_percent,
      p_destruction_percent: editedPercents.destruction_percent
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setMessage({ type: 'success', text: 'Porcentajes actualizados correctamente' });
      setEditingPercents(false);
      loadData();
      // Disparar evento para actualizar JackpotDisplay en el sidebar
      window.dispatchEvent(new CustomEvent('jackpot-pools-updated'));
    } else {
      setMessage({ type: 'error', text: data?.error || 'Error desconocido' });
    }
    setIsSavingPercents(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Pools del Jackpot</h2>
          </div>
          <div className="flex items-center gap-2">
            {!editingPercents && (
              <button
                onClick={() => setEditingPercents(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
                title="Editar porcentajes"
              >
                <Pencil className="w-4 h-4" />
                Editar %
              </button>
            )}
            <button
              onClick={loadData}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Panel de edición de porcentajes */}
        {editingPercents && (
          <div className="mb-6 p-4 bg-slate-700/50 border border-cyan-600/50 rounded-lg">
            <div className="flex items-center gap-2 mb-4">
              <Pencil className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Editar Porcentajes de Distribución</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              La suma de los 4 porcentajes debe ser exactamente 100%.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm text-blue-400 mb-1">Expediciones</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedPercents.expedition_percent}
                    onChange={(e) => setEditedPercents(prev => ({ ...prev, expedition_percent: Number(e.target.value) }))}
                    className="w-20 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-center"
                  />
                  <span className="text-slate-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-emerald-400 mb-1">TOP 100 (diario)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedPercents.monthly_percent}
                    onChange={(e) => setEditedPercents(prev => ({ ...prev, monthly_percent: Number(e.target.value) }))}
                    className="w-20 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-center"
                  />
                  <span className="text-slate-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-purple-400 mb-1">Fortalezas</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedPercents.plus_percent}
                    onChange={(e) => setEditedPercents(prev => ({ ...prev, plus_percent: Number(e.target.value) }))}
                    className="w-20 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-center"
                  />
                  <span className="text-slate-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-red-400 mb-1">Planeta del Tesoro</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedPercents.destruction_percent}
                    onChange={(e) => setEditedPercents(prev => ({ ...prev, destruction_percent: Number(e.target.value) }))}
                    className="w-20 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-center"
                  />
                  <span className="text-slate-400">%</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-slate-400">Total: </span>
                <span className={`font-bold ${
                  (editedPercents.expedition_percent + editedPercents.monthly_percent + 
                   editedPercents.plus_percent + editedPercents.destruction_percent) === 100 
                    ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {editedPercents.expedition_percent + editedPercents.monthly_percent + 
                   editedPercents.plus_percent + editedPercents.destruction_percent}%
                </span>
                <span className="text-slate-500"> / 100%</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingPercents(false);
                    if (pools) {
                      setEditedPercents({
                        expedition_percent: pools.expedition_percent || 10,
                        monthly_percent: pools.monthly_percent || 10,
                        plus_percent: pools.plus_percent || 10,
                        destruction_percent: pools.destruction_percent || 50
                      });
                    }
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePercents}
                  disabled={isSavingPercents || 
                    (editedPercents.expedition_percent + editedPercents.monthly_percent + 
                     editedPercents.plus_percent + editedPercents.destruction_percent) !== 100}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {isSavingPercents ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50' : 'bg-red-900/30 border border-red-700/50'}`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                {message.text}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 border border-blue-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="w-5 h-5 text-blue-400" />
              <span className="text-slate-400">Pool Expediciones ({pools?.expedition_percent}%)</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">
              {pools?.expedition_balance?.toLocaleString() ?? 0} TUNG
            </p>
            <p className="text-xs text-slate-500 mt-1">Se gana en expediciones</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 border border-emerald-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-emerald-400" />
              <span className="text-slate-400">Pool TOP 100 ({pools?.monthly_percent}%)</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              {pools?.monthly_balance?.toLocaleString() ?? 0} TUNG
            </p>
            <p className="text-xs text-slate-500 mt-1">Repartido diariamente entre el Top 100 del ranking</p>
          </div>

          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/10 border border-purple-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Castle className="w-5 h-5 text-purple-400" />
              <span className="text-slate-400">Pool Fortaleza ({pools?.plus_percent}%)</span>
            </div>
            <p className="text-2xl font-bold text-purple-400">
              {pools?.plus_balance?.toLocaleString() ?? 0} TUNG
            </p>
            <p className="text-xs text-slate-500 mt-1">Repartido entre alianzas con fortaleza</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 border border-emerald-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gem className="w-5 h-5 text-emerald-400" />
              <span className="text-slate-400">Pool Planeta del Tesoro ({pools?.destruction_percent}%)</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              {pools?.destruction_balance?.toLocaleString() ?? 0} TUNG
            </p>
            <p className="text-xs text-slate-500 mt-1">Repartido diariamente entre alianzas con Planeta del Tesoro</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={handleDistributeMonthly}
            disabled={isDistributing || !pools?.monthly_balance}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {isDistributing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Trophy className="w-5 h-5" />
            )}
            Distribuir Pool TOP 100
          </button>

          <button
            onClick={handleDistributeFortressPool}
            disabled={isDistributing || !pools?.plus_balance}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {isDistributing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Castle className="w-5 h-5" />
            )}
            Distribuir Pool Fortaleza
          </button>

          <button
            onClick={handleDistributeDestruction}
            disabled={isDistributing || !pools?.destruction_balance}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {isDistributing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Gem className="w-5 h-5" />
            )}
            Distribuir Pool Planeta del Tesoro
          </button>
        </div>

        <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-slate-400">
            <strong className="text-slate-300">Distribucion del Jackpot:</strong> El fee del mercado P2P se divide automaticamente en 4 pools (la suma es siempre 100%).
            El pool de <strong className="text-blue-400">Expediciones</strong> se gana aleatoriamente en expediciones.
            El pool <strong className="text-emerald-400">TOP 100</strong> se reparte automaticamente cada 24 h (00:15 UTC) de forma exponencial entre los 100 mejores del ranking.
            El pool de <strong className="text-purple-400">Fortalezas</strong> se reparte automaticamente cada 24 h (00:00 UTC) de forma proporcional al numero de fortalezas que controla cada alianza, y la parte de cada alianza se divide entre sus miembros.
            El pool del <strong className="text-emerald-400">Planeta del Tesoro</strong> se reparte automaticamente cada 24 h (00:05 UTC) entre las alianzas que controlan un Planeta del Tesoro, y la parte de cada alianza se divide entre sus miembros.
            Los tres repartos diarios anuncian el resultado en el canal de Telegram.
          </p>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="w-6 h-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">Precios de Planes Plus</h2>
        </div>

        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-6">
          <p className="text-sm text-blue-300">
            <strong>Precio dinamico:</strong> El plan se define en USDT y se cobra en TUNG segun el precio del token en el momento de la compra (DexScreener).
            {' '}Precio TUNG en vivo: <strong>{tungPriceUsd != null ? `$${tungPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 })}` : '…'}</strong>.
            Las comisiones se dividen en partes iguales entre todos los suscriptores activos.
          </p>
        </div>

        <div className="space-y-4">
          {editedPlans.map((plan, idx) => (
            <div key={plan.id} className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Star className={`w-5 h-5 ${plan.is_active ? 'text-yellow-400' : 'text-slate-500'}`} />
                  <span className="font-semibold text-white">{plan.name}</span>
                  <span className="text-xs text-slate-500">({plan.duration_days && plan.duration_days > 0 ? `${plan.duration_days} dias` : `${plan.duration_months} meses`})</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plan.is_active}
                    onChange={(e) => {
                      const updated = [...editedPlans];
                      updated[idx] = { ...plan, is_active: e.target.checked };
                      setEditedPlans(updated);
                    }}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-sm text-slate-400">Activo</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Precio TUNG (legado)</label>
                  <input
                    type="number"
                    value={plan.price_fxu}
                    onChange={(e) => {
                      const updated = [...editedPlans];
                      updated[idx] = { ...plan, price_fxu: Number(e.target.value) };
                      setEditedPlans(updated);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">Campo legado (ya no se usa para cobrar).</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Precio USDT</label>
                  <input
                    type="number"
                    value={plan.price_usdt}
                    onChange={(e) => {
                      const updated = [...editedPlans];
                      updated[idx] = { ...plan, price_usdt: Number(e.target.value) };
                      setEditedPlans(updated);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  />
                  <p className="text-xs text-emerald-400 mt-1">≈ {tungPriceUsd ? Math.ceil(plan.price_usdt / tungPriceUsd).toLocaleString() : '…'} TUNG al precio actual</p>
                </div>
              </div>

              <button
                onClick={() => handleSavePlan(editedPlans[idx])}
                className="mt-3 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Suscriptores Plus Activos ({subscriptions.length})</h2>
        </div>

        {subscriptions.length === 0 ? (
          <p className="text-center py-8 text-slate-500">No hay suscriptores Plus activos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="text-left p-3 text-slate-400 font-medium">Usuario</th>
                  <th className="text-left p-3 text-slate-400 font-medium">Plan</th>
                  <th className="text-right p-3 text-slate-400 font-medium">Expira</th>
                  <th className="text-right p-3 text-slate-400 font-medium">Ganado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-700/30">
                    <td className="p-3 text-white font-medium">{sub.username}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-yellow-600/30 text-yellow-400 rounded text-xs font-medium">
                        {sub.plan_name}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-400">{formatDate(sub.expires_at)}</td>
                    <td className="p-3 text-right text-emerald-400 font-medium">
                      {sub.total_commissions_received.toLocaleString()} TUNG
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MaintenanceAdminSection() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<{
    buildings?: { completed_count: number; activated_count?: number; error_count: number };
    shipyard?: { completed_units: number; error_count: number };
    fleets?: { processed_count: number; error_count: number };
    research?: { completed_count: number; error_count: number };
  } | null>(null);
  const [diagnostics, setDiagnostics] = useState<{
    building_queue: number;
    shipyard_queue: number;
    fleets: number;
    research: number;
  } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const runDiagnostics = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('get_stuck_items_diagnostics');

      if (error) throw error;

      if (data && data.success) {
        setDiagnostics({
          building_queue: data.stuck_buildings || 0,
          shipyard_queue: data.stuck_shipyard || 0,
          fleets: data.stuck_fleets || 0,
          research: data.stuck_research || 0,
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al ejecutar diagnosticos' });
    }

    setIsLoading(false);
  };

  const runFullMaintenance = async () => {
    setIsLoading(true);
    setMessage(null);
    setResults(null);

    try {
      const { data, error } = await supabase.rpc('admin_run_full_maintenance');

      if (error) throw error;

      if (data && data.success) {
        setResults({
          buildings: data.buildings,
          shipyard: data.shipyard,
          fleets: data.fleets,
          research: data.research,
        });
        setMessage({ type: 'success', text: 'Mantenimiento completado exitosamente' });
        await runDiagnostics();
      } else {
        setMessage({ type: 'error', text: data?.error || 'Error desconocido' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al ejecutar mantenimiento' });
    }

    setIsLoading(false);
  };

  const processBuildings = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc('admin_process_stuck_building_queues');
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      setResults(prev => ({ ...prev, buildings: data }));
      setMessage({ type: 'success', text: `Procesadas ${data.completed_count} construcciones` });
    }
    setIsLoading(false);
    await runDiagnostics();
  };

  const processShipyard = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc('admin_process_stuck_shipyard_queues');
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      setResults(prev => ({ ...prev, shipyard: data }));
      setMessage({ type: 'success', text: `Procesadas ${data.completed_units} unidades` });
    }
    setIsLoading(false);
    await runDiagnostics();
  };

  const processFleets = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc('admin_process_stuck_fleets');
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      setResults(prev => ({ ...prev, fleets: data }));
      setMessage({ type: 'success', text: `Procesadas ${data.processed_count} flotas` });
    }
    setIsLoading(false);
    await runDiagnostics();
  };

  const processResearch = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc('admin_process_stuck_research');
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      setResults(prev => ({ ...prev, research: data }));
      setMessage({ type: 'success', text: `Procesadas ${data.completed_count} investigaciones` });
    }
    setIsLoading(false);
    await runDiagnostics();
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Wrench className="w-6 h-6 text-orange-400" />
          <h2 className="text-xl font-bold text-white">Mantenimiento del Sistema</h2>
        </div>

        <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 mb-6">
          <p className="text-amber-300 text-sm">
            Esta seccion permite procesar elementos que puedan haberse quedado atascados en las colas del juego.
            El sistema ahora incluye prevencion automatica, pero en casos excepcionales puede ser necesario
            ejecutar mantenimiento manual.
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' ? 'bg-emerald-900/50 border border-emerald-600' : 'bg-red-900/50 border border-red-600'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={message.type === 'success' ? 'text-emerald-300' : 'text-red-300'}>
                {message.text}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Construcciones</span>
              <Building2 className="w-5 h-5 text-cyan-400" />
            </div>
            <p className={`text-2xl font-bold ${diagnostics?.building_queue ? 'text-red-400' : 'text-emerald-400'}`}>
              {diagnostics?.building_queue ?? '-'}
            </p>
            <p className="text-xs text-slate-500">atascadas</p>
          </div>

          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Astillero</span>
              <Rocket className="w-5 h-5 text-purple-400" />
            </div>
            <p className={`text-2xl font-bold ${diagnostics?.shipyard_queue ? 'text-red-400' : 'text-emerald-400'}`}>
              {diagnostics?.shipyard_queue ?? '-'}
            </p>
            <p className="text-xs text-slate-500">atascadas</p>
          </div>

          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Flotas</span>
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <p className={`text-2xl font-bold ${diagnostics?.fleets ? 'text-red-400' : 'text-emerald-400'}`}>
              {diagnostics?.fleets ?? '-'}
            </p>
            <p className="text-xs text-slate-500">atascadas</p>
          </div>

          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Investigaciones</span>
              <FlaskConical className="w-5 h-5 text-emerald-400" />
            </div>
            <p className={`text-2xl font-bold ${diagnostics?.research ? 'text-red-400' : 'text-emerald-400'}`}>
              {diagnostics?.research ?? '-'}
            </p>
            <p className="text-xs text-slate-500">atascadas</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={runDiagnostics}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar Diagnosticos
          </button>

          <button
            onClick={runFullMaintenance}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Ejecutar Mantenimiento Completo
          </button>
        </div>

        <div className="border-t border-slate-700/50 pt-6">
          <h3 className="text-lg font-semibold text-white mb-4">Procesamiento Individual</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={processBuildings}
              disabled={isLoading}
              className="flex flex-col items-center gap-2 p-4 bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-700/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Building2 className="w-6 h-6 text-cyan-400" />
              <span className="text-white font-medium">Procesar Construcciones</span>
              {results?.buildings && (
                <span className="text-xs text-cyan-300">
                  {results.buildings.completed_count} completadas
                </span>
              )}
            </button>

            <button
              onClick={processShipyard}
              disabled={isLoading}
              className="flex flex-col items-center gap-2 p-4 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Rocket className="w-6 h-6 text-purple-400" />
              <span className="text-white font-medium">Procesar Astillero</span>
              {results?.shipyard && (
                <span className="text-xs text-purple-300">
                  {results.shipyard.completed_units} unidades
                </span>
              )}
            </button>

            <button
              onClick={processFleets}
              disabled={isLoading}
              className="flex flex-col items-center gap-2 p-4 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Zap className="w-6 h-6 text-amber-400" />
              <span className="text-white font-medium">Procesar Flotas</span>
              {results?.fleets && (
                <span className="text-xs text-amber-300">
                  {results.fleets.processed_count} procesadas
                </span>
              )}
            </button>

            <button
              onClick={processResearch}
              disabled={isLoading}
              className="flex flex-col items-center gap-2 p-4 bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-700/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <FlaskConical className="w-6 h-6 text-emerald-400" />
              <span className="text-white font-medium">Procesar Investigaciones</span>
              {results?.research && (
                <span className="text-xs text-emerald-300">
                  {results.research.completed_count} completadas
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DatabaseRestoreSection() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sqlContent, setSqlContent] = useState<string>('');
  const [isValidating, setIsValidating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    statementCount: number;
    preview: string[];
  } | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    totalStatements: number;
    successCount: number;
    errorCount: number;
    results: Array<{ statement: string; success: boolean; error?: string; rowCount?: number }>;
  } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.sql')) {
      setMessage({ type: 'error', text: 'Solo se permiten archivos .sql' });
      return;
    }

    setSelectedFile(file);
    setValidationResult(null);
    setRestoreResult(null);
    setMessage(null);

    try {
      const content = await file.text();
      setSqlContent(content);
    } catch {
      setMessage({ type: 'error', text: 'Error al leer el archivo' });
    }
  };

  const handleValidate = async () => {
    if (!sqlContent) return;

    setIsValidating(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/restore-database`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sqlContent, mode: 'validate' }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Error de validacion' });
      } else {
        setValidationResult({
          statementCount: result.statementCount,
          preview: result.preview,
        });
        setMessage({ type: 'success', text: `Archivo validado: ${result.statementCount} sentencias SQL encontradas` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al validar' });
    }

    setIsValidating(false);
  };

  const handleRestore = async () => {
    if (!sqlContent || !validationResult) return;

    const confirmed = window.confirm(
      `ADVERTENCIA: Esto ejecutara ${validationResult.statementCount} sentencias SQL en la base de datos.\n\n` +
      `Esta accion puede modificar o sobrescribir datos existentes.\n\n` +
      `Estas seguro de continuar?`
    );

    if (!confirmed) return;

    setIsRestoring(true);
    setMessage(null);
    setRestoreResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/restore-database`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sqlContent, mode: 'execute' }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Error al restaurar' });
      } else {
        setRestoreResult({
          totalStatements: result.totalStatements,
          successCount: result.successCount,
          errorCount: result.errorCount,
          results: result.results,
        });

        if (result.errorCount === 0) {
          setMessage({ type: 'success', text: `Restauracion completada: ${result.successCount} sentencias ejecutadas exitosamente` });
        } else {
          setMessage({ type: 'error', text: `Restauracion parcial: ${result.successCount} exitosas, ${result.errorCount} errores` });
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al restaurar' });
    }

    setIsRestoring(false);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setSqlContent('');
    setValidationResult(null);
    setRestoreResult(null);
    setMessage(null);
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Database className="w-6 h-6 text-blue-400" />
        <h2 className="text-xl font-bold text-white">Restaurar Base de Datos</h2>
      </div>

      <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-medium mb-1">Advertencia: Operacion de Alto Riesgo</p>
            <p className="text-red-300/80 text-sm">
              Esta funcionalidad permite ejecutar sentencias SQL directamente en la base de datos.
              Asegurate de tener un backup reciente antes de proceder. Los cambios pueden ser irreversibles.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg mb-6 ${
          message.type === 'success' ? 'bg-emerald-900/50 border border-emerald-600' : 'bg-red-900/50 border border-red-600'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <span className={message.type === 'success' ? 'text-emerald-300' : 'text-red-300'}>
              {message.text}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Seleccionar archivo SQL de backup
          </label>
          <div className="flex items-center gap-4">
            <label className="flex-1">
              <div className="flex items-center justify-center gap-3 px-6 py-8 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-700/30 transition-colors">
                <Upload className="w-8 h-8 text-slate-400" />
                <div className="text-center">
                  <p className="text-white font-medium">
                    {selectedFile ? selectedFile.name : 'Haz clic para seleccionar archivo'}
                  </p>
                  <p className="text-sm text-slate-400">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(2)} KB`
                      : 'Archivos .sql unicamente'
                    }
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept=".sql"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            {selectedFile && (
              <button
                onClick={clearSelection}
                className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {sqlContent && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Vista previa del contenido ({sqlContent.length.toLocaleString()} caracteres)
            </label>
            <div className="bg-slate-900/50 rounded-lg p-4 max-h-48 overflow-auto font-mono text-xs text-slate-400">
              {sqlContent.substring(0, 2000)}
              {sqlContent.length > 2000 && '...'}
            </div>
          </div>
        )}

        {validationResult && (
          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-blue-400" />
              <span className="text-white font-medium">Resultado de Validacion</span>
            </div>
            <p className="text-slate-300 mb-3">
              Se encontraron <span className="text-blue-400 font-bold">{validationResult.statementCount}</span> sentencias SQL
            </p>
            <div className="space-y-1">
              <p className="text-sm text-slate-400">Primeras sentencias:</p>
              {validationResult.preview.map((stmt, i) => (
                <div key={i} className="bg-slate-800/50 rounded px-2 py-1 text-xs font-mono text-slate-400 truncate">
                  {stmt}
                </div>
              ))}
            </div>
          </div>
        )}

        {restoreResult && (
          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-5 h-5 text-blue-400" />
              <span className="text-white font-medium">Resultado de Restauracion</span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{restoreResult.totalStatements}</p>
                <p className="text-xs text-slate-400">Total</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{restoreResult.successCount}</p>
                <p className="text-xs text-slate-400">Exitosas</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{restoreResult.errorCount}</p>
                <p className="text-xs text-slate-400">Errores</p>
              </div>
            </div>
            {restoreResult.results.some(r => !r.success) && (
              <div className="space-y-1">
                <p className="text-sm text-red-400">Errores encontrados:</p>
                <div className="max-h-32 overflow-auto space-y-1">
                  {restoreResult.results.filter(r => !r.success).map((r, i) => (
                    <div key={i} className="bg-red-900/20 border border-red-700/30 rounded px-2 py-1 text-xs">
                      <p className="font-mono text-red-300 truncate">{r.statement}</p>
                      <p className="text-red-400">{r.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleValidate}
            disabled={!sqlContent || isValidating || isRestoring}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Validar Archivo
          </button>

          <button
            onClick={handleRestore}
            disabled={!validationResult || isValidating || isRestoring}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRestoring ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Ejecutar Restauracion
          </button>
        </div>
      </div>
    </div>
  );
}

function TwitterAdminSection() {
  const [pendingActions, setPendingActions] = useState<Array<{
    action_id: string;
    user_id: string;
    username: string;
    twitter_username: string | null;
    mission_id: string;
    mission_tweet_url: string;
    action_type: string;
    user_tweet_url: string;
    points_awarded: number;
    created_at: string;
  }>>([]);
  const [validatedCount, setValidatedCount] = useState<number | null>(null);
  const [missionsCount, setMissionsCount] = useState<number | null>(null);
  const [linkedCount, setLinkedCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncingMissions, setSyncingMissions] = useState(false);
  const [batchApproving, setBatchApproving] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load pending actions via RPC (SECURITY DEFINER, no RLS issues)
      const { data: pending, error: pendingErr } = await supabase.rpc('admin_get_pending_twitter_actions');
      if (pendingErr) {
        console.error('Error loading pending actions:', pendingErr);
        setPendingActions([]);
      } else {
        setPendingActions(pending || []);
      }

      // Load other stats
      const [validatedRes, missionsRes, linkedRes] = await Promise.all([
        supabase.from('twitter_actions').select('id', { count: 'exact', head: true }).eq('validated', true),
        supabase.from('twitter_missions').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('twitter_links').select('id', { count: 'exact', head: true }),
      ]);
      setValidatedCount(validatedRes.count ?? 0);
      setMissionsCount(missionsRes.count ?? 0);
      setLinkedCount(linkedRes.count ?? 0);
    } catch (err) {
      console.error('Error loading twitter data:', err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveAction = async (actionId: string) => {
    setProcessingAction(actionId);
    try {
      // Calls Twitter API v2 from SQL to verify the tweet is real
      const { data, error } = await supabase.rpc('admin_validate_twitter_action_api', { p_action_id: actionId });
      if (error) {
        setMessage({ type: 'error', text: `Error: ${error.message}` });
      } else if (data?.success && !data?.already_validated) {
        setMessage({ type: 'success', text: data.message || `✅ Verificado via Twitter API (+${data.points} pts)` });
        setPendingActions(prev => prev.filter(a => a.action_id !== actionId));
        setValidatedCount(prev => (prev ?? 0) + 1);
      } else if (data?.already_validated) {
        setMessage({ type: 'success', text: 'Ya estaba validada' });
        setPendingActions(prev => prev.filter(a => a.action_id !== actionId));
      } else {
        setMessage({ type: 'error', text: `❌ Rechazado por Twitter API: ${data?.error || 'Error desconocido'}` });
      }
    } catch (err) {
      console.error('Error validating action:', err);
      setMessage({ type: 'error', text: 'Error de conexion' });
    }
    setProcessingAction(null);
  };

  const handleRejectAction = async (actionId: string) => {
    if (!confirm('¿Rechazar esta accion? El jugador podra reenviarla.')) return;
    setProcessingAction(actionId);
    try {
      const { data, error } = await supabase.rpc('admin_reject_twitter_action', { p_action_id: actionId });
      if (error) {
        setMessage({ type: 'error', text: `Error: ${error.message}` });
      } else if (data?.success) {
        setMessage({ type: 'success', text: `Accion de ${data.username} rechazada` });
        setPendingActions(prev => prev.filter(a => a.action_id !== actionId));
      } else {
        setMessage({ type: 'error', text: data?.error || 'Error al rechazar' });
      }
    } catch (err) {
      console.error('Error rejecting action:', err);
      setMessage({ type: 'error', text: 'Error de conexion' });
    }
    setProcessingAction(null);
  };

  const handleManualApprove = async (actionId: string) => {
    if (!confirm('¿Aprobar manualmente esta accion SIN verificar con Twitter API?\n\nSe daran los puntos directamente.')) return;
    setProcessingAction(actionId);
    try {
      const { data, error } = await supabase.rpc('admin_manual_approve_twitter_action', { p_action_id: actionId });
      if (error) {
        setMessage({ type: 'error', text: `Error: ${error.message}` });
      } else if (data?.success) {
        setMessage({ type: 'success', text: `✅ Aprobado manualmente: ${data.username} (+${data.points} pts)` });
        setPendingActions(prev => prev.filter(a => a.action_id !== actionId));
        setValidatedCount(prev => (prev ?? 0) + 1);
      } else if (data?.already_validated) {
        setMessage({ type: 'success', text: 'Ya estaba aprobada' });
        setPendingActions(prev => prev.filter(a => a.action_id !== actionId));
      } else {
        setMessage({ type: 'error', text: data?.error || 'Error al aprobar' });
      }
    } catch (err) {
      console.error('Error manual approve:', err);
      setMessage({ type: 'error', text: 'Error de conexion' });
    }
    setProcessingAction(null);
  };

  const handleBatchApproveAll = async () => {
    if (!confirm(`¿Validar las ${pendingActions.length} acciones contra la API de Twitter?\n\nSe verificara cada una individualmente.`)) return;
    setBatchApproving(true);
    setMessage(null);

    let validated = 0;
    let failed = 0;
    const errors: string[] = [];
    const actionsToProcess = [...pendingActions];

    for (let i = 0; i < actionsToProcess.length; i++) {
      const action = actionsToProcess[i];
      setMessage({ type: 'success', text: `🔍 Verificando ${i + 1}/${actionsToProcess.length}: ${action.username}...` });

      try {
        const { data, error } = await supabase.rpc('admin_validate_twitter_action_api', { p_action_id: action.action_id });

        if (error) {
          failed++;
          errors.push(`${action.username}: ${error.message}`);
        } else if (data?.rate_limited) {
          errors.push(`⚠️ Rate limit en accion ${i + 1}. Batch detenido.`);
          failed += (actionsToProcess.length - i);
          break;
        } else if (data?.success) {
          validated++;
          setPendingActions(prev => prev.filter(a => a.action_id !== action.action_id));
        } else {
          failed++;
          errors.push(`${action.username}: ${data?.error || 'Error'}`);
        }
      } catch (err) {
        failed++;
        errors.push(`${action.username}: Error de conexion`);
      }

      // Small delay between API calls to avoid rate limits
      if (i < actionsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    setValidatedCount(prev => (prev ?? 0) + validated);
    const resultMsg = `✅ ${validated} verificadas, ❌ ${failed} fallidas de ${actionsToProcess.length}`;
    setMessage({
      type: failed > 0 ? 'error' : 'success',
      text: errors.length > 0 ? `${resultMsg} | ${errors.join(' | ')}` : resultMsg,
    });
    setBatchApproving(false);
  };

  const handleSyncMissions = async () => {
    setSyncingMissions(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessage({ type: 'error', text: 'No hay sesion activa' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-twitter-missions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        }
      );

      const data = await response.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: data.new_missions > 0
            ? `${data.new_missions} mision(es) nueva(s) encontrada(s)`
            : 'No hay misiones nuevas',
        });
        await loadData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al sincronizar' });
      }
    } catch (err) {
      console.error('Error syncing missions:', err);
      setMessage({ type: 'error', text: 'Error de conexion' });
    } finally {
      setSyncingMissions(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Twitter className="w-6 h-6 text-sky-400" />
            <h2 className="text-xl font-bold text-white">Twitter/X - Tareas Sociales</h2>
          </div>
          <button
            onClick={loadData}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-emerald-900/30 border border-emerald-700/50'
              : 'bg-red-900/30 border border-red-700/50'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                {message.text}
              </span>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-sky-900/20 border border-sky-700/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-sky-400">{linkedCount ?? 0}</div>
            <div className="text-xs text-sky-300">Cuentas vinculadas</div>
          </div>
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{missionsCount ?? 0}</div>
            <div className="text-xs text-blue-300">Misiones activas</div>
          </div>
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{pendingActions.length}</div>
            <div className="text-xs text-amber-300">Acciones pendientes</div>
          </div>
          <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{validatedCount ?? 0}</div>
            <div className="text-xs text-emerald-300">Acciones validadas</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={handleBatchApproveAll}
            disabled={batchApproving || pendingActions.length === 0}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {batchApproving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            <div className="text-left">
              <div>{batchApproving ? 'Verificando con Twitter API...' : 'Verificar Todas con Twitter API'}</div>
              <div className="text-xs font-normal opacity-80">
                {pendingActions.length} acciones - verifica cada tweet via API
              </div>
            </div>
          </button>

          <button
            onClick={handleSyncMissions}
            disabled={syncingMissions}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {syncingMissions ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            <div className="text-left">
              <div>{syncingMissions ? 'Buscando tweets...' : 'Sincronizar Misiones'}</div>
              <div className="text-xs font-normal opacity-80">
                Busca nuevos tweets de @FalcoX_universe
              </div>
            </div>
          </button>
        </div>

        {/* Pending Actions List */}
        {pendingActions.length > 0 && (
          <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Acciones Pendientes de Revision ({pendingActions.length})
            </h3>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {pendingActions.map((action) => (
                <div
                  key={action.action_id}
                  className="bg-slate-800/70 border border-slate-600/30 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white">{action.username}</span>
                      {action.twitter_username && (
                        <span className="text-xs text-sky-400">@{action.twitter_username}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        action.action_type === 'quote_tweet'
                          ? 'bg-blue-900/50 text-blue-300'
                          : 'bg-purple-900/50 text-purple-300'
                      }`}>
                        {action.action_type === 'quote_tweet' ? 'Quote Tweet' : 'Comentario'}
                      </span>
                      <span className="text-xs text-amber-400 font-semibold">+{action.points_awarded} pts</span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Tweet del jugador:</span>
                        <a
                          href={action.user_tweet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:text-sky-300 underline truncate max-w-xs"
                        >
                          {action.user_tweet_url}
                        </a>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Tweet de mision:</span>
                        <a
                          href={action.mission_tweet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline truncate max-w-xs"
                        >
                          {action.mission_tweet_url}
                        </a>
                      </div>
                      <span className="text-slate-600">
                        {formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleApproveAction(action.action_id)}
                      disabled={processingAction === action.action_id}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                      title="Verificar contra Twitter API"
                    >
                      {processingAction === action.action_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Verificar
                    </button>
                    <button
                      onClick={() => handleManualApprove(action.action_id)}
                      disabled={processingAction === action.action_id}
                      className="flex items-center gap-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                      title="Aprobar manualmente sin API"
                    >
                      {processingAction === action.action_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Aprobar
                    </button>
                    <button
                      onClick={() => handleRejectAction(action.action_id)}
                      disabled={processingAction === action.action_id}
                      className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                      title="Rechazar accion"
                    >
                      <XCircle className="w-4 h-4" />
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingActions.length === 0 && (
          <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-slate-300">No hay acciones pendientes de revision</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface InactiveAccount {
  user_id: string;
  username: string;
  email: string;
  created_at: string;
  last_activity: string | null;
  days_inactive: number;
  hours_played: number;
  category: 'never_played' | 'inactive' | 'abandoned' | 'lost' | 'ai_playing';
  points_buildings: number;
  points_total: number;
  ranking_position: number;
  planet_count: number;
  has_alliance: boolean;
  fxu_balance: number;
  usdt_balance: number;
  autopilot_active: boolean;
  autopilot_eligible: boolean;
  total_count: number;
}

interface InactiveSummary {
  ai_playing: number;
  never_played: number;
  inactive: number;
  abandoned: number;
  lost: number;
}

function InactiveAccountsAdminSection() {
  const [summary, setSummary] = useState<InactiveSummary | null>(null);
  const [accounts, setAccounts] = useState<InactiveAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'never_played' | 'inactive' | 'abandoned' | 'lost' | 'ai_playing'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sortBy, setSortBy] = useState<'days_inactive' | 'ranking_position' | 'points_total'>('days_inactive');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 100;
  const [deletionLog, setDeletionLog] = useState<Array<{
    deleted_username: string;
    deletion_category: string;
    days_inactive: number;
    deleted_at: string;
  }>>([]);
  const [autopilotBusy, setAutopilotBusy] = useState<Set<string>>(new Set());
  const [isActivatingZero, setIsActivatingZero] = useState(false);

  const loadSummary = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc('admin_get_inactive_accounts_summary');

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setSummary(data.summary);
    }
    setIsLoading(false);
  };

  const loadAccounts = async () => {
    setIsLoading(true);
    setSelectedAccounts(new Set());

    const { data, error } = await supabase.rpc('admin_get_inactive_accounts_detailed', {
      p_category: selectedCategory,
      p_search: debouncedSearch.trim() || null,
      p_sort_by: sortBy,
      p_sort_order: sortOrder,
      p_limit: pageSize,
      p_offset: (currentPage - 1) * pageSize
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
      setAccounts([]);
      setTotalCount(0);
    } else {
      setAccounts(data || []);
      setTotalCount(data?.[0]?.total_count || 0);
    }
    setIsLoading(false);
  };

  const loadDeletionLog = async () => {
    const { data } = await supabase
      .from('admin_account_deletions')
      .select('deleted_username, deletion_category, days_inactive, deleted_at')
      .order('deleted_at', { ascending: false })
      .limit(50);

    if (data) {
      setDeletionLog(data);
    }
  };

  useEffect(() => {
    loadSummary();
    loadDeletionLog();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadAccounts();
  }, [selectedCategory, debouncedSearch, sortBy, sortOrder, currentPage]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSelectAll = () => {
    if (selectedAccounts.size === accounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(accounts.map(a => a.user_id)));
    }
  };

  const handleToggleSelect = (userId: string) => {
    const newSelected = new Set(selectedAccounts);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedAccounts(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedAccounts.size === 0) return;

    const confirmed = window.confirm(
      `ATENCION: Vas a eliminar ${selectedAccounts.size} cuenta(s) de forma PERMANENTE.\n\n` +
      `Esta accion eliminara:\n` +
      `- Planetas y todos sus recursos\n` +
      `- Naves y defensas\n` +
      `- Tecnologias\n` +
      `- Mensajes\n` +
      `- Wallet y transacciones\n\n` +
      `Esta accion NO se puede deshacer. Continuar?`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setMessage(null);

    const userIds = Array.from(selectedAccounts);
    let deletedCount = 0;
    let failedCount = 0;

    for (const userId of userIds) {
      const { data, error } = await supabase.rpc('admin_purge_inactive_account', {
        p_user_id: userId
      });

      if (error || !data?.success) {
        failedCount++;
      } else {
        deletedCount++;
      }
    }

    setMessage({
      type: failedCount === 0 ? 'success' : 'error',
      text: `${deletedCount} cuenta(s) eliminada(s)${failedCount > 0 ? `, ${failedCount} fallaron` : ''}`
    });

    setSelectedAccounts(new Set());
    loadSummary();
    loadAccounts();
    loadDeletionLog();
    setIsDeleting(false);

    setTimeout(() => setMessage(null), 5000);
  };

  const handleDeleteSingle = async (userId: string, username: string) => {
    const confirmed = window.confirm(
      `Eliminar la cuenta "${username}" de forma permanente?\n\n` +
      `Esta accion NO se puede deshacer.`
    );

    if (!confirmed) return;

    setIsDeleting(true);

    const { data, error } = await supabase.rpc('admin_purge_inactive_account', {
      p_user_id: userId
    });

    if (error || !data?.success) {
      setMessage({ type: 'error', text: error?.message || data?.error || 'Error al eliminar' });
    } else {
      setMessage({ type: 'success', text: `Cuenta "${username}" eliminada` });
      loadSummary();
      loadAccounts();
      loadDeletionLog();
    }

    setIsDeleting(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggleAccountAutopilot = async (userId: string, username: string, enable: boolean) => {
    setAutopilotBusy(prev => new Set(prev).add(userId));
    try {
      const { data, error } = await supabase.rpc('admin_set_account_autopilot', {
        p_user_id: userId,
        p_enabled: enable,
      });
      const result = data as { success: boolean; error?: string } | null;
      if (error || !result?.success) {
        setMessage({ type: 'error', text: error?.message || result?.error || 'Error al cambiar piloto' });
      } else {
        setAccounts(prev => prev.map(a =>
          a.user_id === userId
            ? { ...a, autopilot_active: enable, autopilot_eligible: enable }
            : a
        ));
        setMessage({
          type: 'success',
          text: `Piloto automatico ${enable ? 'activado' : 'desactivado'} para "${username}"`,
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al cambiar piloto' });
    } finally {
      setAutopilotBusy(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleActivateZeroPoints = async () => {
    const confirmed = window.confirm(
      'Activar el piloto automatico para TODAS las cuentas con 0 puntos en el ranking?\n\n' +
      'Estas cuentas empezaran a jugar automaticamente (como jugadores). Puedes desactivarlas individualmente despues.'
    );
    if (!confirmed) return;

    setIsActivatingZero(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_activate_autopilot_zero_points');
      const result = data as { success: boolean; activated?: number; error?: string } | null;
      if (error || !result?.success) {
        setMessage({ type: 'error', text: error?.message || result?.error || 'Error al activar piloto' });
      } else {
        setMessage({ type: 'success', text: `Piloto activado en ${result.activated ?? 0} cuenta(s) con 0 puntos` });
        loadAccounts();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al activar piloto' });
    } finally {
      setIsActivatingZero(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'ai_playing':
        return <span className="px-2 py-0.5 bg-purple-600/30 text-purple-300 rounded text-xs">Jugando (IA)</span>;
      case 'never_played':
        return <span className="px-2 py-0.5 bg-red-600/30 text-red-400 rounded text-xs">Nunca jugo</span>;
      case 'inactive':
        return <span className="px-2 py-0.5 bg-orange-600/30 text-orange-400 rounded text-xs">Inactiva (7-13d)</span>;
      case 'first_day_only':
        return <span className="px-2 py-0.5 bg-orange-600/30 text-orange-400 rounded text-xs">Solo 1er dia</span>;
      case 'abandoned':
        return <span className="px-2 py-0.5 bg-yellow-600/30 text-yellow-400 rounded text-xs">Abandonada (14-29d)</span>;
      case 'lost':
        return <span className="px-2 py-0.5 bg-red-700/30 text-red-300 rounded text-xs">Perdida (30d+)</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-600/30 text-slate-400 rounded text-xs">{cat}</span>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };

  // Fecha exacta legible (para tooltips): "23 jun 2026, 00:29"
  const formatExact = (dateStr: string | null) => {
    if (!dateStr) return 'nunca';
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // Fecha corta visible en la celda: "23 jun"
  const formatShort = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success'
            ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300'
            : 'bg-red-900/30 border border-red-700/50 text-red-300'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-bold text-white">Cuentas Inactivas</h2>
          </div>
          <button
            onClick={() => { loadSummary(); loadAccounts(); }}
            disabled={isLoading}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{summary.never_played}</div>
              <div className="text-xs text-red-300">Nunca jugaron</div>
            </div>
            <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">{summary.inactive}</div>
              <div className="text-xs text-orange-300">Inactivas (7-13d)</div>
            </div>
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{summary.abandoned}</div>
              <div className="text-xs text-yellow-300">Abandonadas (14-29d)</div>
            </div>
            <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-300">{summary.lost}</div>
              <div className="text-xs text-red-400">Perdidas (30d+)</div>
            </div>
            <div className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-300">{summary.ai_playing}</div>
              <div className="text-xs text-purple-300">Jugando (IA)</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-4 p-4 bg-slate-700/30 rounded-lg">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Categoria</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as typeof selectedCategory)}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value="all">Todas</option>
              <option value="never_played">Nunca jugaron</option>
              <option value="inactive">Inactivas (7-13d)</option>
              <option value="abandoned">Abandonadas (14-29d)</option>
              <option value="lost">Perdidas (30d+)</option>
              <option value="ai_playing">Jugando (IA)</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1">Buscar usuario</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nombre o email..."
                className="w-full bg-slate-700 border border-slate-600 rounded pl-9 pr-8 py-2 text-white text-sm placeholder-slate-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  title="Limpiar busqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ordenar por</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value="days_inactive">Dias inactivo</option>
              <option value="ranking_position">Ranking</option>
              <option value="points_total">Puntos</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Orden</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </select>
          </div>
          <div className="flex-1" />
          <div className="text-sm text-slate-400">
            Total: {(totalCount ?? 0).toLocaleString()} cuentas
          </div>
          <button
            onClick={handleActivateZeroPoints}
            disabled={isActivatingZero}
            title="Activa el piloto automatico en todas las cuentas con 0 puntos para que jueguen solas"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isActivatingZero ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
            Activar piloto (0 puntos)
          </button>
          {selectedAccounts.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Eliminar {selectedAccounts.size} seleccionadas
            </button>
          )}
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-300">
            <strong>Criterios de deteccion (por dias sin conectarse):</strong><br />
            - <strong>Nunca jugaron:</strong> Se registraron hace mas de 1 dia pero tienen 0 puntos (nunca hicieron progreso)<br />
            - <strong>Inactiva (7-13d):</strong> Llevan entre 7 y 13 dias sin conectarse<br />
            - <strong>Abandonada (14-29d):</strong> Llevan entre 14 y 29 dias sin conectarse<br />
            - <strong>Perdida (30d+):</strong> Llevan 30 dias o mas sin conectarse<br />
            - <strong>Jugando (IA):</strong> El piloto automatico las esta jugando; ningun humano entra (por eso los "dias inactivo" siguen subiendo aunque generen puntos)<br />
            <span className="text-blue-400/80">La categoria depende SOLO de los "dias inactivo" (dias desde la ultima conexion humana), no de cuanto jugaron. "Tiempo activo" = lapso entre el registro y la ultima conexion humana (dato informativo, la IA no cuenta como conexion).</span><br />
            <span className="text-blue-400/80">En "Nunca jugaron" los "dias inactivo" se cuentan desde el REGISTRO (nunca se reconectaron). Pasa el mouse sobre "Dias inactivo" o "Tiempo activo" para ver las fechas EXACTAS de registro y ultima conexion.</span><br />
            <span className="text-purple-300">Las filas moradas con la etiqueta <strong>IA</strong> son cuentas manejadas por el piloto automatico: ningun humano ha entrado a jugar (por eso 0h de tiempo activo aunque tengan puntos, ya que el bot los genero).</span>
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No hay cuentas inactivas con estos criterios
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="p-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedAccounts.size === accounts.length && accounts.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500"
                      />
                    </th>
                    <th
                      className="text-center p-3 font-medium cursor-pointer hover:bg-slate-600/50 transition-colors"
                      onClick={() => {
                        if (sortBy === 'ranking_position') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('ranking_position');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <span className={sortBy === 'ranking_position' ? 'text-cyan-400' : 'text-slate-400'}>
                        # {sortBy === 'ranking_position' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </span>
                    </th>
                    <th className="text-left p-3 text-slate-400 font-medium">Usuario</th>
                    <th className="text-left p-3 text-slate-400 font-medium">Categoria</th>
                    <th
                      className="text-right p-3 font-medium cursor-pointer hover:bg-slate-600/50 transition-colors"
                      onClick={() => {
                        if (sortBy === 'days_inactive') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('days_inactive');
                          setSortOrder('desc');
                        }
                      }}
                    >
                      <span className={sortBy === 'days_inactive' ? 'text-cyan-400' : 'text-slate-400'}>
                        Dias inactivo {sortBy === 'days_inactive' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </span>
                    </th>
                    <th className="text-right p-3 text-slate-400 font-medium" title="Tiempo entre el registro y la ultima conexion (no son horas reales de juego)">Tiempo activo</th>
                    <th
                      className="text-right p-3 font-medium cursor-pointer hover:bg-slate-600/50 transition-colors"
                      onClick={() => {
                        if (sortBy === 'points_total') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('points_total');
                          setSortOrder('desc');
                        }
                      }}
                    >
                      <span className={sortBy === 'points_total' ? 'text-cyan-400' : 'text-slate-400'}>
                        Puntos {sortBy === 'points_total' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </span>
                    </th>
                    <th className="text-right p-3 text-slate-400 font-medium">TUNG</th>
                    <th className="text-center p-3 text-slate-400 font-medium">Piloto</th>
                    <th className="text-center p-3 text-slate-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {accounts.map((account) => (
                    <tr key={account.user_id} className={`hover:bg-slate-700/30 ${account.autopilot_active ? 'bg-purple-900/20 border-l-2 border-purple-500' : ''} ${selectedAccounts.has(account.user_id) ? 'bg-slate-700/20' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedAccounts.has(account.user_id)}
                          onChange={() => handleToggleSelect(account.user_id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-1 bg-slate-600/50 text-cyan-400 rounded text-xs font-medium">
                          {account.ranking_position}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="text-white font-medium flex items-center gap-2">
                          {account.username}
                          {account.autopilot_active && (
                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded text-[10px] font-semibold inline-flex items-center gap-1" title="Cuenta controlada por la IA (piloto automatico). Ningun humano ha jugado; los puntos los genero el bot.">
                              <Bot className="w-3 h-3" /> IA
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{account.email}</div>
                      </td>
                      <td className="p-3">{getCategoryBadge(account.autopilot_active ? 'ai_playing' : account.category)}</td>
                      <td
                        className="p-3 text-right"
                        title={`Registrado: ${formatExact(account.created_at)}\nUltima conexion humana: ${formatExact(account.last_activity)}`}
                      >
                        <div className="text-red-400 font-medium">{Number(account.days_inactive ?? 0)}d</div>
                        <div className="text-[10px] text-slate-500 whitespace-nowrap">
                          {account.category === 'never_played'
                            ? `reg. ${formatShort(account.created_at)}`
                            : `ult. ${formatShort(account.last_activity ?? account.created_at)}`}
                        </div>
                      </td>
                      <td className="p-3 text-right text-slate-400" title={`Registrado: ${formatExact(account.created_at)}\nUltima conexion: ${formatExact(account.last_activity)}\n(Tiempo activo = lapso entre ambos, no son horas reales de juego)`}>
                        {Number(account.hours_played ?? 0) >= 48
                          ? `${(Number(account.hours_played ?? 0) / 24).toFixed(1)}d`
                          : `${Number(account.hours_played ?? 0).toFixed(1)}h`}
                      </td>
                      <td className="p-3 text-right text-slate-400">{Number(account.points_total ?? 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-amber-400">{Number(account.fxu_balance ?? 0).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleAccountAutopilot(account.user_id, account.username, !account.autopilot_active)}
                          disabled={autopilotBusy.has(account.user_id)}
                          title={account.autopilot_active ? 'Piloto activo: click para desactivar' : 'Piloto inactivo: click para activar'}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${account.autopilot_active ? 'bg-emerald-500' : 'bg-slate-600'}`}
                        >
                          {autopilotBusy.has(account.user_id) ? (
                            <Loader2 className="w-3 h-3 animate-spin text-white absolute left-1/2 -translate-x-1/2" />
                          ) : (
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${account.autopilot_active ? 'translate-x-6' : 'translate-x-1'}`} />
                          )}
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteSingle(account.user_id, account.username)}
                          disabled={isDeleting}
                          className="p-1.5 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded transition-colors disabled:opacity-50"
                          title="Eliminar cuenta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                <div className="text-sm text-slate-400">
                  Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} de {totalCount}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Primera
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="px-3 py-1.5 bg-cyan-600/20 text-cyan-400 rounded text-sm">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Ultima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-white">Historial de Eliminaciones</h3>
        </div>

        {deletionLog.length === 0 ? (
          <p className="text-center py-4 text-slate-500">No hay eliminaciones registradas</p>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-slate-400">Usuario</th>
                  <th className="text-left p-2 text-slate-400">Categoria</th>
                  <th className="text-right p-2 text-slate-400">Dias inactivo</th>
                  <th className="text-right p-2 text-slate-400">Eliminado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {deletionLog.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/30">
                    <td className="p-2 text-white">{log.deleted_username}</td>
                    <td className="p-2">{getCategoryBadge(log.deletion_category)}</td>
                    <td className="p-2 text-right text-slate-400">{log.days_inactive}d</td>
                    <td className="p-2 text-right text-slate-500 text-xs">{formatDate(log.deleted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// LOTTERY ADMIN SECTION
// =====================================================
function LotteryAdminSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [ticketCost, setTicketCost] = useState(50);
  const [maxTickets, setMaxTickets] = useState(10);
  const [prizePoolPct, setPrizePoolPct] = useState(70);
  const [adminPct, setAdminPct] = useState(20);
  const [rewardPoolPct, setRewardPoolPct] = useState(10);
  const [prize3Match, setPrize3Match] = useState(500);
  const [prize2Match, setPrize2Match] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const [ticketCostUsd, setTicketCostUsd] = useState(0);
  const [prize3MatchUsd, setPrize3MatchUsd] = useState(0);
  const [prize2MatchUsd, setPrize2MatchUsd] = useState(0);
  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
  const [poolAdd, setPoolAdd] = useState(0);
  const [addingPool, setAddingPool] = useState(false);
  const [adminBalance, setAdminBalance] = useState<number | null>(null);
  const [activeDraw, setActiveDraw] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  // USD -> TUNG al precio vivo. Misma formula que el helper SQL lottery_price_tung().
  const usdMode = ticketCostUsd > 0 && tungPriceUsd != null && tungPriceUsd > 0;
  const toTung = (usd: number, fallback: number) =>
    usd > 0 && tungPriceUsd != null && tungPriceUsd > 0
      ? Math.max(1, Math.ceil(usd / tungPriceUsd))
      : fallback;
  const effectiveTicketCost = toTung(ticketCostUsd, ticketCost);
  const effectivePrize3 = toTung(prize3MatchUsd, prize3Match);
  const effectivePrize2 = toTung(prize2MatchUsd, prize2Match);

  const loadSettings = async () => {
    try {
      const { data: settings } = await supabase
        .from('game_settings')
        .select('key, value')
        .in('key', [
          'lottery_ticket_cost', 'lottery_max_tickets', 'lottery_prize_pool_pct',
          'lottery_admin_pct', 'lottery_reward_pool_pct', 'lottery_3match_prize',
          'lottery_2match_prize', 'lottery_enabled',
          'lottery_ticket_cost_usd', 'lottery_3match_prize_usd', 'lottery_2match_prize_usd'
        ]);

      if (settings) {
        for (const s of settings) {
          switch (s.key) {
            case 'lottery_ticket_cost': setTicketCost(parseInt(s.value) || 50); break;
            case 'lottery_max_tickets': setMaxTickets(parseInt(s.value) || 10); break;
            case 'lottery_prize_pool_pct': setPrizePoolPct(parseInt(s.value) || 70); break;
            case 'lottery_admin_pct': setAdminPct(parseInt(s.value) || 20); break;
            case 'lottery_reward_pool_pct': setRewardPoolPct(parseInt(s.value) || 10); break;
            case 'lottery_3match_prize': setPrize3Match(parseInt(s.value) || 500); break;
            case 'lottery_2match_prize': setPrize2Match(parseInt(s.value) || 50); break;
            case 'lottery_enabled': setEnabled(s.value === 'true'); break;
            case 'lottery_ticket_cost_usd': setTicketCostUsd(parseFloat(s.value) || 0); break;
            case 'lottery_3match_prize_usd': setPrize3MatchUsd(parseFloat(s.value) || 0); break;
            case 'lottery_2match_prize_usd': setPrize2MatchUsd(parseFloat(s.value) || 0); break;
          }
        }
      }

      const { data: priceData } = await supabase.rpc('get_live_tung_price_usd');
      setTungPriceUsd(priceData != null ? Number(priceData) : null);

      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('fxu_balance')
          .eq('id', authData.user.id)
          .maybeSingle();
        setAdminBalance(prof?.fxu_balance != null ? Number(prof.fxu_balance) : null);
      }

      const { data: draws } = await supabase
        .from('lottery_draws')
        .select('*')
        .eq('status', 'open')
        .order('closes_at', { ascending: true })
        .limit(1);

      setActiveDraw(draws && draws.length > 0 ? draws[0] : null);
    } catch (err) {
      console.error('Error loading lottery settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleSave = async () => {
    if (prizePoolPct + adminPct + rewardPoolPct !== 100) {
      setMessage({ type: 'error', text: 'Los porcentajes deben sumar 100%' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_lottery_settings', {
        p_ticket_cost: ticketCost,
        p_max_tickets: maxTickets,
        p_prize_pool_pct: prizePoolPct,
        p_admin_pct: adminPct,
        p_reward_pool_pct: rewardPoolPct,
        p_prize_3match: prize3Match,
        p_prize_2match: prize2Match,
        p_enabled: enabled,
        p_ticket_cost_usd: ticketCostUsd,
        p_prize_3match_usd: prize3MatchUsd,
        p_prize_2match_usd: prize2MatchUsd,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      setMessage({ type: 'success', text: 'Configuración guardada' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDraw = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_lottery_draw');
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      setMessage({ type: 'success', text: `Sorteo creado. Cierra: ${new Date(result.closes_at).toLocaleString()}. Jackpot acumulado: ${Math.floor(result.accumulated_jackpot)} TUNG` });
      loadSettings();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error' });
    } finally {
      setCreating(false);
    }
  };

  const handleAddToPool = async () => {
    if (poolAdd <= 0) {
      setMessage({ type: 'error', text: 'Indica cuántos TUNG quieres añadir' });
      return;
    }
    if (adminBalance != null && poolAdd > Math.floor(adminBalance)) {
      setMessage({ type: 'error', text: `Solo tienes ${Math.floor(adminBalance).toLocaleString()} TUNG disponibles` });
      return;
    }
    if (!confirm(`¿Añadir ${poolAdd.toLocaleString()} TUNG al pozo del sorteo #${activeDraw?.draw_number}? Se descontarán de tu saldo.`)) return;
    setAddingPool(true);
    try {
      const { data, error } = await supabase.rpc('admin_add_lottery_prize_pool', { p_amount: poolAdd });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      setMessage({ type: 'success', text: `Añadidos ${Math.floor(result.added).toLocaleString()} TUNG. Pozo total del sorteo #${result.draw_number}: ${Math.floor(result.total_pot).toLocaleString()} TUNG. Tu saldo: ${Math.floor(result.admin_balance).toLocaleString()} TUNG` });
      setAdminBalance(Number(result.admin_balance));
      setPoolAdd(0);
      loadSettings();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error' });
    } finally {
      setAddingPool(false);
    }
  };

  const handleExecuteDraw = async () => {
    if (!activeDraw) return;
    if (!confirm(`¿Ejecutar sorteo #${activeDraw.draw_number}? Esto generará los números ganadores y distribuirá premios.`)) return;
    setExecuting(true);
    try {
      const { data, error } = await supabase.rpc('execute_lottery_draw', { p_draw_id: activeDraw.id });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      setLastResult(result);
      setMessage({ type: 'success', text: `Sorteo ejecutado. Números: ${result.winning_numbers.join(', ')}` });
      loadSettings();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error' });
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-purple-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg border ${message.type === 'success' ? 'bg-green-900/30 border-green-600/30 text-green-400' : 'bg-red-900/30 border-red-600/30 text-red-400'}`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Active Draw Status */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Ticket className="w-5 h-5 text-purple-400" />
          Sorteo Activo
        </h3>
        {activeDraw ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <p className="text-slate-400 text-xs">Sorteo</p>
                <p className="text-white font-bold text-lg">#{activeDraw.draw_number}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <p className="text-slate-400 text-xs">Tickets</p>
                <p className="text-white font-bold text-lg">{activeDraw.total_tickets}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <p className="text-slate-400 text-xs">Pozo Total</p>
                <p className="text-amber-400 font-bold text-lg">{Math.floor((activeDraw.prize_pool || 0) + (activeDraw.accumulated_jackpot || 0)).toLocaleString()} TUNG</p>
                {tungPriceUsd != null && tungPriceUsd > 0 && (
                  <p className="text-emerald-400 text-xs mt-0.5">
                    ≈ ${(((activeDraw.prize_pool || 0) + (activeDraw.accumulated_jackpot || 0)) * tungPriceUsd).toFixed(2)} USD
                  </p>
                )}
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <p className="text-slate-400 text-xs">Cierra</p>
                <p className="text-white font-bold text-sm">{new Date(activeDraw.closes_at).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-amber-600/30 bg-amber-900/10">
              <h4 className="text-sm font-bold text-amber-400 mb-1">Añadir TUNG al pozo</h4>
              <p className="text-xs text-slate-400 mb-2">
                Los TUNG se descuentan de <strong className="text-slate-300">tu saldo</strong> y se suman al pozo de premios
                de este sorteo. No se crean tokens de la nada.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                <span className="text-slate-400">Tu saldo disponible:</span>
                <span className="text-amber-300 font-bold">
                  {adminBalance != null ? Math.floor(adminBalance).toLocaleString() : '---'} TUNG
                </span>
                {adminBalance != null && tungPriceUsd != null && tungPriceUsd > 0 && (
                  <span className="text-emerald-400">≈ ${(adminBalance * tungPriceUsd).toFixed(2)} USD</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={poolAdd}
                  onChange={(e) => setPoolAdd(parseInt(e.target.value) || 0)}
                  className="w-40 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                  placeholder="Cantidad"
                />
                <button
                  onClick={() => setPoolAdd(adminBalance != null ? Math.floor(adminBalance) : 0)}
                  disabled={adminBalance == null || adminBalance < 1}
                  title="Poner todo tu saldo en la casilla"
                  className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Todo
                </button>
                <button
                  onClick={handleAddToPool}
                  disabled={addingPool || poolAdd <= 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all disabled:opacity-50"
                >
                  {addingPool ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                  {addingPool ? 'Añadiendo...' : 'Añadir al pozo'}
                </button>
                {poolAdd > 0 && tungPriceUsd != null && tungPriceUsd > 0 && (
                  <span className="text-xs text-emerald-400">≈ ${(poolAdd * tungPriceUsd).toFixed(2)} USD</span>
                )}
              </div>
            </div>
            <button onClick={handleExecuteDraw} disabled={executing} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold transition-all disabled:opacity-50">
              {executing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {executing ? 'Ejecutando Sorteo...' : 'Ejecutar Sorteo Ahora'}
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-slate-400 mb-4">No hay sorteo activo</p>
            <button onClick={handleCreateDraw} disabled={creating} className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition-all mx-auto disabled:opacity-50">
              {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ticket className="w-5 h-5" />}
              {creating ? 'Creando...' : 'Crear Nuevo Sorteo'}
            </button>
          </div>
        )}
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="bg-gradient-to-r from-amber-900/20 to-yellow-900/20 rounded-xl border border-amber-500/20 p-6">
          <h3 className="text-lg font-bold text-amber-400 mb-3">Resultado del Último Sorteo</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-slate-400">Números: </span><span className="text-white font-bold">{lastResult.winning_numbers?.join(', ')}</span></div>
            <div><span className="text-slate-400">Tickets: </span><span className="text-white font-bold">{lastResult.total_tickets}</span></div>
            <div><span className="text-slate-400">Jackpot: </span><span className="text-amber-400 font-bold">{lastResult.jackpot_winners > 0 ? `${lastResult.jackpot_winners} ganador(es)` : 'Sin ganador'}</span></div>
            <div><span className="text-slate-400">3 aciertos: </span><span className="text-green-400 font-bold">{lastResult.winners_3match}</span></div>
            <div><span className="text-slate-400">2 aciertos: </span><span className="text-blue-400 font-bold">{lastResult.winners_2match}</span></div>
            <div><span className="text-slate-400">Premios pagados: </span><span className="text-white font-bold">{Math.floor(lastResult.minor_prizes_paid)} TUNG</span></div>
            <div><span className="text-slate-400">Acumulado sig: </span><span className="text-amber-400 font-bold">{Math.floor(lastResult.accumulated_to_next)} TUNG</span></div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Coins className="w-5 h-5 text-purple-400" />
          Configuración de Lotería
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 rounded border-slate-600 text-purple-500 focus:ring-purple-500 bg-slate-700" />
              <span className="text-white font-medium">Lotería habilitada</span>
            </label>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Max Tickets por Sorteo</label>
            <input type="number" value={maxTickets} onChange={(e) => setMaxTickets(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">% Pozo de Premios</label>
            <input type="number" value={prizePoolPct} onChange={(e) => setPrizePoolPct(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">% Admin</label>
            <input type="number" value={adminPct} onChange={(e) => setAdminPct(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">% Pools de Recompensa</label>
            <input type="number" value={rewardPoolPct} onChange={(e) => setRewardPoolPct(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white" />
          </div>
          <div className="flex items-end">
            <p className={`text-sm font-bold ${prizePoolPct + adminPct + rewardPoolPct === 100 ? 'text-green-400' : 'text-red-400'}`}>
              Total: {prizePoolPct + adminPct + rewardPoolPct}% {prizePoolPct + adminPct + rewardPoolPct === 100 ? '✓' : '(debe ser 100%)'}
            </p>
          </div>
        </div>

        {/* ---- Precios anclados a USD ---- */}
        <div className="mt-6 p-4 rounded-xl border border-emerald-600/30 bg-emerald-900/10">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h4 className="text-sm font-bold text-emerald-400">Precios anclados a USD (se cobran en TUNG)</h4>
            <span className="text-xs text-slate-400">
              1 TUNG = {tungPriceUsd != null ? `$${tungPriceUsd}` : 'precio no disponible'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Estos son los precios que manda la lotería. Pon el valor en USD y el juego calcula los TUNG al
            precio del momento: si TUNG sube, el ticket cuesta menos TUNG; si baja, cuesta más.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Costo del Ticket (USD)</label>
              <input type="number" step="0.001" min="0" value={ticketCostUsd} onChange={(e) => setTicketCostUsd(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white" />
              {ticketCostUsd > 0 && (
                <p className="text-xs text-emerald-400 mt-1">≈ {effectiveTicketCost.toLocaleString()} TUNG hoy · VIP {Math.ceil(effectiveTicketCost * 0.5).toLocaleString()} TUNG</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Premio 3 Aciertos (USD)</label>
              <input type="number" step="0.001" min="0" value={prize3MatchUsd} onChange={(e) => setPrize3MatchUsd(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white" />
              {prize3MatchUsd > 0 && (
                <p className="text-xs text-emerald-400 mt-1">≈ {effectivePrize3.toLocaleString()} TUNG hoy</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Premio 2 Aciertos (USD)</label>
              <input type="number" step="0.001" min="0" value={prize2MatchUsd} onChange={(e) => setPrize2MatchUsd(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white" />
              {prize2MatchUsd > 0 && (
                <p className="text-xs text-emerald-400 mt-1">≈ {effectivePrize2.toLocaleString()} TUNG hoy</p>
              )}
            </div>
          </div>
          {tungPriceUsd == null && (
            <p className="text-xs text-amber-400 mt-3">
              ⚠ El precio de TUNG no está disponible ahora mismo. Mientras siga así, la lotería usa automáticamente los valores fijos en TUNG.
            </p>
          )}
        </div>
        <div className="mt-4 p-3 bg-slate-900/30 rounded-lg border border-slate-700/30">
          <p className="text-xs text-slate-400 mb-2">
            Preview por cada ticket de {effectiveTicketCost} TUNG{usdMode ? ` (${ticketCostUsd} USD)` : ''}:
          </p>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-amber-400">🏆 Pozo: {Math.floor(effectiveTicketCost * prizePoolPct / 100)} TUNG</span>
            <span className="text-green-400">💰 Admin: {Math.floor(effectiveTicketCost * adminPct / 100)} TUNG</span>
            <span className="text-purple-400">🎁 Pools: {effectiveTicketCost - Math.floor(effectiveTicketCost * prizePoolPct / 100) - Math.floor(effectiveTicketCost * adminPct / 100)} TUNG</span>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="mt-4 flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition-all disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Bot Monitor Section
// ============================================================
interface BotData {
  id: string;
  username: string;
  points_total: number;
  points_buildings: number;
  points_research: number;
  points_fleet: number;
  points_defense: number;
  rank_total: number | null;
  rank_buildings: number | null;
  rank_research: number | null;
  rank_fleet: number | null;
  planet_count: number;
  fleet_count: number;
  created_at: string;
}

function BotMonitorSection() {
  const [bots, setBots] = useState<BotData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [lastTickResult, setLastTickResult] = useState<string | null>(null);
  const [runningTick, setRunningTick] = useState(false);

  const loadBots = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get all bot profiles
      const { data: botProfiles, error: botErr } = await supabase
        .from('profiles')
        .select('id, username, points_total, points_buildings, points_research, points_fleet, points_defense, created_at')
        .eq('is_bot', true)
        .order('points_total', { ascending: false });

      if (botErr) throw botErr;

      // Get total player count for ranking calculation
      const { count: playerCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_admin', false);

      setTotalPlayers(playerCount || 0);

      // Get all rankings (ordered by points desc)
      const { data: allRankings } = await supabase
        .from('profiles')
        .select('id, points_total, points_buildings, points_research, points_fleet')
        .eq('is_admin', false)
        .order('points_total', { ascending: false });

      // Build rank maps
      const rankMapTotal = new Map<string, number>();
      const rankMapBld = new Map<string, number>();
      const rankMapRes = new Map<string, number>();
      const rankMapFlt = new Map<string, number>();

      if (allRankings) {
        [...allRankings].sort((a, b) => (b.points_total || 0) - (a.points_total || 0)).forEach((p, i) => rankMapTotal.set(p.id, i + 1));
        [...allRankings].sort((a, b) => (b.points_buildings || 0) - (a.points_buildings || 0)).forEach((p, i) => rankMapBld.set(p.id, i + 1));
        [...allRankings].sort((a, b) => (b.points_research || 0) - (a.points_research || 0)).forEach((p, i) => rankMapRes.set(p.id, i + 1));
        [...allRankings].sort((a, b) => (b.points_fleet || 0) - (a.points_fleet || 0)).forEach((p, i) => rankMapFlt.set(p.id, i + 1));
      }

      // Get planet counts per bot
      const botIds = (botProfiles || []).map(b => b.id);
      const { data: planets } = await supabase
        .from('planets')
        .select('user_id')
        .in('user_id', botIds);

      const planetCounts = new Map<string, number>();
      (planets || []).forEach(p => planetCounts.set(p.user_id, (planetCounts.get(p.user_id) || 0) + 1));

      // Get active fleet counts per bot
      const { data: fleets } = await supabase
        .from('fleets')
        .select('user_id')
        .in('user_id', botIds)
        .eq('is_completed', false);

      const fleetCounts = new Map<string, number>();
      (fleets || []).forEach(f => fleetCounts.set(f.user_id, (fleetCounts.get(f.user_id) || 0) + 1));

      const enriched: BotData[] = (botProfiles || []).map(b => ({
        id: b.id,
        username: b.username,
        points_total: b.points_total || 0,
        points_buildings: b.points_buildings || 0,
        points_research: b.points_research || 0,
        points_fleet: b.points_fleet || 0,
        points_defense: b.points_defense || 0,
        rank_total: rankMapTotal.get(b.id) ?? null,
        rank_buildings: rankMapBld.get(b.id) ?? null,
        rank_research: rankMapRes.get(b.id) ?? null,
        rank_fleet: rankMapFlt.get(b.id) ?? null,
        planet_count: planetCounts.get(b.id) || 0,
        fleet_count: fleetCounts.get(b.id) || 0,
        created_at: b.created_at,
      }));

      setBots(enriched);
    } catch (err: any) {
      setError(err.message || 'Error loading bots');
    } finally {
      setIsLoading(false);
    }
  };

  // [TICKQ1] El tick tarda mas que el statement_timeout de PostgREST (8s), asi que se encola
  // y se consulta el resultado por sondeo en vez de ejecutarlo de forma sincrona.
  const runBotTick = async () => {
    setRunningTick(true);
    setLastTickResult(null);
    try {
      const { data: queued, error: rpcErr } = await supabase.rpc('admin_run_bot_tick');
      if (rpcErr) throw rpcErr;
      if (!queued?.success) throw new Error(queued?.error || 'No se pudo encolar el tick');

      const runId = queued.run_id;
      setLastTickResult('En cola (run #' + runId + ')... procesando bots, espera unos segundos.');

      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000));
        const { data: run, error: pollErr } = await supabase.rpc('admin_get_bot_tick_run', { p_run_id: runId });
        if (pollErr) throw pollErr;
        if (!run?.success) throw new Error(run?.error || 'No se pudo leer el estado');

        if (run.status === 'done') {
          setLastTickResult(
            'Completado en ' + (run.duration_ms ?? '?') + ' ms\n' + JSON.stringify(run.result, null, 2)
          );
          loadBots(); // refresh
          return;
        }
        if (run.status === 'error') throw new Error(run.error || 'El tick fallo');
        if (run.status === 'expired') throw new Error('El tick caduco en la cola, vuelve a intentarlo');

        setLastTickResult(
          (run.status === 'running' ? 'Ejecutando' : 'En cola') + ' (run #' + runId + ')...'
        );
      }
      throw new Error('Tiempo de espera agotado (3 min). El tick puede seguir ejecutandose en segundo plano.');
    } catch (err: any) {
      setLastTickResult('Error: ' + (err.message || 'unknown'));
    } finally {
      setRunningTick(false);
    }
  };

  useEffect(() => { loadBots(); }, []);

  const avgPoints = bots.length > 0 ? Math.round(bots.reduce((s, b) => s + b.points_total, 0) / bots.length) : 0;
  const avgRank = bots.length > 0 ? Math.round(bots.reduce((s, b) => s + (b.rank_total || totalPlayers), 0) / bots.length) : 0;
  const totalFleets = bots.reduce((s, b) => s + b.fleet_count, 0);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
          <Bot className="w-6 h-6 text-cyan-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-white">{bots.length}</div>
          <div className="text-xs text-slate-400">Bots Activos</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
          <TrendingUp className="w-6 h-6 text-green-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-white">{avgPoints.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Puntos Promedio</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
          <BarChart3 className="w-6 h-6 text-yellow-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-white">#{avgRank}</div>
          <div className="text-xs text-slate-400">Rank Promedio</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
          <Rocket className="w-6 h-6 text-orange-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-white">{totalFleets}</div>
          <div className="text-xs text-slate-400">Flotas Activas</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
          <Users className="w-6 h-6 text-purple-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-white">{totalPlayers}</div>
          <div className="text-xs text-slate-400">Jugadores Total</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={loadBots} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-all disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refrescar
        </button>
        <button onClick={runBotTick} disabled={runningTick} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-sm transition-all disabled:opacity-50">
          {runningTick ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Ejecutar Bot Tick
        </button>
      </div>

      {lastTickResult && (
        <div className="bg-slate-900 border border-cyan-700/50 rounded-lg p-4">
          <p className="text-xs text-cyan-400 font-mono mb-1">Resultado bot_ai_tick():</p>
          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{lastTickResult}</pre>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Bot Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-3 text-slate-400 font-medium">#</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Bot</th>
                <th className="text-right py-3 px-3 text-slate-400 font-medium">Puntos</th>
                <th className="text-center py-3 px-3 text-slate-400 font-medium">Rank General</th>
                <th className="text-center py-3 px-3 text-slate-400 font-medium">Rank Edif</th>
                <th className="text-center py-3 px-3 text-slate-400 font-medium">Rank Inv</th>
                <th className="text-center py-3 px-3 text-slate-400 font-medium">Rank Flota</th>
                <th className="text-center py-3 px-3 text-slate-400 font-medium">Planetas</th>
                <th className="text-center py-3 px-3 text-slate-400 font-medium">Flotas</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((bot, idx) => (
                <tr key={bot.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-cyan-400" />
                      <span className="text-white font-medium">{bot.username}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="text-green-400 font-mono">{bot.points_total.toLocaleString()}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RankBadge rank={bot.rank_total} total={totalPlayers} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RankBadge rank={bot.rank_buildings} total={totalPlayers} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RankBadge rank={bot.rank_research} total={totalPlayers} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RankBadge rank={bot.rank_fleet} total={totalPlayers} />
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-300">{bot.planet_count}</td>
                  <td className="py-2.5 px-3 text-center">
                    {bot.fleet_count > 0 ? (
                      <span className="text-orange-400 font-medium">{bot.fleet_count}</span>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Points Breakdown */}
      {!isLoading && bots.length > 0 && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-yellow-400" /> Desglose de Puntos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bots.map(bot => (
              <div key={bot.id} className="bg-slate-900/50 rounded-lg p-3">
                <p className="text-cyan-400 text-sm font-medium mb-2">{bot.username}</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Edificios</span>
                    <span className="text-green-400">{bot.points_buildings.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Investigación</span>
                    <span className="text-blue-400">{bot.points_research.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Flota</span>
                    <span className="text-red-400">{bot.points_fleet.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Defensa</span>
                    <span className="text-orange-400">{bot.points_defense.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
                    <span className="text-slate-300 font-medium">Total</span>
                    <span className="text-white font-bold">{bot.points_total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RankBadge({ rank, total }: { rank: number | null; total: number }) {
  if (rank === null) return <span className="text-slate-500">-</span>;
  const pct = total > 0 ? (rank / total) * 100 : 100;
  let color = 'text-slate-400';
  if (pct <= 10) color = 'text-yellow-400';
  else if (pct <= 25) color = 'text-green-400';
  else if (pct <= 50) color = 'text-cyan-400';
  else if (pct <= 75) color = 'text-slate-300';
  return (
    <span className={`font-mono text-xs ${color}`}>
      #{rank} <span className="text-slate-500 text-[10px]">/{total}</span>
    </span>
  );
}

type PlanetRole = 'balanced' | 'miner' | 'military' | 'research' | 'colonizer';

interface NpcPlanet {
  id: string;
  name: string;
  coords: string;
  autopilot_role: PlanetRole;
}

interface NpcRoleRow {
  id: string;
  username: string;
  points_total: number;
  planets: NpcPlanet[];
}

const PLANET_ROLES: PlanetRole[] = ['balanced', 'miner', 'military', 'research', 'colonizer'];

function NpcRoleManagerSection() {
  const [rows, setRows] = useState<NpcRoleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNpcId, setExpandedNpcId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadNpcData = async () => {
    setIsLoading(true);
    try {
      const { data: npcs, error: npcErr } = await supabase
        .from('profiles')
        .select('id, username, points_total')
        .eq('is_bot', true)
        .order('points_total', { ascending: false });

      if (npcErr) throw npcErr;

      const npcIds = (npcs || []).map((n: any) => n.id);
      if (npcIds.length === 0) {
        setRows([]);
        return;
      }

      const { data: planets, error: planetErr } = await supabase
        .from('planets')
        .select('id, user_id, name, galaxy, solar_system, position, autopilot_role')
        .in('user_id', npcIds)
        .order('galaxy', { ascending: true })
        .order('solar_system', { ascending: true })
        .order('position', { ascending: true });

      if (planetErr) throw planetErr;

      const planetsByNpc = new Map<string, NpcPlanet[]>();
      (planets || []).forEach((p: any) => {
        const list = planetsByNpc.get(p.user_id) || [];
        list.push({
          id: p.id,
          name: p.name,
          coords: `[${p.galaxy}:${p.solar_system}:${p.position}]`,
          autopilot_role: (p.autopilot_role || 'balanced') as PlanetRole,
        });
        planetsByNpc.set(p.user_id, list);
      });

      const mapped: NpcRoleRow[] = (npcs || []).map((n: any) => ({
        id: n.id,
        username: n.username,
        points_total: n.points_total || 0,
        planets: planetsByNpc.get(n.id) || [],
      }));

      setRows(mapped);
    } catch (err: any) {
      showMessage('error', err.message || 'Error cargando NPCs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNpcData();
  }, []);

  const setPlanetRole = async (planetId: string, role: PlanetRole) => {
    setIsApplying(true);
    try {
      const { error } = await supabase.rpc('admin_set_npc_planet_role', {
        p_planet_id: planetId,
        p_role: role,
      });
      if (error) throw error;
      await loadNpcData();
      showMessage('success', `Rol actualizado: ${role}`);
    } catch (err: any) {
      showMessage('error', err.message || 'No se pudo actualizar el rol del planeta');
    } finally {
      setIsApplying(false);
    }
  };

  const setAllNpcPlanetsRole = async (npcId: string, role: PlanetRole) => {
    setIsApplying(true);
    try {
      const { error } = await supabase.rpc('admin_set_all_npc_planets_role', {
        p_npc_id: npcId,
        p_role: role,
      });
      if (error) throw error;
      await loadNpcData();
      showMessage('success', `Todos los planetas del NPC cambiados a ${role}`);
    } catch (err: any) {
      showMessage('error', err.message || 'No se pudo actualizar el NPC');
    } finally {
      setIsApplying(false);
    }
  };

  const applyStrategy = async (strategy: string, label: string) => {
    setIsApplying(true);
    try {
      let error;
      if (strategy === 'empire') {
        const res = await supabase.rpc('admin_distribute_npc_roles_smart');
        error = res.error;
      } else {
        const res = await supabase.rpc('admin_distribute_npc_roles', {
          p_strategy: strategy,
        });
        error = res.error;
      }
      if (error) throw error;
      await loadNpcData();
      showMessage('success', `Distribucion aplicada: ${label}`);
    } catch (err: any) {
      showMessage('error', err.message || 'No se pudo aplicar la distribucion');
    } finally {
      setIsApplying(false);
    }
  };

  const getRoleDistribution = (planets: NpcPlanet[]) => {
    const counts: Record<PlanetRole, number> = {
      balanced: 0,
      miner: 0,
      military: 0,
      research: 0,
      colonizer: 0,
    };
    planets.forEach((p) => {
      counts[p.autopilot_role] += 1;
    });
    return counts;
  };

  const getDominantRole = (planets: NpcPlanet[]) => {
    if (planets.length === 0) return 'balanced' as PlanetRole;
    const dist = getRoleDistribution(planets);
    return PLANET_ROLES.reduce((best, role) => (dist[role] > dist[best] ? role : best), 'balanced' as PlanetRole);
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-cyan-400" />
          <h3 className="text-white font-semibold">Gestor de Roles NPC</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={loadNpcData}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refrescar</span>
          </button>
          <button
            onClick={() => applyStrategy('empire', 'Imperio (principal militar + investigador + colonizador + mineros)')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-50 ring-1 ring-amber-400/40"
            title="Por cada NPC: principal=militar, 1=research, 1=colonizer, resto=miner"
          >
            👑 Imperio (Auto)
          </button>
          <button
            onClick={() => applyStrategy('strategic', 'Estrategica 40/30/15/10/5')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs disabled:opacity-50"
            title="40% militar, 30% minero, 15% balanced, 10% research, 5% colonizer"
          >
            Estrategica
          </button>
          <button
            onClick={() => applyStrategy('aggressive', 'Agresiva 60/20/10/5/5')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs disabled:opacity-50"
            title="60% militar, 20% minero, 10% balanced, 5% research, 5% colonizer"
          >
            Agresiva
          </button>
          <button
            onClick={() => applyStrategy('economic', 'Economica 20/50/15/10/5')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs disabled:opacity-50"
            title="20% militar, 50% minero, 15% balanced, 10% research, 5% colonizer"
          >
            Economica
          </button>
          <button
            onClick={() => applyStrategy('even', 'Uniforme 20/20/20/20/20')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-xs disabled:opacity-50"
            title="20% cada rol"
          >
            Uniforme
          </button>
          <button
            onClick={() => applyStrategy('all_military', 'Todo Militar')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs disabled:opacity-50"
          >
            Todo Militar
          </button>
          <button
            onClick={() => applyStrategy('all_miner', 'Todo Minero')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs disabled:opacity-50"
          >
            Todo Minero
          </button>
          <button
            onClick={() => applyStrategy('all_balanced', 'Todo Balanced')}
            disabled={isLoading || isApplying}
            className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-xs disabled:opacity-50"
          >
            Todo Balanced
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300' : 'bg-red-900/30 border border-red-700/50 text-red-300'}`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {rows.map((npc) => {
            const dist = getRoleDistribution(npc.planets);
            const dominantRole = getDominantRole(npc.planets);
            const expanded = expandedNpcId === npc.id;

            return (
              <div key={npc.id} className="bg-slate-900/50 border border-slate-700/50 rounded-lg">
                <div className="p-3 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setExpandedNpcId(expanded ? null : npc.id)}
                    className="text-left"
                  >
                    <div className="text-white font-medium">{npc.username}</div>
                    <div className="text-xs text-slate-400">
                      {npc.points_total.toLocaleString()} pts • {npc.planets.length} planetas • Rol dominante: <span className="text-cyan-300">{dominantRole}</span>
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[11px] text-slate-400">
                      M:{dist.military} / Min:{dist.miner} / B:{dist.balanced} / R:{dist.research} / C:{dist.colonizer}
                    </div>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const role = e.target.value as PlanetRole;
                        if (role) setAllNpcPlanetsRole(npc.id, role);
                        e.currentTarget.value = '';
                      }}
                      className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs"
                    >
                      <option value="">Cambiar TODOS</option>
                      {PLANET_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-700/50 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {npc.planets.map((planet) => (
                        <div key={planet.id} className="bg-slate-800/60 rounded border border-slate-700/50 p-2.5">
                          <div className="text-sm text-white font-medium">{planet.name}</div>
                          <div className="text-xs text-slate-400 mb-2">{planet.coords}</div>
                          <select
                            value={planet.autopilot_role}
                            onChange={(e) => setPlanetRole(planet.id, e.target.value as PlanetRole)}
                            className="w-full bg-slate-700 border border-slate-600 text-white rounded px-2 py-1.5 text-xs"
                          >
                            {PLANET_ROLES.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
