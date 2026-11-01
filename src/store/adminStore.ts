import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface SpeedSettings {
  game_speed: number;
  fleet_speed: number;
  resource_speed: number;
  fleet_debris_ratio: number;
  defense_debris_ratio: number;
}

interface SmtpSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  is_enabled: boolean;
}

interface WalletConfig {
  min_deposit: number;
  max_withdrawal_daily: number;
  withdrawal_fee_percent: number;
  required_confirmations: number;
  is_deposits_enabled: boolean;
  is_withdrawals_enabled: boolean;
  deposit_wallet_address: string;
  usdt_min_deposit: number;
  usdt_max_withdrawal_daily: number;
  usdt_withdrawal_fee_percent: number;
  is_usdt_deposits_enabled: boolean;
  is_usdt_withdrawals_enabled: boolean;
  swap_fee_percent: number;
}

interface FeeSettings {
  market_fee_percent: number;
  referral_commission_percent: number;
  expedition_extra_fee_fxu: number;
  p2p_fee_percent: number;
  p2p_fee_admin_share: number;
  p2p_fee_referrer_share: number;
  p2p_fee_pool_share: number;
  market_fee_admin_share: number;
  market_fee_pool_share: number;
  market_fee_referral_share: number;
}

interface FxuCostRatios {
  building_ratio: number;
  research_ratio: number;
  ships_ratio: number;
  defense_ratio: number;
  fleet_ratio: number;
  fleet_jackpot_percent: number;
}

// Estadisticas financieras de la plataforma
interface FinancialStats {
  total_user_fxu: number;
  total_user_usdt: number;
  total_deposits: number;
  total_deposits_usdt: number;
  total_withdrawals: number;
  total_withdrawals_usdt: number;
  pending_withdrawals: number;
  pending_withdrawals_usdt: number;
  total_admin_revenue: number;
  total_admin_expenses: number;
  month_revenue: number;
  year_revenue: number;
  admin_available_balance: number;
  current_month: number;
  current_year: number;
}

// Ingreso individual para historial
interface RevenueEntry {
  id: string;
  type: string;
  amount: number;
  currency?: 'TUNG' | 'USDT';
  amount_fxu?: number;
  description: string | null;
  username: string | null;
  created_at: string;
}

// Desglose por tipo de ingreso
interface RevenueByType {
  breakdown: Record<string, number>;
  total: number;
}

// Datos de serie temporal para graficas
interface TimeSeriesData {
  date?: string;
  week_start?: string;
  week_number?: number;
  month_start?: string;
  month?: number;
  year?: number;
  amount: number;
}

// Resumen de ingresos por periodo
interface RevenueSummary {
  today: number;
  yesterday: number;
  today_change: number;
  this_week: number;
  last_week: number;
  week_change: number;
  this_month: number;
  last_month: number;
  month_change: number;
}

// Métricas del mercado P2P para el Dashboard Financiero
export interface P2PEconomyStats {
  // Volumen (órdenes liberadas)
  volume_fxu_total: number;
  volume_usdt_total: number;
  volume_fxu_24h: number;
  volume_usdt_24h: number;
  volume_fxu_7d: number;
  volume_usdt_7d: number;
  volume_fxu_30d: number;
  volume_usdt_30d: number;
  // Fees cobrados
  fees_fxu_total: number;
  fees_usdt_total: number;
  fees_fxu_30d: number;
  fees_usdt_30d: number;
  // Órdenes
  orders_total: number;
  orders_released: number;
  orders_disputed: number;
  orders_cancelled: number;
  orders_pending: number;
  orders_paid: number;
  orders_by_status: Record<string, number>;
  // Disputas
  disputes_open: number;
  disputes_investigating: number;
  disputes_resolved: number;
  disputes_by_status: Record<string, number>;
  // Ofertas activas
  offers_active: number;
  offers_sell_fxu: number;
  offers_sell_usdt: number;
  offers_buy_fxu: number;
  offers_buy_usdt: number;
  // Traders
  traders_total: number;
  traders_30d: number;
  // Jackpot
  jackpot_from_p2p: number;
  generated_at: string;
}

interface ServerWalletInfo {
  bnbBalance: string;
  tokenBalance: string;
  usdtBalance: string;
  address: string;
}

interface PendingWithdrawal {
  id: string;
  user_id: string;
  username: string;
  amount: number;
  fee_amount: number;
  wallet_address: string;
  created_at: string;
}

interface AdminWithdrawal {
  id: string;
  amount: number;
  wallet_address: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  processed_at: string | null;
}

interface OfficerPricing {
  id: string;
  code: string;
  name: string;
  dark_matter_cost_7d: number;
  dark_matter_cost_30d: number;
  dark_matter_cost_90d: number;
  fxu_cost_7d: number;
  fxu_cost_30d: number;
  fxu_cost_90d: number;
  usdt_cost_7d: number;
  usdt_cost_30d: number;
  usdt_cost_90d: number;
  sort_order: number;
}

export interface CosmeticPricing {
  id: string;
  code: string;
  type: string;
  name: string;
  icon: string;
  rarity: string;
  duration_days: number;
  fxu_cost: number;
  usd_cost: number;
  is_active: boolean;
  live_tung_cost: number;
}

export interface AntiMultiStats {
  shared_ips_count: number;
  shared_fingerprints_count: number;
  pending_reports: number;
  confirmed_multis: number;
  unreviewed_suspicious: number;
  total_logins_today: number;
  unique_users_today: number;
}

export interface SuspiciousAccount {
  id: string;
  user_id: string;
  username: string;
  linked_user_id: string;
  linked_username: string;
  suspicion_type: string;
  evidence: Record<string, unknown>;
  severity: string;
  is_reviewed: boolean;
  is_confirmed_multi: boolean;
  review_notes: string | null;
  created_at: string;
}

export interface MultiaccountReport {
  id: string;
  reporter_id: string;
  reporter_username: string;
  reported_user_id: string;
  reported_username: string;
  suspected_linked_user_id: string | null;
  suspected_linked_username: string | null;
  reason: string;
  evidence_description: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
}

export interface SharedIPGroup {
  ip_address: string;
  user_count: number;
  users: Array<{ user_id: string; username: string; last_login: string }>;
}

export interface SuspiciousInteraction {
  from_user_id: string;
  from_username: string;
  to_user_id: string;
  to_username: string;
  total_sent_metal: number;
  total_sent_crystal: number;
  total_sent_deuterium: number;
  total_received_metal: number;
  total_received_crystal: number;
  total_received_deuterium: number;
  transfer_count: number;
  suspicion_score: number;
}

interface RiskClusterIndicator {
  type: string;
  count: number;
}

export interface RiskCluster {
  user1_id: string;
  user2_id: string;
  user1_name: string;
  user2_name: string;
  indicator_count: number;
  indicators: RiskClusterIndicator[];
  risk_level: 'critical' | 'high' | 'medium';
  risk_score: number;
  already_confirmed: boolean;
}

interface RiskClusterStats {
  clusters: RiskCluster[];
  total_pairs: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
}

interface JackpotStats {
  balance: number;
  total_contributed: number;
  total_won: number;
  last_winner: string | null;
  last_won_at: string | null;
  last_won_amount: number;
  win_chance: number;
  min_jackpot_for_win: number;
}

interface WeeklySnapshot {
  id: string;
  week_start: string;
  week_end: string;
  week_number: number;
  year: number;
  breakdown: Record<string, number>;
  total: number;
  created_at: string;
  is_current?: boolean;
}

interface RecaptchaSettings {
  site_key: string;
  secret_key: string;
  enabled: boolean;
  min_score: number;
}

export interface PremiumMissionPricing {
  id: number;
  code: string;
  title_es: string;
  reward_type: string;
  reward_value: number;
  reward_duration_hours: number;
  cost_usd: number | null;
  cost_fxu: number;
  computed_tung: number | null;
  is_active: boolean;
}

interface JackpotConfig {
  contribution_rate: number;
  win_chance: number;
  min_win_percent: number;
  max_win_percent: number;
  min_jackpot_for_win: number;
}

interface JackpotHistoryEntry {
  id: string;
  user_id: string | null;
  type: 'contribution' | 'win';
  amount: number;
  source: string;
  jackpot_balance_after: number;
  created_at: string;
  username?: string;
}

// Resource depletion system
interface DepletionSettings {
  enabled: boolean;
  regeneration_days: number;
  base_metal_per_field: number;
  depleted_production_percent: number;
  refill_price_usdt: number;
  depleted_count: number;
  regenerating_count: number;
}

interface DepletedPlanet {
  id: string;
  galaxy: number;
  solar_system: number;
  position: number;
  planet_status: string;
  fields_max: number;
  metal_deposit: number;
  crystal_deposit: number;
  deuterium_deposit: number;
  depleted_at: string;
  regenerates_at: string;
  owner_name: string;
}

export interface Shareholder {
  id: string;
  user_id: string;
  username: string | null;
  email: string;
  percentage: number;
  can_view_dashboard: boolean;
  is_active: boolean;
  created_at: string;
  total_paid_fxu_equiv: number;
  total_paid_fxu: number;
  total_paid_usdt: number;
  month_paid_fxu: number;
  month_paid_usdt: number;
  week_paid_fxu: number;
  today_paid_fxu: number;
  pending_fxu: number;
  pending_usdt: number;
  wallet_fxu: number;
  by_source: { revenue_type: string; fxu: number; usdt: number }[];
  payout_count: number;
  last_payout_at: string | null;
}

export interface MyShareholderPayout {
  created_at: string;
  revenue_type: string | null;
  amount: number;
  currency: string;
  percentage: number;
}

export interface MyShareholderWeek {
  wk_start: string;
  wk_end: string;
  week_number: number;
  year: number;
  total_fxu: number;
  total_usdt: number;
  payout_count: number;
}

export interface MyShareholderEarnings {
  is_shareholder: boolean;
  percentage?: number;
  is_active?: boolean;
  since?: string;
  total_fxu?: number;
  total_usdt?: number;
  month_fxu?: number;
  month_usdt?: number;
  payout_count?: number;
  last_payout_at?: string | null;
  recent?: MyShareholderPayout[];
  weekly?: MyShareholderWeek[];
}

interface AdminState {
  isAdmin: boolean;
  isFinancialViewer: boolean;
  speeds: SpeedSettings;
  smtpSettings: SmtpSettings | null;
  walletConfig: WalletConfig | null;
  serverWalletInfo: ServerWalletInfo | null;
  pendingWithdrawals: PendingWithdrawal[];
  adminWithdrawals: AdminWithdrawal[];
  feeSettings: FeeSettings;
  fxuCostRatios: FxuCostRatios;
  officerPricing: OfficerPricing[];
  cosmeticPricing: CosmeticPricing[];
  cosmeticTungPrice: number | null;
  isLoading: boolean;
  speedsLoaded: boolean;

  // Estado financiero
  financialStats: FinancialStats | null;
  recentRevenue: RevenueEntry[];
  revenueByType: RevenueByType | null;
  dailyRevenue: TimeSeriesData[];
  weeklyRevenue: TimeSeriesData[];
  monthlyRevenue: TimeSeriesData[];
  revenueSummary: RevenueSummary | null;
  p2pEconomyStats: P2PEconomyStats | null;

  // Mis ganancias como accionista (self-service)
  myShareholderEarnings: MyShareholderEarnings | null;
  fetchMyShareholderEarnings: () => Promise<void>;

  checkAdminStatus: () => Promise<boolean>;
  fetchSpeeds: () => Promise<void>;
  fetchSmtpSettings: () => Promise<void>;
  updateSpeeds: (speeds: SpeedSettings) => Promise<{ success: boolean; error?: string }>;
  updateSmtpSettings: (settings: SmtpSettings) => Promise<{ success: boolean; error?: string }>;
  sendTestEmail: (recipientEmail: string) => Promise<{ success: boolean; error?: string }>;
  fetchWalletConfig: () => Promise<void>;
  fetchServerWalletInfo: () => Promise<void>;
  updateWalletConfig: (config: Partial<WalletConfig>) => Promise<{ success: boolean; error?: string }>;
  fetchPendingWithdrawals: () => Promise<void>;
  processWithdrawals: () => Promise<{ success: boolean; processed?: number; error?: string }>;
  approveWithdrawal: (txId: string) => Promise<{ success: boolean; txHash?: string; error?: string }>;
  cancelWithdrawal: (txId: string) => Promise<{ success: boolean; error?: string }>;
  fetchFeeSettings: () => Promise<void>;
  updateFeeSettings: (settings: Partial<FeeSettings>) => Promise<{ success: boolean; error?: string }>;
  fetchFxuCostRatios: () => Promise<void>;
  updateFxuCostRatios: (ratios: Partial<FxuCostRatios>) => Promise<{ success: boolean; error?: string }>;

  // Funciones financieras
  fetchFinancialStats: () => Promise<void>;
  fetchRecentRevenue: () => Promise<void>;
  fetchRevenueByType: (year?: number, month?: number) => Promise<void>;
  fetchDailyRevenue: (days?: number) => Promise<void>;
  fetchWeeklyRevenue: (weeks?: number) => Promise<void>;
  fetchMonthlyRevenue: (months?: number) => Promise<void>;
  fetchRevenueSummary: () => Promise<void>;
  fetchP2PEconomyStats: () => Promise<void>;

  // Admin withdrawals
  fetchAdminWithdrawals: () => Promise<void>;
  adminRequestWithdrawal: (amount: number, walletAddress: string) => Promise<{ success: boolean; error?: string }>;
  adminCancelWithdrawal: (withdrawalId: string) => Promise<{ success: boolean; error?: string }>;
  getAdminAvailableBalance: () => Promise<number>;

  // Officer pricing
  fetchOfficerPricing: () => Promise<void>;
  updateOfficerPricing: (pricing: OfficerPricing[]) => Promise<{ success: boolean; error?: string }>;
  fetchCosmeticPricing: () => Promise<void>;
  updateCosmeticPricing: (pricing: CosmeticPricing[]) => Promise<{ success: boolean; error?: string }>;

  // Anti-multicuenta
  antiMultiStats: AntiMultiStats | null;
  suspiciousAccounts: SuspiciousAccount[];
  multiaccountReports: MultiaccountReport[];
  sharedIPs: SharedIPGroup[];
  suspiciousInteractions: SuspiciousInteraction[];
  fetchAntiMultiStats: () => Promise<void>;
  fetchSuspiciousAccounts: () => Promise<void>;
  fetchMultiaccountReports: () => Promise<void>;
  fetchSharedIPs: () => Promise<void>;
  fetchSuspiciousInteractions: () => Promise<void>;
  reviewSuspiciousAccount: (id: string, isConfirmed: boolean, notes: string) => Promise<{ success: boolean; error?: string }>;
  reviewMultiaccountReport: (id: string, status: string, notes: string) => Promise<{ success: boolean; error?: string }>;
  riskClusterStats: RiskClusterStats | null;
  fetchRiskClusters: () => Promise<void>;

  // Jackpot
  jackpotStats: JackpotStats | null;
  jackpotConfig: JackpotConfig | null;
  jackpotHistory: JackpotHistoryEntry[];
  fetchJackpotStats: () => Promise<void>;
  fetchJackpotConfig: () => Promise<void>;
  fetchJackpotHistory: () => Promise<void>;
  updateJackpotConfig: (config: Partial<JackpotConfig>) => Promise<{ success: boolean; error?: string }>;
  addToJackpot: (amount: number) => Promise<{ success: boolean; error?: string }>;

  // reCAPTCHA
  recaptchaSettings: RecaptchaSettings | null;
  fetchRecaptchaSettings: () => Promise<void>;
  updateRecaptchaSettings: (settings: Partial<RecaptchaSettings>) => Promise<{ success: boolean; error?: string }>;

  // Precios misiones premium (USD)
  premiumMissionsPricing: PremiumMissionPricing[];
  premiumTungPriceUsd: number | null;
  fetchPremiumMissionsPricing: () => Promise<void>;
  updatePremiumMissionPrice: (missionId: number, costUsd: number) => Promise<{ success: boolean; error?: string }>;

  // Weekly snapshots
  weeklySnapshots: WeeklySnapshot[];
  currentWeekSnapshot: WeeklySnapshot | null;
  fetchWeeklySnapshots: () => Promise<void>;
  takeWeeklySnapshotNow: () => Promise<{ success: boolean; error?: string }>;

  // Resource depletion system
  depletionSettings: DepletionSettings | null;
  depletedPlanets: DepletedPlanet[];
  fetchDepletionSettings: () => Promise<void>;
  updateDepletionSettings: (settings: Partial<DepletionSettings>) => Promise<{ success: boolean; error?: string }>;
  fetchDepletedPlanets: (status?: string) => Promise<void>;
  forceRegeneratePlanets: () => Promise<{ success: boolean; count?: number; error?: string }>;

  // Accionistas
  shareholders: Shareholder[];
  shareholdersTotalPercentage: number;
  shareholdersTotalPaidFxu: number;
  shareholdersTotalPaidUsdt: number;
  shareholdersMonthPaidFxu: number;
  shareholdersMonthPaidUsdt: number;
  shareholdersTodayPaidFxu: number;
  shareholdersWeekPaidFxu: number;
  shareholdersPendingFxu: number;
  fetchShareholders: () => Promise<void>;
  addShareholder: (email: string, percentage: number, canView: boolean) => Promise<{ success: boolean; error?: string }>;
  updateShareholder: (id: string, percentage: number, isActive: boolean, canView: boolean) => Promise<{ success: boolean; error?: string }>;
  removeShareholder: (id: string) => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_SPEEDS: SpeedSettings = {
  game_speed: 10,
  fleet_speed: 10,
  resource_speed: 10,
  fleet_debris_ratio: 30,
  defense_debris_ratio: 0,
};

const DEFAULT_FEE_SETTINGS: FeeSettings = {
  market_fee_percent: 10,
  referral_commission_percent: 30,
  expedition_extra_fee_fxu: 1000,
  p2p_fee_percent: 1,
  p2p_fee_admin_share: 50,
  p2p_fee_referrer_share: 5,
  p2p_fee_pool_share: 45,
  market_fee_admin_share: 40,
  market_fee_pool_share: 30,
  market_fee_referral_share: 30,
};

const DEFAULT_TUNG_COST_RATIOS: FxuCostRatios = {
  building_ratio: 5000,
  research_ratio: 3000,
  ships_ratio: 8000,
  defense_ratio: 10000,
  fleet_ratio: 5000,
  fleet_jackpot_percent: 49,
};

export const useAdminStore = create<AdminState>((set, get) => ({
  isAdmin: false,
  isFinancialViewer: false,
  speeds: DEFAULT_SPEEDS,
  smtpSettings: null,
  walletConfig: null,
  serverWalletInfo: null,
  pendingWithdrawals: [],
  adminWithdrawals: [],
  feeSettings: DEFAULT_FEE_SETTINGS,
  fxuCostRatios: DEFAULT_TUNG_COST_RATIOS,
  officerPricing: [],
  cosmeticPricing: [],
  cosmeticTungPrice: null,
  isLoading: false,
  speedsLoaded: false,

  // Estado financiero inicial
  financialStats: null,
  recentRevenue: [],
  revenueByType: null,
  dailyRevenue: [],
  weeklyRevenue: [],
  monthlyRevenue: [],
  revenueSummary: null,
  p2pEconomyStats: null,

  // Mis ganancias como accionista
  myShareholderEarnings: null,

  // Anti-multicuenta inicial
  antiMultiStats: null,
  suspiciousAccounts: [],
  multiaccountReports: [],
  sharedIPs: [],
  suspiciousInteractions: [],
  riskClusterStats: null,

  // Jackpot inicial
  jackpotStats: null,
  jackpotConfig: null,
  jackpotHistory: [],

  // reCAPTCHA inicial
  recaptchaSettings: null,

  // Precios misiones premium inicial
  premiumMissionsPricing: [],
  premiumTungPriceUsd: null,

  // Weekly snapshots inicial
  weeklySnapshots: [],
  currentWeekSnapshot: null,

  // Resource depletion inicial
  depletionSettings: null,
  depletedPlanets: [],

  // Accionistas inicial
  shareholders: [],
  shareholdersTotalPercentage: 0,
  shareholdersTotalPaidFxu: 0,
  shareholdersTotalPaidUsdt: 0,
  shareholdersMonthPaidFxu: 0,
  shareholdersMonthPaidUsdt: 0,
  shareholdersTodayPaidFxu: 0,
  shareholdersWeekPaidFxu: 0,
  shareholdersPendingFxu: 0,

  checkAdminStatus: async () => {
    try {
      const { data, error } = await supabase.rpc('is_current_user_admin');
      if (error) throw error;
      const isAdmin = data === true;
      // Acceso de solo lectura al dashboard financiero (accionistas), determinado en BD
      let isFinancialViewer = false;
      if (!isAdmin) {
        const { data: finData } = await supabase.rpc('has_financial_access');
        isFinancialViewer = finData === true;
      }
      set({ isAdmin, isFinancialViewer });
      return isAdmin;
    } catch (error) {
      console.error('Error checking admin status:', error);
      set({ isAdmin: false, isFinancialViewer: false });
      return false;
    }
  },

  fetchSpeeds: async () => {
    try {
      const { data, error } = await supabase.rpc('get_game_speeds');
      if (error) throw error;
      if (data) {
        set({
          speeds: {
            game_speed: Number(data.game_speed) || 10,
            fleet_speed: Number(data.fleet_speed) || 10,
            resource_speed: Number(data.resource_speed) || 10,
            fleet_debris_ratio: Number(data.fleet_debris_ratio) ?? 30,
            defense_debris_ratio: Number(data.defense_debris_ratio) ?? 0,
          },
          speedsLoaded: true,
        });
      }
    } catch (error) {
      console.error('Error fetching game speeds:', error);
      set({ speedsLoaded: true });
    }
  },

  fetchSmtpSettings: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('get_smtp_settings');
      if (error) throw error;
      if (data?.success) {
        set({
          smtpSettings: {
            smtp_host: data.smtp_host || '',
            smtp_port: data.smtp_port || 587,
            smtp_user: data.smtp_user || '',
            smtp_password: data.smtp_password || '',
            smtp_from_email: data.smtp_from_email || '',
            smtp_from_name: data.smtp_from_name || 'Falco-X Universo',
            is_enabled: data.is_enabled || false,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching SMTP settings:', error);
    }
  },

  updateSpeeds: async (speeds: SpeedSettings) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('update_game_speeds', {
        p_game_speed: speeds.game_speed,
        p_fleet_speed: speeds.fleet_speed,
        p_resource_speed: speeds.resource_speed,
        p_fleet_debris_ratio: speeds.fleet_debris_ratio,
        p_defense_debris_ratio: speeds.defense_debris_ratio,
      });

      if (error) throw error;

      if (data?.success) {
        set({ speeds });
        return { success: true };
      }

      return { success: false, error: data?.error || 'Unknown error' };
    } catch (error) {
      console.error('Error updating speeds:', error);
      return { success: false, error: 'Failed to update speeds' };
    } finally {
      set({ isLoading: false });
    }
  },

  updateSmtpSettings: async (settings: SmtpSettings) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('update_smtp_settings', {
        p_host: settings.smtp_host,
        p_port: settings.smtp_port,
        p_user: settings.smtp_user,
        p_password: settings.smtp_password,
        p_from_email: settings.smtp_from_email,
        p_from_name: settings.smtp_from_name,
        p_is_enabled: settings.is_enabled,
      });

      if (error) throw error;

      if (data?.success) {
        set({ smtpSettings: settings });
        return { success: true };
      }

      return { success: false, error: data?.error || 'Unknown error' };
    } catch (error) {
      console.error('Error updating SMTP settings:', error);
      return { success: false, error: 'Failed to update SMTP settings' };
    } finally {
      set({ isLoading: false });
    }
  },

  sendTestEmail: async (recipientEmail: string) => {
    set({ isLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'No autenticado' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-test-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ recipient_email: recipientEmail }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Error al enviar correo' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending test email:', error);
      return { success: false, error: 'Error al enviar correo de prueba' };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchWalletConfig: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('wallet_config')
        .select('*')
        .single();

      if (error) throw error;
      if (data) {
        set({
          walletConfig: {
            min_deposit: data.min_deposit,
            max_withdrawal_daily: data.max_withdrawal_daily,
            withdrawal_fee_percent: data.withdrawal_fee_percent,
            required_confirmations: data.required_confirmations,
            is_deposits_enabled: data.is_deposits_enabled,
            is_withdrawals_enabled: data.is_withdrawals_enabled,
            deposit_wallet_address: data.deposit_wallet_address || '',
            usdt_min_deposit: data.usdt_min_deposit || 1,
            usdt_max_withdrawal_daily: data.usdt_max_withdrawal_daily || 10000,
            usdt_withdrawal_fee_percent: data.usdt_withdrawal_fee_percent || 2,
            is_usdt_deposits_enabled: data.is_usdt_deposits_enabled ?? true,
            is_usdt_withdrawals_enabled: data.is_usdt_withdrawals_enabled ?? true,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching wallet config:', error);
    }
  },

  fetchServerWalletInfo: async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wallet-info`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        set({
          serverWalletInfo: {
            bnbBalance: data.bnbBalance || '0',
            tokenBalance: data.tokenBalance || '0',
            usdtBalance: data.usdtBalance || '0',
            address: data.depositAddress || '',
          },
        });
      }
    } catch (error) {
      console.error('Error fetching server wallet info:', error);
    }
  },

  updateWalletConfig: async (config: Partial<WalletConfig>) => {
    set({ isLoading: true });
    try {
      // [MONEYLOCK1] wallet_config ya no es escribible desde el cliente:
      // se guarda via RPC SECURITY DEFINER que valida is_admin en el servidor.
      const { error } = await supabase.rpc('admin_update_wallet_config', {
        p_config: config,
      });

      if (error) throw error;

      const { walletConfig } = get();
      if (walletConfig) {
        set({ walletConfig: { ...walletConfig, ...config } });
      }
      return { success: true };
    } catch (error) {
      console.error('Error updating wallet config:', error);
      return { success: false, error: 'Failed to update wallet config' };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchPendingWithdrawals: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          id,
          user_id,
          amount,
          fxu_amount,
          wallet_address,
          created_at,
          profiles!inner(username)
        `)
        .eq('tx_type', 'withdrawal')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const withdrawals: PendingWithdrawal[] = (data || []).map((tx) => ({
        id: tx.id,
        user_id: tx.user_id,
        username: (tx.profiles as { username: string })?.username || 'Unknown',
        amount: tx.amount,
        fee_amount: tx.fxu_amount - tx.amount,
        wallet_address: tx.wallet_address || '',
        created_at: tx.created_at,
      }));

      set({ pendingWithdrawals: withdrawals });
    } catch (error) {
      console.error('Error fetching pending withdrawals:', error);
    }
  },

  processWithdrawals: async () => {
    set({ isLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-withdrawal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Failed to process withdrawals' };
      }

      await get().fetchPendingWithdrawals();
      return { success: true, processed: result.processed };
    } catch (error) {
      console.error('Error processing withdrawals:', error);
      return { success: false, error: 'Failed to process withdrawals' };
    } finally {
      set({ isLoading: false });
    }
  },

  approveWithdrawal: async (txId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-withdrawal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tx_id: txId }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Failed to process withdrawal' };
      }

      await get().fetchPendingWithdrawals();

      const txResult = result.results?.[0];
      if (txResult?.status === 'confirmed') {
        return { success: true, txHash: txResult.txHash };
      } else if (txResult?.status === 'failed') {
        return { success: false, error: txResult.error || 'Transaction failed' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      return { success: false, error: 'Failed to approve withdrawal' };
    }
  },

  cancelWithdrawal: async (txId: string) => {
    try {
      const { data, error } = await supabase.rpc('cancel_withdrawal', {
        p_tx_id: txId,
      });

      if (error) throw error;

      if (data?.success) {
        await get().fetchPendingWithdrawals();
        return { success: true };
      }

      return { success: false, error: data?.error || 'Failed to cancel withdrawal' };
    } catch (error) {
      console.error('Error cancelling withdrawal:', error);
      return { success: false, error: 'Failed to cancel withdrawal' };
    }
  },

  fetchFeeSettings: async () => {
    try {
      const { data, error } = await supabase.rpc('get_fee_settings');
      if (error) throw error;
      if (data) {
        set({
          feeSettings: {
            market_fee_percent: Number(data.market_fee_percent) || 10,
            referral_commission_percent: Number(data.referral_commission_percent) || 30,
            expedition_extra_fee_fxu: Number(data.expedition_extra_fee_fxu) || 1000,
            p2p_fee_percent: Number(data.p2p_fee_percent) || 1,
            p2p_fee_admin_share: Number(data.p2p_fee_admin_share) || 50,
            p2p_fee_referrer_share: Number(data.p2p_fee_referrer_share) || 5,
            p2p_fee_pool_share: Number(data.p2p_fee_pool_share) || 45,
            market_fee_admin_share: Number(data.market_fee_admin_share) || 40,
            market_fee_pool_share: Number(data.market_fee_pool_share) || 30,
            market_fee_referral_share: Number(data.market_fee_referral_share) || 30,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching fee settings:', error);
    }
  },

  updateFeeSettings: async (settings: Partial<FeeSettings>) => {
    set({ isLoading: true });
    try {
      if (
        settings.market_fee_percent !== undefined ||
        settings.referral_commission_percent !== undefined ||
        settings.p2p_fee_percent !== undefined ||
        settings.p2p_fee_admin_share !== undefined ||
        settings.p2p_fee_referrer_share !== undefined ||
        settings.p2p_fee_pool_share !== undefined ||
        settings.market_fee_admin_share !== undefined ||
        settings.market_fee_pool_share !== undefined ||
        settings.market_fee_referral_share !== undefined
      ) {
        const { data, error } = await supabase.rpc('update_fee_settings', {
          p_market_fee: settings.market_fee_percent ?? null,
          p_referral_commission: settings.referral_commission_percent ?? null,
          p_p2p_fee: settings.p2p_fee_percent ?? null,
          p_p2p_fee_admin_share: settings.p2p_fee_admin_share ?? null,
          p_p2p_fee_referrer_share: settings.p2p_fee_referrer_share ?? null,
          p_p2p_fee_pool_share: settings.p2p_fee_pool_share ?? null,
          p_market_fee_admin_share: settings.market_fee_admin_share ?? null,
          p_market_fee_pool_share: settings.market_fee_pool_share ?? null,
          p_market_fee_referral_share: settings.market_fee_referral_share ?? null,
        });

        if (error) throw error;
        if (!data?.success) {
          return { success: false, error: data?.error || 'Unknown error' };
        }
      }

      if (settings.expedition_extra_fee_fxu !== undefined) {
        const { data, error } = await supabase.rpc('update_expedition_fee_setting', {
          p_fee: settings.expedition_extra_fee_fxu,
        });

        if (error) throw error;
        if (!data?.success) {
          return { success: false, error: data?.error || 'Unknown error' };
        }
      }

      const { feeSettings } = get();
      set({ feeSettings: { ...feeSettings, ...settings } });
      return { success: true };
    } catch (error) {
      console.error('Error updating fee settings:', error);
      return { success: false, error: 'Failed to update fee settings' };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFxuCostRatios: async () => {
    try {
      const [ratiosResult, fleetResult] = await Promise.all([
        supabase.rpc('get_fxu_cost_ratios'),
        supabase.rpc('get_fleet_acceleration_settings'),
      ]);

      const ratiosData = ratiosResult.data;
      const fleetData = fleetResult.data;

      set({
        fxuCostRatios: {
          building_ratio: Number(ratiosData?.building_ratio) || 5000,
          research_ratio: Number(ratiosData?.research_ratio) || 3000,
          ships_ratio: Number(ratiosData?.ships_ratio) || 8000,
          defense_ratio: Number(ratiosData?.defense_ratio) || 10000,
          fleet_ratio: Number(fleetData?.fxu_ratio) || 5000,
          fleet_jackpot_percent: Number(fleetData?.jackpot_percent) || 49,
        },
      });
    } catch (error) {
      console.error('Error fetching TUNG cost ratios:', error);
    }
  },

  updateFxuCostRatios: async (ratios: Partial<FxuCostRatios>) => {
    set({ isLoading: true });
    try {
      const hasBaseRatios = ratios.building_ratio !== undefined ||
                            ratios.research_ratio !== undefined ||
                            ratios.ships_ratio !== undefined ||
                            ratios.defense_ratio !== undefined;

      const hasFleetRatios = ratios.fleet_ratio !== undefined ||
                             ratios.fleet_jackpot_percent !== undefined;

      if (hasBaseRatios) {
        const { data, error } = await supabase.rpc('update_fxu_cost_ratios', {
          p_building_ratio: ratios.building_ratio ?? null,
          p_research_ratio: ratios.research_ratio ?? null,
          p_ships_ratio: ratios.ships_ratio ?? null,
          p_defense_ratio: ratios.defense_ratio ?? null,
        });

        if (error) throw error;
        if (!data?.success) {
          return { success: false, error: data?.error || 'Unknown error' };
        }
      }

      if (hasFleetRatios) {
        const { data, error } = await supabase.rpc('admin_update_fleet_acceleration_settings', {
          p_fxu_ratio: ratios.fleet_ratio ?? null,
          p_jackpot_percent: ratios.fleet_jackpot_percent ?? null,
        });

        if (error) throw error;
        if (!data?.success) {
          return { success: false, error: data?.error || 'Unknown error' };
        }
      }

      const { fxuCostRatios } = get();
      set({ fxuCostRatios: { ...fxuCostRatios, ...ratios } });
      return { success: true };
    } catch (error) {
      console.error('Error updating TUNG cost ratios:', error);
      return { success: false, error: 'Failed to update TUNG cost ratios' };
    } finally {
      set({ isLoading: false });
    }
  },

  // Obtiene estadisticas financieras completas de la plataforma
  fetchFinancialStats: async () => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_platform_financial_stats');
      if (error) throw error;

      if (data?.success) {
        set({
          financialStats: {
            total_user_fxu: Number(data.total_user_fxu) || 0,
            total_user_usdt: Number(data.total_user_usdt) || 0,
            total_deposits: Number(data.total_deposits) || 0,
            total_deposits_usdt: Number(data.total_deposits_usdt) || 0,
            total_withdrawals: Number(data.total_withdrawals) || 0,
            total_withdrawals_usdt: Number(data.total_withdrawals_usdt) || 0,
            pending_withdrawals: Number(data.pending_withdrawals) || 0,
            pending_withdrawals_usdt: Number(data.pending_withdrawals_usdt) || 0,
            total_admin_revenue: Number(data.total_admin_revenue) || 0,
            total_admin_expenses: Number(data.total_admin_expenses) || 0,
            month_revenue: Number(data.month_revenue) || 0,
            year_revenue: Number(data.year_revenue) || 0,
            admin_available_balance: Number(data.admin_available_balance) || 0,
            current_month: data.current_month,
            current_year: data.current_year,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching financial stats:', error);
    }
  },

  // Obtiene historial de ingresos recientes
  fetchRecentRevenue: async () => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_recent_revenue', { p_limit: 50 });
      if (error) throw error;

      if (data?.success) {
        set({ recentRevenue: data.revenues || [] });
      }
    } catch (error) {
      console.error('Error fetching recent revenue:', error);
    }
  },

  // Obtiene desglose de ingresos por tipo
  fetchRevenueByType: async (year?: number, month?: number) => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_revenue_by_type', {
        p_year: year ?? null,
        p_month: month ?? null,
      });
      if (error) throw error;

      if (data?.success) {
        set({
          revenueByType: {
            breakdown: data.breakdown || {},
            total: Number(data.total) || 0,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching revenue by type:', error);
    }
  },

  // Obtiene ingresos diarios para grafica
  fetchDailyRevenue: async (days: number = 30) => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_daily_revenue', { p_days: days });
      if (error) throw error;

      if (data?.success) {
        set({ dailyRevenue: data.data || [] });
      }
    } catch (error) {
      console.error('Error fetching daily revenue:', error);
    }
  },

  // Obtiene ingresos semanales para grafica
  fetchWeeklyRevenue: async (weeks: number = 12) => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_weekly_revenue', { p_weeks: weeks });
      if (error) throw error;

      if (data?.success) {
        set({ weeklyRevenue: data.data || [] });
      }
    } catch (error) {
      console.error('Error fetching weekly revenue:', error);
    }
  },

  // Obtiene ingresos mensuales para grafica
  fetchMonthlyRevenue: async (months: number = 12) => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_monthly_revenue', { p_months: months });
      if (error) throw error;

      if (data?.success) {
        set({ monthlyRevenue: data.data || [] });
      }
    } catch (error) {
      console.error('Error fetching monthly revenue:', error);
    }
  },

  // Obtiene resumen de ingresos comparativo
  fetchRevenueSummary: async () => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_revenue_summary');
      if (error) throw error;

      if (data?.success) {
        set({
          revenueSummary: {
            today: Number(data.today) || 0,
            yesterday: Number(data.yesterday) || 0,
            today_change: Number(data.today_change) || 0,
            this_week: Number(data.this_week) || 0,
            last_week: Number(data.last_week) || 0,
            week_change: Number(data.week_change) || 0,
            this_month: Number(data.this_month) || 0,
            last_month: Number(data.last_month) || 0,
            month_change: Number(data.month_change) || 0,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching revenue summary:', error);
    }
  },

  // Obtiene métricas del mercado P2P
  fetchP2PEconomyStats: async () => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_p2p_economy_stats');
      if (error) throw error;

      if (data?.success) {
        set({
          p2pEconomyStats: {
            volume_fxu_total:  Number(data.volume_fxu_total)  || 0,
            volume_usdt_total: Number(data.volume_usdt_total) || 0,
            volume_fxu_24h:    Number(data.volume_fxu_24h)    || 0,
            volume_usdt_24h:   Number(data.volume_usdt_24h)   || 0,
            volume_fxu_7d:     Number(data.volume_fxu_7d)     || 0,
            volume_usdt_7d:    Number(data.volume_usdt_7d)    || 0,
            volume_fxu_30d:    Number(data.volume_fxu_30d)    || 0,
            volume_usdt_30d:   Number(data.volume_usdt_30d)   || 0,
            fees_fxu_total:    Number(data.fees_fxu_total)    || 0,
            fees_usdt_total:   Number(data.fees_usdt_total)   || 0,
            fees_fxu_30d:      Number(data.fees_fxu_30d)      || 0,
            fees_usdt_30d:     Number(data.fees_usdt_30d)     || 0,
            orders_total:      Number(data.orders_total)      || 0,
            orders_released:   Number(data.orders_released)   || 0,
            orders_disputed:   Number(data.orders_disputed)   || 0,
            orders_cancelled:  Number(data.orders_cancelled)  || 0,
            orders_pending:    Number(data.orders_pending)    || 0,
            orders_paid:       Number(data.orders_paid)       || 0,
            orders_by_status:  data.orders_by_status || {},
            disputes_open:         Number(data.disputes_open)         || 0,
            disputes_investigating:Number(data.disputes_investigating)|| 0,
            disputes_resolved:     Number(data.disputes_resolved)     || 0,
            disputes_by_status:    data.disputes_by_status || {},
            offers_active:     Number(data.offers_active)     || 0,
            offers_sell_fxu:   Number(data.offers_sell_fxu)   || 0,
            offers_sell_usdt:  Number(data.offers_sell_usdt)  || 0,
            offers_buy_fxu:    Number(data.offers_buy_fxu)    || 0,
            offers_buy_usdt:   Number(data.offers_buy_usdt)   || 0,
            traders_total:     Number(data.traders_total)     || 0,
            traders_30d:       Number(data.traders_30d)       || 0,
            jackpot_from_p2p:  Number(data.jackpot_from_p2p)  || 0,
            generated_at:      data.generated_at || new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('Error fetching P2P economy stats:', error);
    }
  },

  // Obtiene historial de retiros del admin
  fetchAdminWithdrawals: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('admin_withdrawals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      set({ adminWithdrawals: data || [] });
    } catch (error) {
      console.error('Error fetching admin withdrawals:', error);
    }
  },

  // Admin solicita retiro de sus ganancias (sin fee)
  adminRequestWithdrawal: async (amount: number, walletAddress: string) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('admin_request_withdrawal', {
        p_amount: amount,
        p_wallet_address: walletAddress,
      });

      if (error) throw error;

      if (!data?.success) {
        return { success: false, error: data?.error || 'Error desconocido' };
      }

      const withdrawalId = data.withdrawal_id;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'No autenticado' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-admin-withdrawal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ withdrawal_id: withdrawalId }),
        }
      );

      const result = await response.json();

      await get().fetchAdminWithdrawals();
      await get().fetchFinancialStats();

      if (!response.ok || !result.success) {
        return {
          success: false,
          error: result.error || 'Error al procesar retiro en blockchain'
        };
      }

      return {
        success: true,
        txHash: result.txHash,
      };
    } catch (error) {
      console.error('Error requesting admin withdrawal:', error);
      return { success: false, error: 'Error al solicitar retiro' };
    } finally {
      set({ isLoading: false });
    }
  },

  // Admin cancela un retiro pendiente
  adminCancelWithdrawal: async (withdrawalId: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_cancel_withdrawal', {
        p_withdrawal_id: withdrawalId,
      });

      if (error) throw error;

      if (data?.success) {
        await get().fetchAdminWithdrawals();
        await get().fetchFinancialStats();
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error cancelling admin withdrawal:', error);
      return { success: false, error: 'Error al cancelar retiro' };
    }
  },

  // Obtiene balance disponible del admin
  getAdminAvailableBalance: async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_available_balance');
      if (error) throw error;
      return Number(data) || 0;
    } catch (error) {
      console.error('Error getting admin available balance:', error);
      return 0;
    }
  },

  // Obtiene precios de oficiales desde la base de datos
  // La funcion admin_get_officer_pricing retorna: { success: boolean, officers: OfficerPricing[] }
  // Si success es true, officers contiene el array de precios de cada oficial
  // Los precios incluyen: dark_matter_cost_7d/30d/90d y fxu_cost_7d/30d/90d
  fetchOfficerPricing: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('admin_get_officer_pricing');
      if (error) throw error;

      // Extraer el array de oficiales del objeto de respuesta
      // data = { success: true, officers: [{ id, code, name, dark_matter_cost_7d, ... }] }
      if (data?.success && Array.isArray(data.officers)) {
        set({ officerPricing: data.officers });
      }
    } catch (error) {
      console.error('Error fetching officer pricing:', error);
    }
  },

  // Actualiza precios de oficiales
  updateOfficerPricing: async (pricing: OfficerPricing[]) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('admin_bulk_update_officer_pricing', {
        p_pricing: pricing,
      });

      if (error) throw error;

      if (data?.success) {
        set({ officerPricing: pricing });
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error updating officer pricing:', error);
      return { success: false, error: 'Error al actualizar precios' };
    } finally {
      set({ isLoading: false });
    }
  },

  // Obtiene el catalogo de cosmeticos para el panel admin (precio USD + TUNG en vivo)
  fetchCosmeticPricing: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('admin_list_cosmetics');
      if (error) throw error;

      if (data?.success && Array.isArray(data.cosmetics)) {
        set({
          cosmeticPricing: data.cosmetics,
          cosmeticTungPrice: data.tung_price != null ? Number(data.tung_price) : null,
        });
      }
    } catch (error) {
      console.error('Error fetching cosmetic pricing:', error);
    }
  },

  // Guarda los precios en USD de los cosmeticos
  updateCosmeticPricing: async (pricing: CosmeticPricing[]) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('admin_bulk_update_cosmetic_pricing', {
        p_pricing: pricing.map((c) => ({ id: c.id, usd_cost: c.usd_cost })),
      });

      if (error) throw error;

      if (data?.success) {
        set({ cosmeticPricing: pricing });
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error updating cosmetic pricing:', error);
      return { success: false, error: 'Error al actualizar precios' };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchAntiMultiStats: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('get_anti_multi_stats');
      if (error) throw error;
      set({ antiMultiStats: data });
    } catch (error) {
      console.error('Error fetching anti-multi stats:', error);
    }
  },

  fetchSuspiciousAccounts: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('suspicious_accounts')
        .select(`
          id,
          user_id,
          linked_user_id,
          suspicion_type,
          evidence,
          severity,
          is_reviewed,
          is_confirmed_multi,
          review_notes,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const userIds = new Set<string>();
      (data || []).forEach(s => {
        userIds.add(s.user_id);
        if (s.linked_user_id) userIds.add(s.linked_user_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', Array.from(userIds));

      const profileMap = new Map((profiles || []).map(p => [p.id, p.username]));

      const suspicious: SuspiciousAccount[] = (data || []).map(s => ({
        ...s,
        username: profileMap.get(s.user_id) || 'Unknown',
        linked_username: profileMap.get(s.linked_user_id) || 'Unknown',
      }));

      set({ suspiciousAccounts: suspicious });
    } catch (error) {
      console.error('Error fetching suspicious accounts:', error);
    }
  },

  fetchMultiaccountReports: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('multiaccounting_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const userIds = new Set<string>();
      (data || []).forEach(r => {
        userIds.add(r.reporter_id);
        userIds.add(r.reported_user_id);
        if (r.suspected_linked_user_id) userIds.add(r.suspected_linked_user_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', Array.from(userIds));

      const profileMap = new Map((profiles || []).map(p => [p.id, p.username]));

      const reports: MultiaccountReport[] = (data || []).map(r => ({
        ...r,
        reporter_username: profileMap.get(r.reporter_id) || 'Unknown',
        reported_username: profileMap.get(r.reported_user_id) || 'Unknown',
        suspected_linked_username: r.suspected_linked_user_id ? profileMap.get(r.suspected_linked_user_id) || null : null,
      }));

      set({ multiaccountReports: reports });
    } catch (error) {
      console.error('Error fetching multiaccounting reports:', error);
    }
  },

  fetchSharedIPs: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('get_shared_ip_accounts');
      if (error) throw error;
      set({ sharedIPs: data || [] });
    } catch (error) {
      console.error('Error fetching shared IPs:', error);
    }
  },

  fetchSuspiciousInteractions: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('get_suspicious_interactions');
      if (error) throw error;
      set({ suspiciousInteractions: data || [] });
    } catch (error) {
      console.error('Error fetching suspicious interactions:', error);
    }
  },

  reviewSuspiciousAccount: async (id: string, isConfirmed: boolean, notes: string) => {
    try {
      const { data, error } = await supabase.rpc('update_suspicious_account', {
        p_suspicious_id: id,
        p_is_reviewed: true,
        p_is_confirmed_multi: isConfirmed,
        p_review_notes: notes,
      });

      if (error) throw error;

      if (data?.success) {
        await get().fetchSuspiciousAccounts();
        await get().fetchAntiMultiStats();
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error reviewing suspicious account:', error);
      return { success: false, error: 'Error al revisar cuenta sospechosa' };
    }
  },

  reviewMultiaccountReport: async (id: string, status: string, notes: string) => {
    try {
      const { data, error } = await supabase.rpc('review_multiaccounting_report', {
        p_report_id: id,
        p_status: status,
        p_review_notes: notes,
      });

      if (error) throw error;

      if (data?.success) {
        await get().fetchMultiaccountReports();
        await get().fetchAntiMultiStats();
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error reviewing multiaccounting report:', error);
      return { success: false, error: 'Error al revisar reporte' };
    }
  },

  fetchRiskClusters: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('get_multi_account_risk_clusters');
      if (error) throw error;
      if (data?.success) {
        set({
          riskClusterStats: {
            clusters: data.clusters || [],
            total_pairs: Number(data.total_pairs) || 0,
            critical_count: Number(data.critical_count) || 0,
            high_count: Number(data.high_count) || 0,
            medium_count: Number(data.medium_count) || 0,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching risk clusters:', error);
    }
  },

  fetchJackpotStats: async () => {
    try {
      const { data, error } = await supabase.rpc('get_jackpot_stats');
      if (error) throw error;
      set({ jackpotStats: data as JackpotStats });
    } catch (error) {
      console.error('Error fetching jackpot stats:', error);
    }
  },

  fetchJackpotConfig: async () => {
    try {
      const { data, error } = await supabase
        .from('jackpot_config')
        .select('*')
        .single();
      if (error) throw error;
      set({ jackpotConfig: data as JackpotConfig });
    } catch (error) {
      console.error('Error fetching jackpot config:', error);
    }
  },

  fetchJackpotHistory: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('jackpot_history')
        .select(`
          *,
          profiles:user_id (username)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const history = (data || []).map(entry => ({
        ...entry,
        username: entry.profiles?.username || null,
      }));

      set({ jackpotHistory: history as JackpotHistoryEntry[] });
    } catch (error) {
      console.error('Error fetching jackpot history:', error);
    }
  },

  updateJackpotConfig: async (config: Partial<JackpotConfig>) => {
    try {
      const { data, error } = await supabase.rpc('admin_update_jackpot_config', {
        p_contribution_rate: config.contribution_rate,
        p_win_chance: config.win_chance,
        p_min_win_percent: config.min_win_percent,
        p_max_win_percent: config.max_win_percent,
        p_min_jackpot_for_win: config.min_jackpot_for_win,
      });

      if (error) throw error;
      if (data?.success) {
        await get().fetchJackpotConfig();
        await get().fetchJackpotStats();
        return { success: true };
      }
      return { success: false, error: 'Error al actualizar configuracion' };
    } catch (error) {
      console.error('Error updating jackpot config:', error);
      return { success: false, error: 'Error al actualizar configuracion del jackpot' };
    }
  },

  addToJackpot: async (amount: number) => {
    try {
      const { data, error } = await supabase.rpc('admin_add_to_jackpot', {
        p_amount: amount,
      });

      if (error) throw error;
      if (data?.success) {
        await get().fetchJackpotStats();
        await get().fetchJackpotHistory();
        return { success: true };
      }
      return { success: false, error: 'Error al agregar al jackpot' };
    } catch (error) {
      console.error('Error adding to jackpot:', error);
      return { success: false, error: 'Error al agregar al jackpot' };
    }
  },

  fetchRecaptchaSettings: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('admin_get_recaptcha_settings');
      if (error) throw error;

      if (data?.success) {
        set({
          recaptchaSettings: {
            site_key: data.site_key || '',
            secret_key: data.secret_key || '',
            enabled: data.enabled || false,
            min_score: Number(data.min_score) || 0.5,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching reCAPTCHA settings:', error);
    }
  },

  updateRecaptchaSettings: async (settings: Partial<RecaptchaSettings>) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('admin_update_recaptcha_settings', {
        p_site_key: settings.site_key ?? null,
        p_secret_key: settings.secret_key ?? null,
        p_enabled: settings.enabled ?? null,
        p_min_score: settings.min_score ?? null,
      });

      if (error) throw error;

      if (data?.success) {
        const { recaptchaSettings } = get();
        set({
          recaptchaSettings: {
            site_key: settings.site_key ?? recaptchaSettings?.site_key ?? '',
            secret_key: settings.secret_key ?? recaptchaSettings?.secret_key ?? '',
            enabled: settings.enabled ?? recaptchaSettings?.enabled ?? false,
            min_score: settings.min_score ?? recaptchaSettings?.min_score ?? 0.5,
          },
        });
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error updating reCAPTCHA settings:', error);
      return { success: false, error: 'Error al actualizar configuracion reCAPTCHA' };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchPremiumMissionsPricing: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.rpc('admin_get_premium_missions_pricing');
      if (error) throw error;

      if (data?.success) {
        set({
          premiumMissionsPricing: (data.missions || []) as PremiumMissionPricing[],
          premiumTungPriceUsd: data.tung_price_usd != null ? Number(data.tung_price_usd) : null,
        });
      }
    } catch (error) {
      console.error('Error fetching premium missions pricing:', error);
    }
  },

  updatePremiumMissionPrice: async (missionId: number, costUsd: number) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('admin_update_premium_mission_price', {
        p_mission_id: missionId,
        p_cost_usd: costUsd,
      });

      if (error) throw error;

      if (data?.success) {
        await get().fetchPremiumMissionsPricing();
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error updating premium mission price:', error);
      return { success: false, error: 'Error al actualizar el precio de la mision' };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchWeeklySnapshots: async () => {
    const { isAdmin, isFinancialViewer } = get();
    if (!isAdmin && !isFinancialViewer) return;

    try {
      const { data, error } = await supabase.rpc('get_weekly_revenue_snapshots', { p_limit: 52 });
      if (error) throw error;

      if (data?.success) {
        set({
          weeklySnapshots: data.snapshots || [],
          currentWeekSnapshot: data.current_week || null,
        });
      }
    } catch (error) {
      console.error('Error fetching weekly snapshots:', error);
    }
  },

  takeWeeklySnapshotNow: async () => {
    const { isAdmin } = get();
    if (!isAdmin) return { success: false, error: 'Not admin' };

    try {
      const { data, error } = await supabase.rpc('admin_take_weekly_snapshot_now');
      if (error) throw error;

      if (data?.success) {
        await get().fetchWeeklySnapshots();
        return { success: true };
      }

      return { success: false, error: data?.error || 'Error desconocido' };
    } catch (error) {
      console.error('Error taking weekly snapshot:', error);
      return { success: false, error: 'Error al tomar snapshot semanal' };
    }
  },

  // ===========================================================================
  // Resource Depletion System
  // ===========================================================================
  fetchDepletionSettings: async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_depletion_settings');
      if (error) throw error;
      if (data?.success) {
        const s = data.settings || {};
        set({
          depletionSettings: {
            enabled: s.depletion_enabled === 'true',
            regeneration_days: Number(s.depletion_regeneration_days) || 30,
            base_metal_per_field: Number(s.depletion_base_metal_per_field) || 40000,
            depleted_production_percent: Number(s.depletion_depleted_production_percent) || 5,
            refill_price_usdt: Number(s.depletion_refill_price_usdt) || 10,
            depleted_count: Number(data.depleted_planets) || 0,
            regenerating_count: Number(data.regenerating_planets) || 0,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching depletion settings:', error);
    }
  },

  updateDepletionSettings: async (settings: Partial<DepletionSettings>) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (settings.enabled !== undefined) params.depletion_enabled = String(settings.enabled);
      if (settings.regeneration_days !== undefined) params.depletion_regeneration_days = String(settings.regeneration_days);
      if (settings.base_metal_per_field !== undefined) params.depletion_base_metal_per_field = String(settings.base_metal_per_field);
      if (settings.depleted_production_percent !== undefined) params.depletion_depleted_production_percent = String(settings.depleted_production_percent);
      if (settings.refill_price_usdt !== undefined) params.depletion_refill_price_usdt = String(settings.refill_price_usdt);

      const { data, error } = await supabase.rpc('admin_update_depletion_settings', { p_settings: params });
      if (error) throw error;
      if (data?.success) {
        await get().fetchDepletionSettings();
        return { success: true };
      }
      return { success: false, error: data?.error };
    } catch (error) {
      console.error('Error updating depletion settings:', error);
      return { success: false, error: 'Failed to update depletion settings' };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchDepletedPlanets: async (status?: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_get_depleted_planets', {
        p_status: status || null,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      if (data?.success) {
        set({ depletedPlanets: data.planets || [] });
      }
    } catch (error) {
      console.error('Error fetching depleted planets:', error);
    }
  },

  forceRegeneratePlanets: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('admin_force_regenerate_planets');
      if (error) throw error;
      if (data?.success) {
        await get().fetchDepletionSettings();
        await get().fetchDepletedPlanets();
        return { success: true, count: data.regenerated_count };
      }
      return { success: false, error: data?.error };
    } catch (error) {
      console.error('Error forcing regeneration:', error);
      return { success: false, error: 'Failed to force regeneration' };
    } finally {
      set({ isLoading: false });
    }
  },

  // ===== Accionistas =====
  fetchShareholders: async () => {
    try {
      const { data, error } = await supabase.rpc('admin_list_shareholders');
      if (error) throw error;
      if (data?.success) {
        set({
          shareholders: (data.shareholders || []) as Shareholder[],
          shareholdersTotalPercentage: Number(data.total_percentage) || 0,
          shareholdersTotalPaidFxu: Number(data.total_paid_fxu) || 0,
          shareholdersTotalPaidUsdt: Number(data.total_paid_usdt) || 0,
          shareholdersMonthPaidFxu: Number(data.month_paid_fxu) || 0,
          shareholdersMonthPaidUsdt: Number(data.month_paid_usdt) || 0,
          shareholdersTodayPaidFxu: Number(data.today_paid_fxu) || 0,
          shareholdersWeekPaidFxu: Number(data.week_paid_fxu) || 0,
          shareholdersPendingFxu: Number(data.pending_fxu) || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching shareholders:', error);
    }
  },

  fetchMyShareholderEarnings: async () => {
    try {
      const { data, error } = await supabase.rpc('my_shareholder_earnings');
      if (error) throw error;
      set({ myShareholderEarnings: (data || { is_shareholder: false }) as MyShareholderEarnings });
    } catch (error) {
      console.error('Error fetching my shareholder earnings:', error);
    }
  },

  addShareholder: async (email: string, percentage: number, canView: boolean) => {
    try {
      const { data, error } = await supabase.rpc('admin_add_shareholder', {
        p_email: email,
        p_percentage: percentage,
        p_can_view: canView,
      });
      if (error) throw error;
      if (data?.success) {
        await get().fetchShareholders();
        return { success: true };
      }
      return { success: false, error: data?.error || 'Error al agregar accionista' };
    } catch (error) {
      console.error('Error adding shareholder:', error);
      return { success: false, error: 'Error al agregar accionista' };
    }
  },

  updateShareholder: async (id: string, percentage: number, isActive: boolean, canView: boolean) => {
    try {
      const { data, error } = await supabase.rpc('admin_update_shareholder', {
        p_id: id,
        p_percentage: percentage,
        p_is_active: isActive,
        p_can_view: canView,
      });
      if (error) throw error;
      if (data?.success) {
        await get().fetchShareholders();
        return { success: true };
      }
      return { success: false, error: data?.error || 'Error al actualizar accionista' };
    } catch (error) {
      console.error('Error updating shareholder:', error);
      return { success: false, error: 'Error al actualizar accionista' };
    }
  },

  removeShareholder: async (id: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_remove_shareholder', { p_id: id });
      if (error) throw error;
      if (data?.success) {
        await get().fetchShareholders();
        return { success: true };
      }
      return { success: false, error: data?.error || 'Error al eliminar accionista' };
    } catch (error) {
      console.error('Error removing shareholder:', error);
      return { success: false, error: 'Error al eliminar accionista' };
    }
  },
}));

export function getGameSpeed(): number {
  return useAdminStore.getState().speeds.game_speed;
}

export function getFleetSpeed(): number {
  return useAdminStore.getState().speeds.fleet_speed;
}

export function getResourceSpeed(): number {
  return useAdminStore.getState().speeds.resource_speed;
}

export function getMarketFeePercent(): number {
  return useAdminStore.getState().feeSettings.market_fee_percent;
}

export function getReferralCommissionPercent(): number {
  return useAdminStore.getState().feeSettings.referral_commission_percent;
}
