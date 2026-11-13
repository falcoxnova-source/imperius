import { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Copy, CheckCircle, AlertTriangle, Clock, ExternalLink, RefreshCw, X, TrendingUp, ArrowLeftRight, MessageCircle, Loader2, Star, Shield, Receipt } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';

const TUNG_LOGO = '/Imagenes/Logo%20de%20moneda/Logo%20de%20tung.webp';

interface TokenPrice {
  priceUsd: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  tokenSymbol: string;
  tokenName: string;
  dex: string;
}

interface WalletInfo {
  depositAddress: string;
  tokenContract: string;
  usdtContract: string;
  tokenSymbol: string;
  tokenName: string;
  tokenBalance: string;
  usdtBalance: string;
  bnbBalance: string;
  config: {
    minDeposit: number;
    maxWithdrawalDaily: number;
    withdrawalFeePercent: number;
    requiredConfirmations: number;
    depositsEnabled: boolean;
    withdrawalsEnabled: boolean;
    usdtMinDeposit: number;
    usdtMaxWithdrawalDaily: number;
    usdtWithdrawalFeePercent: number;
    usdtDepositsEnabled: boolean;
    usdtWithdrawalsEnabled: boolean;
  };
}

interface WalletStats {
  tung_balance: number;
  usdt_balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_deposited_usdt: number;
  total_withdrawn_usdt: number;
  pending_withdrawals: number;
  pending_withdrawals_usdt: number;
  daily_withdrawn: number;
  daily_withdrawn_usdt: number;
  daily_limit: number;
  daily_limit_usdt: number;
  daily_remaining: number;
  daily_remaining_usdt: number;
  min_amount: number;
  min_amount_usdt: number;
  withdrawal_fee_percent: number;
  withdrawal_fee_percent_usdt: number;
  withdrawal_fee_flat_usd: number;
  usdt_withdrawal_fee_flat: number;
  tung_price_usd: number | null;
  withdrawal_fee_tung: number | null;
  deposits_enabled: boolean;
  withdrawals_enabled: boolean;
  usdt_deposits_enabled: boolean;
  usdt_withdrawals_enabled: boolean;
  swap_enabled: boolean;
  swap_rate: number;
  swap_min_fxu: number;
  swap_min_usdt: number;
  swap_fee_percent: number;
  is_vip: boolean;
  is_admin_wallet: boolean;
  withdrawal_fee_exempt?: boolean;
}

interface Transaction {
  id: string;
  tx_hash: string | null;
  tx_type: 'deposit' | 'withdrawal';
  token_type: 'TUNG' | 'USDT';
  amount: number;
  fxu_amount: number;
  wallet_address: string;
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'cancelled';
  confirmations: number;
  block_number: number | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

interface FxuMovement {
  id: number;
  delta: number;
  balance_after: number | null;
  category: string | null;
  description: string | null;
  is_estimated: boolean;
  created_at: string;
}

type TokenType = 'TUNG' | 'USDT';
type SwapDirection = 'fxu_to_usdt' | 'usdt_to_fxu';

interface TelegramStatus {
  telegram_linked: boolean;
  telegram_username?: string;
  is_member: boolean;
}

export function WalletPage() {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuthStore();
  const navigate = useNavigate();

  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tokenPrice, setTokenPrice] = useState<TokenPrice | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'swap' | 'history' | 'movements'>('deposit');
  const [selectedToken, setSelectedToken] = useState<TokenType>('TUNG');

  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifySuccess, setVerifySuccess] = useState('');

  // HD child-wallet deposit flow
  const [depositAddr, setDepositAddr] = useState('');
  const [depositCfg, setDepositCfg] = useState<{ gasBufferTung: number; gasBufferUsdt: number; sessionMinutes: number } | null>(null);
  const [depositQr, setDepositQr] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [depositExpiresAt, setDepositExpiresAt] = useState<number | null>(null);
  const [depositAutoMsg, setDepositAutoMsg] = useState('');
  const [addrCopied, setAddrCopied] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const seenDepositIdsRef = useRef<Set<string> | null>(null);
  const [showManualVerify, setShowManualVerify] = useState(false);
  // Step 1 of deposit: pick token + amount before revealing the address.
  const [depositToken, setDepositToken] = useState<'TUNG' | 'USDT'>('TUNG');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositStep, setDepositStep] = useState<'form' | 'address'>('form');
  const [depositAmountError, setDepositAmountError] = useState('');

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');
  const [withdrawStep, setWithdrawStep] = useState<'form' | 'code'>('form');
  const [withdrawCode, setWithdrawCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  const [swapDirection, setSwapDirection] = useState<SwapDirection>('fxu_to_usdt');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState('');
  const [swapSuccess, setSwapSuccess] = useState('');

  const [movements, setMovements] = useState<FxuMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const [copied, setCopied] = useState(false);
  const [verifyingTelegram, setVerifyingTelegram] = useState(false);

  const fetchWalletInfo = useCallback(async () => {
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
        setWalletInfo(data);
      }
    } catch (error) {
      console.error('Error fetching wallet info:', error);
    }
  }, []);

  const fetchTokenPrice = useCallback(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-price`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        setTokenPrice(data);
      }
    } catch (error) {
      console.error('Error fetching token price:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_wallet_stats');
      if (error) throw error;
      setStats(data as WalletStats);
    } catch (error) {
      console.error('Error fetching wallet stats:', error);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }, []);

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true);
    try {
      const { data, error } = await supabase
        .from('fxu_ledger')
        .select('id, delta, balance_after, category, description, is_estimated, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(200);
      if (error) throw error;
      setMovements((data || []) as FxuMovement[]);
    } catch (error) {
      console.error('Error fetching movements:', error);
    } finally {
      setLoadingMovements(false);
    }
  }, []);

  const fetchTelegramStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_telegram_task_status');
      if (error) throw error;
      if (data?.success) {
        setTelegramStatus({
          telegram_linked: data.telegram_linked,
          telegram_username: data.telegram_username,
          is_member: data.is_member,
        });
      }
    } catch (error) {
      console.error('Error fetching telegram status:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchWalletInfo(), fetchStats(), fetchTransactions(), fetchTokenPrice(), fetchTelegramStatus()]);
    setLoading(false);
  }, [fetchWalletInfo, fetchStats, fetchTransactions, fetchTokenPrice, fetchTelegramStatus]);

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([fetchWalletInfo(), fetchStats(), fetchTransactions(), refreshProfile(), fetchTelegramStatus()]);
    setRefreshing(false);
  };

  const fetchDepositAddress = useCallback(async () => {
    setDepositLoading(true);
    setDepositError('');
    setDepositAutoMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deposit-address`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      const data = await response.json();
      if (!data.success || !data.address) {
        setDepositError(data.error || t.wallet.depositAddressError);
        return;
      }
      setDepositAddr(data.address);
      setDepositCfg({
        gasBufferTung: data.gasBufferTung ?? 100,
        gasBufferUsdt: data.gasBufferUsdt ?? 0.05,
        sessionMinutes: data.sessionMinutes ?? 30,
      });
      setDepositExpiresAt(Date.now() + (data.sessionMinutes ?? 30) * 60 * 1000);
      try {
        const url = await QRCode.toDataURL(data.address, { margin: 1, width: 220 });
        setDepositQr(url);
      } catch {
        setDepositQr('');
      }
    } catch (error) {
      console.error('Error fetching deposit address:', error);
      setDepositError(t.wallet.depositAddressError);
    } finally {
      setDepositLoading(false);
    }
  }, [t]);

  // Lightweight config-only fetch so the amount preview shows the CURRENT dynamic
  // gas buffer (0.05 USD worth of TUNG) before the user reveals the address.
  const fetchDepositConfig = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deposit-address`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      const data = await response.json();
      if (!data.success) return;
      setDepositCfg({
        gasBufferTung: data.gasBufferTung ?? 100,
        gasBufferUsdt: data.gasBufferUsdt ?? 0.05,
        sessionMinutes: data.sessionMinutes ?? 30,
      });
    } catch {
      /* non-fatal: preview falls back to defaults */
    }
  }, []);


  const handleDepositContinue = () => {
    const amt = parseFloat(depositAmount.replace(',', '.'));
    if (!amt || isNaN(amt) || amt <= 0) {
      setDepositAmountError(t.wallet.depositAmountInvalid);
      return;
    }
    setDepositAmountError('');
    setDepositStep('address');
    const expired = depositExpiresAt && Date.now() > depositExpiresAt;
    if (!depositAddr || expired) fetchDepositAddress();
  };

  const handleDepositBack = () => {
    setDepositStep('form');
  };


  const verifyTelegramMembership = async () => {

    setVerifyingTelegram(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-my-telegram`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (result.success && result.is_member) {
        setTelegramStatus({
          telegram_linked: true,
          telegram_username: result.telegram_username,
          is_member: true,
        });
      } else if (result.telegram_linked && !result.is_member) {
        setTelegramStatus({
          telegram_linked: true,
          telegram_username: result.telegram_username,
          is_member: false,
        });
      }
    } catch (error) {
      console.error('Error verifying telegram:', error);
    } finally {
      setVerifyingTelegram(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 1s ticker to drive the countdown timer while the deposit tab is open.
  useEffect(() => {
    if (activeTab !== 'deposit' || !depositExpiresAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTab, depositExpiresAt]);

  // Poll for incoming deposits every 15s while the session is active.
  useEffect(() => {
    if (activeTab !== 'deposit' || !depositAddr) return;
    if (depositExpiresAt && Date.now() > depositExpiresAt) return;
    const id = setInterval(() => { refreshData(); }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, depositAddr, depositExpiresAt]);

  // Load the deposit config (dynamic gas buffer) as soon as the deposit tab opens
  // so the amount preview reflects the live TUNG-priced buffer, not the fallback.
  useEffect(() => {
    if (activeTab === 'deposit' && !depositCfg) fetchDepositConfig();
  }, [activeTab, depositCfg, fetchDepositConfig]);

  // Detect newly credited deposits and surface a success message.
  useEffect(() => {
    if (!depositAddr) return;
    const confirmedDeposits = transactions.filter(
      (tx) => tx.tx_type === 'deposit' && tx.status === 'confirmed'
    );
    if (seenDepositIdsRef.current === null) {
      seenDepositIdsRef.current = new Set(confirmedDeposits.map((tx) => tx.id));
      return;
    }
    const fresh = confirmedDeposits.find((tx) => !seenDepositIdsRef.current!.has(tx.id));
    if (fresh) {
      confirmedDeposits.forEach((tx) => seenDepositIdsRef.current!.add(tx.id));
      // The stored amount is GROSS (includes the gas buffer). Show the NET amount
      // actually credited to the user's balance (gross - buffer).
      const gross = Number(fresh.fxu_amount ?? fresh.amount) || 0;
      const buffer = fresh.token_type === 'USDT'
        ? (depositCfg?.gasBufferUsdt ?? 0.05)
        : (depositCfg?.gasBufferTung ?? 100);
      const net = Math.max(0, gross - buffer);
      const netStr = Number(net.toFixed(fresh.token_type === 'USDT' ? 2 : 4)).toString();
      setDepositAutoMsg(
        t.wallet.depositAutoCredited
          .replace('{amount}', netStr)
          .replace('{token}', fresh.token_type)
      );
      // Deposit confirmed: return the deposit view to its normal (initial) state
      // instead of leaving the user stuck on the "waiting for deposit" screen.
      setDepositStep('form');
      setDepositAmount('');
      setDepositExpiresAt(null);
      refreshProfile();
      fetchStats();
      fetchTransactions();
    }
  }, [transactions, depositAddr, depositCfg, t, refreshProfile, fetchStats, fetchTransactions]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying:', error);
    }
  };

  const handleVerifyDeposit = async () => {
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      setVerifyError(t.wallet.invalidTxHashMsg);
      return;
    }

    setVerifying(true);
    setVerifyError('');
    setVerifySuccess('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-deposit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ txHash }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setVerifySuccess(t.wallet.depositConfirmedMsg.replace('{amount}', data.amount).replace('{token}', data.tokenType));
        setTxHash('');
        await refreshData();
      } else {
        setVerifyError(data.error || t.wallet.verificationFailedMsg);
      }
    } catch (error) {
      console.error('Error verifying deposit:', error);
      setVerifyError(t.wallet.errorVerifyingMsg);
    } finally {
      setVerifying(false);
    }
  };

  const handleRequestWithdrawCode = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError('Ingresa un monto valido');
      return;
    }

    if (!withdrawAddress || !/^0x[a-fA-F0-9]{40}$/.test(withdrawAddress)) {
      setWithdrawError('Ingresa una direccion BSC valida');
      return;
    }

    const minAmount = selectedToken === 'USDT' ? stats?.min_amount_usdt : stats?.min_amount;
    const dailyRemaining = selectedToken === 'USDT' ? stats?.daily_remaining_usdt : stats?.daily_remaining;
    const balance = selectedToken === 'USDT' ? stats?.usdt_balance : profile?.tung_balance;

    if (minAmount && amount < minAmount) {
      setWithdrawError(`Retiro minimo: ${minAmount} ${selectedToken}`);
      return;
    }

    if (dailyRemaining !== undefined && amount > dailyRemaining) {
      setWithdrawError(`Limite diario excedido. Restante: ${dailyRemaining.toFixed(2)} ${selectedToken}`);
      return;
    }

    if (balance !== undefined && amount > balance) {
      setWithdrawError(`Balance ${selectedToken} insuficiente`);
      return;
    }

    setSendingCode(true);
    setWithdrawError('');
    setWithdrawSuccess('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No autenticado');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-withdrawal-code`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount, wallet_address: withdrawAddress, tokenType: selectedToken }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setWithdrawStep('code');
        setWithdrawCode('');
        setWithdrawSuccess('Enviamos un codigo de 6 digitos a tu correo.');
      } else {
        setWithdrawError(result.error || result.message || 'No se pudo enviar el codigo');
      }
    } catch (error) {
      console.error('Error requesting withdrawal code:', error);
      setWithdrawError(error instanceof Error ? error.message : 'Error al enviar el codigo. Intenta de nuevo.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError('Ingresa un monto valido');
      return;
    }

    if (!/^\d{6}$/.test(withdrawCode.trim())) {
      setWithdrawError('Ingresa el codigo de 6 digitos enviado a tu correo');
      return;
    }

    setWithdrawing(true);
    setWithdrawError('');
    setWithdrawSuccess('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No autenticado');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-withdraw`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount, wallet_address: withdrawAddress, tokenType: selectedToken, code: withdrawCode.trim() }),
        }
      );

      const result = await response.json();

      if (result.success) {
        const sentAmount = typeof result.amount === 'number' ? result.amount.toFixed(2) : amount.toFixed(2);
        const txDisplay = result.txHash ? `TX: ${result.txHash.slice(0, 10)}...` : '';
        setWithdrawSuccess(`Retiro completado! Enviado ${sentAmount} ${selectedToken}. ${txDisplay}`);
        setWithdrawAmount('');
        setWithdrawAddress('');
        setWithdrawCode('');
        setWithdrawStep('form');
        await refreshData();
      } else {
        setWithdrawError(result.error || result.message || 'El retiro fallo');
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      setWithdrawError(error instanceof Error ? error.message : 'Error al procesar el retiro. Intenta de nuevo.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleSwap = async () => {
    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setSwapError('Enter a valid amount');
      return;
    }

    const swapRate = stats?.swap_rate || 10000;
    const minFxu = stats?.swap_min_fxu || 1000;
    const minUsdt = stats?.swap_min_usdt || 0.1;

    if (swapDirection === 'fxu_to_usdt') {
      if (amount < minFxu) {
        setSwapError(`Minimum swap: ${minFxu.toLocaleString()} TUNG`);
        return;
      }
      if ((profile?.tung_balance || 0) < amount) {
        setSwapError('Insufficient TUNG balance');
        return;
      }
    } else {
      if (amount < minUsdt) {
        setSwapError(`Minimum swap: ${minUsdt} USDT`);
        return;
      }
      if ((stats?.usdt_balance || 0) < amount) {
        setSwapError('Insufficient USDT balance');
        return;
      }
    }

    setSwapping(true);
    setSwapError('');
    setSwapSuccess('');

    try {
      const rpcFunction = swapDirection === 'fxu_to_usdt' ? 'swap_fxu_to_usdt' : 'swap_usdt_to_fxu';
      const params = swapDirection === 'fxu_to_usdt'
        ? { p_fxu_amount: amount }
        : { p_usdt_amount: amount };

      const { data, error } = await supabase.rpc(rpcFunction, params);

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string; fxu_spent?: number; usdt_received?: number; usdt_spent?: number; fxu_received?: number };

      if (result.success) {
        if (swapDirection === 'fxu_to_usdt') {
          setSwapSuccess(`Swapped ${result.fxu_spent?.toLocaleString()} TUNG for ${result.usdt_received?.toFixed(4)} USDT`);
        } else {
          setSwapSuccess(`Swapped ${result.usdt_spent?.toFixed(4)} USDT for ${result.fxu_received?.toLocaleString()} TUNG`);
        }
        setSwapAmount('');
        await refreshData();
      } else {
        setSwapError(result.error || 'Swap failed');
      }
    } catch (error) {
      console.error('Error processing swap:', error);
      setSwapError(error instanceof Error ? error.message : 'Error processing swap');
    } finally {
      setSwapping(false);
    }
  };

  const handleCancelWithdrawal = async (txId: string, tokenType: string) => {
    try {
      const rpcFunction = tokenType === 'USDT' ? 'cancel_withdrawal_usdt' : 'cancel_withdrawal';
      const { data, error } = await supabase.rpc(rpcFunction, { p_tx_id: txId });
      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (result.success) {
        await refreshData();
      }
    } catch (error) {
      console.error('Error cancelling withdrawal:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'text-cyber-green';
      case 'pending': return 'text-cyber-yellow';
      case 'processing': return 'text-cyber-blue';
      case 'failed': return 'text-cyber-red';
      case 'cancelled': return 'text-gray-500';
      default: return 'text-white';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-cyber-green/20';
      case 'pending': return 'bg-cyber-yellow/20';
      case 'processing': return 'bg-cyber-blue/20';
      case 'failed': return 'bg-cyber-red/20';
      case 'cancelled': return 'bg-gray-500/20';
      default: return 'bg-space-700';
    }
  };

  const swapRate = stats?.swap_rate || 10000;
  const swapFeePercent = stats?.swap_fee_percent ?? 1;
  const swapFeeRate = swapFeePercent / 100;
  const swapOutputAmount = swapAmount && parseFloat(swapAmount) > 0
    ? swapDirection === 'fxu_to_usdt'
      ? ((parseFloat(swapAmount) / swapRate) * (1 - swapFeeRate)).toFixed(4)
      : ((parseFloat(swapAmount) * swapRate) * (1 - swapFeeRate)).toLocaleString()
    : '0';

  const depositsEnabled = selectedToken === 'USDT' ? stats?.usdt_deposits_enabled : stats?.deposits_enabled;
  const withdrawalsEnabled = selectedToken === 'USDT' ? stats?.usdt_withdrawals_enabled : stats?.withdrawals_enabled;
  // Fee mode: 'flat' (fixed amount) or 'percent'.
  const feeMode = stats?.withdrawal_fee_mode === 'percent' ? 'percent' : 'flat';
  const feePercent = selectedToken === 'USDT'
    ? (stats?.withdrawal_fee_percent_usdt ?? 0)
    : (stats?.withdrawal_fee_percent ?? 0);
  // Flat withdrawal fee: USDT = flat USDT; TUNG = $fee / TUNG price.
  const flatFeeToken = selectedToken === 'USDT'
    ? (stats?.usdt_withdrawal_fee_flat ?? 1)
    : (stats?.withdrawal_fee_tung ?? null);
  const flatFeeUsd = selectedToken === 'USDT'
    ? (stats?.usdt_withdrawal_fee_flat ?? 1)
    : (stats?.withdrawal_fee_flat_usd ?? 1);
  // Actual fee applied for a given amount, respecting the configured mode.
  const computeFee = (amt: number): number | null => {
    if (profile?.is_admin || stats?.withdrawal_fee_exempt) return 0;
    if (feeMode === 'percent') return amt * (feePercent / 100);
    return flatFeeToken; // may be null if TUNG price unavailable
  };
  const minAmount = selectedToken === 'USDT' ? stats?.min_amount_usdt : stats?.min_amount;
  const dailyLimit = selectedToken === 'USDT' ? stats?.daily_limit_usdt : stats?.daily_limit;
  const dailyRemaining = selectedToken === 'USDT' ? stats?.daily_remaining_usdt : stats?.daily_remaining;
  const currentBalance = selectedToken === 'USDT' ? stats?.usdt_balance : profile?.tung_balance;
  const tokenContract = selectedToken === 'USDT' ? walletInfo?.usdtContract : walletInfo?.tokenContract;
  // [VIPWD1] Requisito VIP para retirar (los admins estan exentos, igual que en el backend)
  const isAdminWallet = stats?.is_admin_wallet ?? !!profile?.is_admin;
  const hasVipToWithdraw = !!stats?.is_vip || isAdminWallet;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Wallet className="w-8 h-8 text-cyber-blue" />
          {t.wallet.title}
        </h1>
        <button
          onClick={refreshData}
          disabled={refreshing}
          className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!!tokenPrice?.priceUsd && (
        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyber-green/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-cyber-green" />
              </div>
              <div>
                <p className="text-sm text-gray-400">{tokenPrice.tokenSymbol || 'Token'} {t.wallet.price}</p>
                <p className="font-orbitron text-xl text-white">
                  ${tokenPrice.priceUsd.toFixed(6)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6 text-right">
              {tokenPrice.volume24h && (
                <div>
                  <p className="text-xs text-gray-400">{t.wallet.volume24h}</p>
                  <p className="text-sm text-white">${(tokenPrice.volume24h / 1000).toFixed(1)}K</p>
                </div>
              )}
              {tokenPrice.liquidity && (
                <div>
                  <p className="text-xs text-gray-400">{t.wallet.liquidity}</p>
                  <p className="text-sm text-white">${(tokenPrice.liquidity / 1000).toFixed(1)}K</p>
                </div>
              )}
              {tokenPrice.marketCap && (
                <div>
                  <p className="text-xs text-gray-400">{t.wallet.marketCap}</p>
                  <p className="text-sm text-white">${(tokenPrice.marketCap / 1000).toFixed(1)}K</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-glass p-4 text-center">
          <p className="text-sm text-gray-400">{t.wallet.fxuBalance}</p>
          <img src={TUNG_LOGO} alt="TUNG" className="w-8 h-8 mx-auto mb-2 rounded-full" />
          <p className="font-orbitron text-2xl text-cyber-blue">
            {profile?.tung_balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          {!!tokenPrice?.priceUsd && tokenPrice.priceUsd > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              ≈ ${((profile?.tung_balance || 0) * tokenPrice.priceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD
            </p>
          )}
        </div>
        <div className="card-glass p-4 text-center">
          <p className="text-sm text-gray-400">{t.wallet.totalDepositedFxu}</p>
          <p className="font-orbitron text-xl text-white">
            {stats?.total_deposited.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '0'}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 border-b border-space-600 pb-4">
        <div className="flex gap-2 flex-wrap">
          {(['deposit', 'withdraw', 'movements', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'movements') fetchMovements();
              }}
              className={`px-4 py-3 font-medium transition-colors rounded-lg ${
                activeTab === tab
                  ? tab === 'swap'
                    ? 'bg-gradient-to-r from-cyber-blue/20 to-cyber-green/20 text-white border border-cyber-blue/50'
                    : 'bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/50'
                  : 'text-gray-400 hover:text-white hover:bg-space-700'
              }`}
            >
              {tab === 'deposit' && <ArrowDownToLine className="w-4 h-4 inline mr-2" />}
              {tab === 'withdraw' && <ArrowUpFromLine className="w-4 h-4 inline mr-2" />}
              {tab === 'swap' && <ArrowLeftRight className="w-4 h-4 inline mr-2" />}
              {tab === 'movements' && <Receipt className="w-4 h-4 inline mr-2" />}
              {tab === 'history' && <Clock className="w-4 h-4 inline mr-2" />}
              {tab === 'deposit' ? t.wallet.deposit : tab === 'withdraw' ? t.wallet.withdraw : tab === 'swap' ? t.wallet.exchange : tab === 'movements' ? t.wallet.movements : t.wallet.history}
            </button>
          ))}
        </div>

        {activeTab === 'withdraw' && (
          <div className="flex gap-2 sm:ml-auto">
            <button
              onClick={() => { setSelectedToken('TUNG'); setWithdrawError(''); setWithdrawSuccess(''); }}
              className={`px-4 py-2 font-medium transition-colors rounded-lg ${
                selectedToken === 'TUNG'
                  ? 'bg-cyber-blue text-white'
                  : 'bg-space-700/50 text-gray-400 hover:text-white'
              }`}
            >
              TUNG
            </button>
            <button
              onClick={() => { setSelectedToken('USDT'); setWithdrawError(''); setWithdrawSuccess(''); }}
              className={`px-4 py-2 font-medium transition-colors rounded-lg ${
                selectedToken === 'USDT'
                  ? 'bg-cyber-green text-white'
                  : 'bg-space-700/50 text-gray-400 hover:text-white'
              }`}
            >
              USDT
            </button>
          </div>
        )}
      </div>

      {activeTab === 'deposit' && (
        <div className="card-glass p-6 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-gradient-to-br from-cyber-blue/20 to-cyber-green/20">
              <ArrowDownToLine className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-orbitron text-lg text-white">{t.wallet.depositTitle}</h2>              <p className="text-sm text-gray-400">
                {t.wallet.depositDesc}
              </p>
            </div>
          </div>

          {depositAutoMsg && (
            <div className="p-4 rounded-lg bg-cyber-green/15 border border-cyber-green/40">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 flex-shrink-0 text-cyber-green" />
                <p className="text-cyber-green text-base font-orbitron">{depositAutoMsg}</p>
              </div>
            </div>
          )}

          {(() => {
            const msLeft = depositExpiresAt ? depositExpiresAt - nowTick : 0;
            const expired = !!depositExpiresAt && msLeft <= 0;
            const mm = Math.max(0, Math.floor(msLeft / 60000));
            const ss = Math.max(0, Math.floor((msLeft % 60000) / 1000));
            const timeStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

            const gasBuffer = depositToken === 'TUNG'
              ? (depositCfg?.gasBufferTung ?? 100)
              : (depositCfg?.gasBufferUsdt ?? 0.05);
            const amtNum = parseFloat(depositAmount.replace(',', '.')) || 0;
            const totalToSend = amtNum + gasBuffer;
            const fmtAmt = (n: number) =>
              Number(n.toFixed(depositToken === 'USDT' ? 2 : 4)).toString();

            // Step 1: choose token + amount before revealing the address.
            if (depositStep === 'form') {
              return (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">{t.wallet.depositChooseToken}</label>
                    <div className="grid grid-cols-1 gap-3">
                      {(['TUNG'] as const).map((tk) => (
                        <button
                          key={tk}
                          type="button"
                          onClick={() => setDepositToken(tk)}
                          className={`px-4 py-3 rounded-lg border font-orbitron transition-colors ${
                            depositToken === tk
                              ? 'bg-cyber-blue/20 border-cyber-blue/60 text-white'
                              : 'bg-space-700/40 border-space-600 text-gray-400 hover:text-white'
                          }`}
                        >
                          <span className="block">{tk}</span>
                          <span className={`block mt-0.5 text-[10px] font-sans font-normal leading-tight ${
                            tk === 'TUNG' ? 'text-cyber-green' : 'text-amber-400'
                          }`}>
                            {tk === 'TUNG' ? t.wallet.depositTokenTungTag : t.wallet.depositTokenUsdtTag}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {depositToken === 'TUNG' ? (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-cyber-green/10 border border-cyber-green/30">
                      <CheckCircle className="w-4 h-4 text-cyber-green flex-shrink-0 mt-0.5" />
                      <div className="text-xs leading-relaxed">
                        <p className="font-semibold text-cyber-green mb-0.5">{t.wallet.depositNoticeTungTitle}</p>
                        <p className="text-gray-300">{t.wallet.depositNoticeTungBody}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                          <p className="font-semibold text-amber-400 mb-0.5">{t.wallet.depositNoticeUsdtTitle}</p>
                          <p className="text-gray-300">{t.wallet.depositNoticeUsdtBody}</p>
                          <p className="text-gray-400 mt-1.5">{t.wallet.depositNoticeUsdtHint}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDepositToken('TUNG')}
                        className="mt-2.5 w-full px-3 py-2 rounded-md bg-cyber-green/15 hover:bg-cyber-green/25 border border-cyber-green/40 text-cyber-green text-xs font-semibold transition-colors"
                      >
                        {t.wallet.depositNoticeSwitchToTung}
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">{t.wallet.depositAmountLabel}</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={depositAmount}
                        onChange={(e) => { setDepositAmount(e.target.value); setDepositAmountError(''); }}
                        placeholder="0.00"
                        className="input-cyber w-full pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{depositToken}</span>
                    </div>
                    {depositAmountError && (
                      <p className="text-cyber-red text-xs mt-2">{depositAmountError}</p>
                    )}
                  </div>

                  {amtNum > 0 && (
                    <div className="p-4 rounded-lg bg-cyber-blue/10 border border-cyber-blue/30 space-y-2">
                      <p className="text-sm font-semibold text-cyber-blue">{t.wallet.depositSummaryTitle}</p>
                      <p className="text-3xl font-orbitron text-white break-all">
                        {t.wallet.depositSendExactly
                          .replace('{total}', fmtAmt(totalToSend))
                          .replace('{token}', depositToken)}
                      </p>
                      <p className="text-xs text-gray-300">
                        {t.wallet.depositAmountPlusGas
                          .replace('{amount}', fmtAmt(amtNum))
                          .replace('{buffer}', fmtAmt(gasBuffer))
                          .replace(/\{token\}/g, depositToken)}
                      </p>
                      <p className="text-xs text-cyber-green">
                        {t.wallet.depositWillCredit
                          .replace('{amount}', fmtAmt(amtNum))
                          .replace('{token}', depositToken)}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleDepositContinue}
                    className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-cyber-blue/20 to-cyber-green/20 hover:from-cyber-blue/30 hover:to-cyber-green/30 text-white border border-cyber-blue/50 transition-colors font-orbitron"
                  >
                    {t.wallet.depositContinue}
                  </button>
                </div>
              );
            }

            if (depositLoading && !depositAddr) {
              return (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-8 h-8 text-cyber-blue animate-spin" />
                  <p className="text-sm text-gray-400">{t.wallet.depositGenerating}</p>
                </div>
              );
            }

            if (depositError && !depositAddr) {
              return (
                <div className="space-y-4">
                  <div className="p-3 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
                    <p className="text-cyber-red text-sm">{depositError}</p>
                  </div>
                  <button
                    onClick={fetchDepositAddress}
                    className="w-full px-4 py-3 rounded-lg bg-cyber-blue/20 hover:bg-cyber-blue/30 text-white border border-cyber-blue/50 transition-colors"
                  >
                    {t.wallet.depositGenerateNew}
                  </button>
                </div>
              );
            }

            return (
              <>
                {/* Prominent amount-to-send banner from step 1 */}
                <div className="p-4 rounded-lg bg-gradient-to-r from-cyber-blue/15 to-cyber-green/15 border border-cyber-blue/40 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-cyber-blue">{t.wallet.depositSummaryTitle}</p>
                    <button
                      onClick={handleDepositBack}
                      className="text-xs text-gray-400 hover:text-white transition-colors underline"
                    >
                      {t.wallet.depositChangeAmount}
                    </button>
                  </div>
                  <p className="text-3xl font-orbitron text-white break-all">
                    {t.wallet.depositSendExactly
                      .replace('{total}', fmtAmt(totalToSend))
                      .replace('{token}', depositToken)}
                  </p>
                  <p className="text-xs text-gray-300">
                    {t.wallet.depositAmountPlusGas
                      .replace('{amount}', fmtAmt(amtNum))
                      .replace('{buffer}', fmtAmt(gasBuffer))
                      .replace(/\{token\}/g, depositToken)}
                  </p>
                  <p className="text-xs text-cyber-green">
                    {t.wallet.depositWillCredit
                      .replace('{amount}', fmtAmt(amtNum))
                      .replace('{token}', depositToken)}
                  </p>
                </div>

                <div className="p-4 bg-space-700/50 rounded-lg space-y-4">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-gray-300 text-center">{t.wallet.depositYourAddress}</p>
                    {depositQr ? (
                      <div className={`p-3 bg-white rounded-lg ${expired ? 'opacity-40' : ''}`}>
                        <img src={depositQr} alt="Deposit QR" className="w-44 h-44" />
                      </div>
                    ) : null}
                    <p className="text-xs text-gray-400 text-center">{t.wallet.depositScanQr}</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t.wallet.depositAddress}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={depositAddr || t.wallet.loading}
                        readOnly
                        className="input-cyber flex-1 font-mono text-sm"
                      />
                      <button
                        onClick={() => { copyToClipboard(depositAddr); setAddrCopied(true); setTimeout(() => setAddrCopied(false), 2000); }}
                        disabled={!depositAddr}
                        className="p-3 rounded-lg transition-colors bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue disabled:opacity-50"
                      >
                        {addrCopied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {depositExpiresAt && !expired && (
                    <div className="flex items-center justify-center gap-2 text-sm text-cyber-yellow">
                      <Clock className="w-4 h-4" />
                      <span>{t.wallet.depositSessionExpiresIn.replace('{time}', timeStr)}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">{t.wallet.network}</span>
                      <span className="text-white ml-2">BNB Smart Chain (BSC)</span>
                    </div>
                    <div>
                      <span className="text-gray-400">{t.wallet.tokens}</span>
                      <span className="text-cyber-blue ml-2">{depositToken}</span>
                    </div>
                  </div>
                </div>

                {expired ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-cyber-yellow/10 border border-cyber-yellow/30 rounded-lg">
                      <p className="text-cyber-yellow text-sm">{t.wallet.depositSessionExpired}</p>
                    </div>
                    <button
                      onClick={fetchDepositAddress}
                      className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-cyber-blue/20 to-cyber-green/20 hover:from-cyber-blue/30 hover:to-cyber-green/30 text-white border border-cyber-blue/50 transition-colors"
                    >
                      {t.wallet.depositGenerateNew}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-lg bg-cyber-blue/10 border border-cyber-blue/30">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-cyber-blue" />
                        <div className="text-sm">
                          <p className="font-semibold mb-1 text-cyber-blue">{t.wallet.depositInstructionsTitle}</p>
                          <ul className="text-gray-300 space-y-1 list-disc list-inside">
                            <li>
                              {(depositToken === 'TUNG'
                                ? t.wallet.depositInstructionTung
                                : t.wallet.depositInstructionUsdt
                              ).replace('{buffer}', String(gasBuffer))}
                            </li>
                            <li>{t.wallet.depositGasNote}</li>
                            <li>{t.wallet.waitForConfirmations.replace('{n}', String(walletInfo?.config?.requiredConfirmations || 3))}</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {depositToken === 'USDT' && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                          <p className="font-semibold text-amber-400 mb-0.5">{t.wallet.depositNoticeUsdtTitle}</p>
                          <p className="text-gray-300">{t.wallet.depositNoticeUsdtBody}</p>
                        </div>
                      </div>
                    )}

                    <div className="p-3 bg-space-700/40 border border-space-600 rounded-lg flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-cyber-blue animate-spin" />
                      <p className="text-sm text-gray-300">{t.wallet.depositWaitingAuto}</p>
                    </div>
                  </>
                )}

                {/* Manual verification fallback (advanced) — hidden: deposits are detected automatically */}
                {false && (
                <div className="pt-2 border-t border-space-600">
                  <button
                    onClick={() => setShowManualVerify((v) => !v)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {t.wallet.depositManualTitle}
                  </button>
                  {showManualVerify && (
                    <div className="space-y-4 mt-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">{t.wallet.transactionHash}</label>
                        <input
                          type="text"
                          value={txHash}
                          onChange={(e) => setTxHash(e.target.value)}
                          placeholder="0x..."
                          className="input-cyber w-full font-mono text-sm"
                        />
                      </div>

                      {verifyError && (
                        <div className="p-3 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
                          <p className="text-cyber-red text-sm">{verifyError}</p>
                        </div>
                      )}

                      {verifySuccess && (
                        <div className="p-3 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-cyber-green" />
                            <p className="text-cyber-green text-sm">{verifySuccess}</p>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleVerifyDeposit}
                        disabled={verifying || !txHash}
                        className="w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 bg-gradient-to-r from-cyber-blue/20 to-cyber-green/20 hover:from-cyber-blue/30 hover:to-cyber-green/30 text-white border border-cyber-blue/50"
                      >
                        {verifying ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {t.wallet.verifying}
                          </span>
                        ) : (
                          t.wallet.verifyDeposit
                        )}
                      </button>
                    </div>
                  )}
                </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="card-glass p-6 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-3 rounded-lg ${selectedToken === 'USDT' ? 'bg-cyber-green/20' : 'bg-cyber-orange/20'}`}>
              <ArrowUpFromLine className={`w-6 h-6 ${selectedToken === 'USDT' ? 'text-cyber-green' : 'text-cyber-orange'}`} />
            </div>
            <div>
              <h2 className="font-orbitron text-lg text-white">{t.wallet.withdrawTitle} {selectedToken}</h2>
              <p className="text-sm text-gray-400">
                {t.wallet.withdrawDesc}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-space-700/50 border border-space-600">
            <h3 className="font-medium text-white mb-3 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-cyber-blue" />
              {t.wallet.withdrawalRequirements}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {telegramStatus?.telegram_linked ? (
                    <CheckCircle className="w-5 h-5 text-cyber-green" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-cyber-yellow" />
                  )}
                  <span className="text-sm text-gray-300">{t.wallet.telegramLinked}</span>
                </div>
                {telegramStatus?.telegram_linked ? (
                  <span className="text-sm text-cyber-green">@{telegramStatus.telegram_username}</span>
                ) : (
                  <span className="text-sm text-cyber-yellow">{t.wallet.notLinked}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {telegramStatus?.is_member ? (
                    <CheckCircle className="w-5 h-5 text-cyber-green" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-cyber-yellow" />
                  )}
                  <span className="text-sm text-gray-300">{t.wallet.telegramGroupMember}</span>
                </div>
                {telegramStatus?.is_member ? (
                  <span className="text-sm text-cyber-green">{t.wallet.activeMember}</span>
                ) : (
                  <span className="text-sm text-cyber-yellow">{t.wallet.notMember}</span>
                )}
              </div>
              {/* [VIPWD1] Requisito de suscripcion VIP activa */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {hasVipToWithdraw ? (
                    <CheckCircle className="w-5 h-5 text-cyber-green" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-cyber-yellow" />
                  )}
                  <span className="text-sm text-gray-300">{t.wallet.vipRequirement}</span>
                </div>
                {hasVipToWithdraw ? (
                  <span className="text-sm text-cyber-green">{t.wallet.vipActive}</span>
                ) : (
                  <span className="text-sm text-cyber-yellow">{t.wallet.vipInactive}</span>
                )}
              </div>
            </div>
            {!hasVipToWithdraw && (
              <button
                onClick={() => navigate('/game/vip')}
                className="mt-4 w-full px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Star className="w-4 h-4" />
                {t.wallet.getVipToWithdraw}
              </button>
            )}
            {telegramStatus?.telegram_linked && !telegramStatus?.is_member && (
              <button
                onClick={verifyTelegramMembership}
                disabled={verifyingTelegram}
                className="mt-4 w-full px-4 py-2 bg-cyber-green/20 hover:bg-cyber-green/30 text-cyber-green border border-cyber-green/50 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {verifyingTelegram ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t.wallet.verifyingMembership}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {t.wallet.verifyMyMembership}
                  </>
                )}
              </button>
            )}
            {!telegramStatus?.telegram_linked && (
              <button
                onClick={() => navigate('/game/tasks')}
                className="mt-4 w-full px-4 py-2 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue border border-cyber-blue/50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                {t.wallet.goToTasksTelegram}
              </button>
            )}
          </div>

          {!withdrawalsEnabled && (
            <div className="p-4 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-cyber-red" />
                <p className="text-cyber-red">{t.wallet.withdrawalsDisabled}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-space-700/50 rounded-lg">
              <span className="text-gray-400 block">{t.wallet.available}</span>
              <span className="text-white font-orbitron">{currentBalance?.toFixed(2) || '0'} {selectedToken}</span>
            </div>
            <div className="p-3 bg-space-700/50 rounded-lg">
              <span className="text-gray-400 block">{t.wallet.minAmount}</span>
              <span className="text-white font-orbitron">{minAmount || 1} {selectedToken}</span>
            </div>
            <div className="p-3 bg-space-700/50 rounded-lg">
              <span className="text-gray-400 block">{t.wallet.dailyLimit}</span>
              <span className="text-white font-orbitron">{dailyLimit || 10000} {selectedToken}</span>
            </div>
            <div className="p-3 bg-space-700/50 rounded-lg">
              <span className="text-gray-400 block">{t.wallet.commission}</span>
              <span className="text-white font-orbitron">
                {profile?.is_admin || stats?.withdrawal_fee_exempt
                  ? '0'
                  : feeMode === 'percent'
                    ? `${feePercent}%`
                    : flatFeeToken != null
                      ? `${Number(flatFeeToken.toFixed(selectedToken === 'USDT' ? 2 : 4))} ${selectedToken}`
                      : `${flatFeeUsd} USD`}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">{t.wallet.amount} ({selectedToken})</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value.split('.')[0].replace(/[^\d]/g, ''))}
                  placeholder="0"
                  min={minAmount || 1}
                  max={Math.floor(Math.min(currentBalance || 0, dailyRemaining || 10000))}
                  step="1"
                  className="input-cyber flex-1"
                />
                <button
                  onClick={() => setWithdrawAmount(Math.floor(Math.min(currentBalance || 0, dailyRemaining || 10000)).toString())}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    selectedToken === 'USDT'
                      ? 'bg-cyber-green/20 text-cyber-green hover:bg-cyber-green/30'
                      : 'bg-cyber-blue/20 text-cyber-blue hover:bg-cyber-blue/30'
                  }`}
                >
                  {t.wallet.max}
                </button>
              </div>
              {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  {t.wallet.youWillReceive}{' '}
                  {(() => {
                    const amt = parseFloat(withdrawAmount);
                    const fee = computeFee(amt) ?? 0;
                    const net = Math.max(0, amt - fee);
                    return net.toFixed(selectedToken === 'USDT' ? 2 : 4);
                  })()}{' '}
                  {selectedToken}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">{t.wallet.bscWalletAddress}</label>
              <input
                type="text"
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="0x..."
                className="input-cyber w-full font-mono text-sm"
              />
            </div>

            {withdrawError && (
              <div className="p-3 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
                <p className="text-cyber-red text-sm">{withdrawError}</p>
              </div>
            )}

            {withdrawSuccess && (
              <div className="p-3 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-cyber-green" />
                  <p className="text-cyber-green text-sm">{withdrawSuccess}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleRequestWithdrawCode}
              disabled={sendingCode || withdrawStep === 'code' || !withdrawalsEnabled || !telegramStatus?.telegram_linked || !telegramStatus?.is_member || !hasVipToWithdraw}
              className={`w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 ${
                selectedToken === 'USDT'
                  ? 'bg-cyber-green/20 hover:bg-cyber-green/30 text-cyber-green border border-cyber-green/50'
                  : 'bg-cyber-orange/20 hover:bg-cyber-orange/30 text-cyber-orange border border-cyber-orange/50'
              }`}
            >
              {sendingCode ? (
                <span className="flex items-center justify-center gap-2">
                  <div className={`w-4 h-4 border-2 border-t-current rounded-full animate-spin ${
                    selectedToken === 'USDT' ? 'border-cyber-green/30' : 'border-cyber-orange/30'
                  }`} />
                  Enviando codigo...
                </span>
              ) : !telegramStatus?.telegram_linked || !telegramStatus?.is_member ? (
                t.wallet.completeTelegramFirst
              ) : !hasVipToWithdraw ? (
                t.wallet.vipRequiredFirst
              ) : (
                `${t.wallet.withdrawToken} ${selectedToken}`
              )}
            </button>

            {withdrawStep === 'code' && (
              <div className="space-y-4 p-4 bg-space-800/60 border border-cyber-blue/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-cyber-blue mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-300">
                    Por tu seguridad, cada retiro requiere confirmacion. Introduce el codigo de 6 digitos que enviamos a tu correo.
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Codigo de confirmacion</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={withdrawCode}
                    onChange={(e) => setWithdrawCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="input-cyber w-full text-center tracking-[0.5em] font-orbitron text-xl"
                  />
                </div>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing || withdrawCode.trim().length !== 6}
                  className={`w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 ${
                    selectedToken === 'USDT'
                      ? 'bg-cyber-green/20 hover:bg-cyber-green/30 text-cyber-green border border-cyber-green/50'
                      : 'bg-cyber-orange/20 hover:bg-cyber-orange/30 text-cyber-orange border border-cyber-orange/50'
                  }`}
                >
                  {withdrawing ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className={`w-4 h-4 border-2 border-t-current rounded-full animate-spin ${
                        selectedToken === 'USDT' ? 'border-cyber-green/30' : 'border-cyber-orange/30'
                      }`} />
                      {t.wallet.sending} {selectedToken}...
                    </span>
                  ) : (
                    `Confirmar retiro de ${selectedToken}`
                  )}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleRequestWithdrawCode}
                    disabled={sendingCode}
                    className="flex-1 px-4 py-2 bg-space-700/60 hover:bg-space-700 text-gray-300 border border-space-600 rounded-lg transition-colors disabled:opacity-50 text-sm"
                  >
                    {sendingCode ? 'Reenviando...' : 'Reenviar codigo'}
                  </button>
                  <button
                    onClick={() => { setWithdrawStep('form'); setWithdrawCode(''); setWithdrawError(''); setWithdrawSuccess(''); }}
                    className="flex-1 px-4 py-2 bg-space-700/60 hover:bg-space-700 text-gray-300 border border-space-600 rounded-lg transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'swap' && (
        <div className="card-glass rounded-2xl overflow-hidden max-w-md mx-auto">
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-orbitron text-xl text-white">{t.wallet.exchangeTitle}</h2>
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500 px-2 py-1 bg-space-700/50 rounded">
                  1 USDT = {swapRate.toLocaleString()} TUNG
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-400">{t.wallet.exchangeDesc} {swapFeePercent}% fee.</p>
          </div>

          {!stats?.swap_enabled && (
            <div className="mx-6 mb-4 p-3 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-cyber-red" />
                <p className="text-cyber-red text-sm">{t.wallet.swapDisabled}</p>
              </div>
            </div>
          )}

          <div className="px-6 space-y-2">
            <div className="bg-space-800/80 rounded-xl p-4 border border-space-600/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">{t.wallet.from}</span>
                <span className="text-sm text-gray-400">
                  {t.wallet.balance}: {swapDirection === 'fxu_to_usdt'
                    ? `${(profile?.tung_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG`
                    : `${(stats?.usdt_balance || 0).toFixed(4)} USDT`
                  }
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-2xl text-white font-medium outline-none placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="flex items-center gap-2 bg-space-700 px-3 py-2 rounded-lg">
                  {swapDirection === 'fxu_to_usdt' ? (
                    <>
                      <img
                        src="https://photos.pinksale.finance/file/pinksale-logo-upload/1768287934637-7d493aae390e834e9654df6d97b11a99.jpg"
                        alt="TUNG"
                        className="w-6 h-6 rounded-full"
                      />
                      <span className="text-white font-medium">TUNG</span>
                    </>
                  ) : (
                    <>
                      <div className="w-6 h-6 rounded-full bg-[#26A17B] flex items-center justify-center">
                        <span className="text-white font-bold text-xs">T</span>
                      </div>
                      <span className="text-white font-medium">USDT</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                {[25, 50, 75].map((percent) => (
                  <button
                    key={percent}
                    onClick={() => {
                      const maxAmount = swapDirection === 'fxu_to_usdt'
                        ? profile?.tung_balance || 0
                        : stats?.usdt_balance || 0;
                      setSwapAmount((maxAmount * percent / 100).toString());
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-space-700/80 hover:bg-space-600 text-gray-300 hover:text-white rounded-lg transition-colors border border-space-600/50"
                  >
                    {percent}%
                  </button>
                ))}
                <button
                  onClick={() => {
                    const maxAmount = swapDirection === 'fxu_to_usdt'
                      ? profile?.tung_balance || 0
                      : stats?.usdt_balance || 0;
                    setSwapAmount(maxAmount.toString());
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-space-700/80 hover:bg-space-600 text-gray-300 hover:text-white rounded-lg transition-colors border border-space-600/50"
                >
                  {t.wallet.max}
                </button>
              </div>
            </div>

            <div className="flex justify-center -my-1 relative z-10">
              <button
                onClick={() => {
                  setSwapDirection(swapDirection === 'fxu_to_usdt' ? 'usdt_to_fxu' : 'fxu_to_usdt');
                  setSwapAmount('');
                  setSwapError('');
                  setSwapSuccess('');
                }}
                className="p-2.5 bg-space-700 hover:bg-space-600 border border-space-500 rounded-xl transition-all hover:scale-105 group"
              >
                <svg
                  className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            </div>

            <div className="bg-space-800/80 rounded-xl p-4 border border-space-600/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">{t.wallet.to}</span>
                <span className="text-sm text-gray-400">
                  {t.wallet.balance}: {swapDirection === 'fxu_to_usdt'
                    ? `${(stats?.usdt_balance || 0).toFixed(4)} USDT`
                    : `${(profile?.tung_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG`
                  }
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 text-2xl text-white font-medium">
                  {swapOutputAmount || '0.00'}
                </div>
                <div className="flex items-center gap-2 bg-space-700 px-3 py-2 rounded-lg">
                  {swapDirection === 'fxu_to_usdt' ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-[#26A17B] flex items-center justify-center">
                        <span className="text-white font-bold text-xs">T</span>
                      </div>
                      <span className="text-white font-medium">USDT</span>
                    </>
                  ) : (
                    <>
                      <img
                        src="https://photos.pinksale.finance/file/pinksale-logo-upload/1768287934637-7d493aae390e834e9654df6d97b11a99.jpg"
                        alt="TUNG"
                        className="w-6 h-6 rounded-full"
                      />
                      <span className="text-white font-medium">TUNG</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 pt-4 space-y-3">
            {swapError && (
              <div className="p-3 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
                <p className="text-cyber-red text-sm">{swapError}</p>
              </div>
            )}

            {swapSuccess && (
              <div className="p-3 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-cyber-green" />
                  <p className="text-cyber-green text-sm">{swapSuccess}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleSwap}
              disabled={swapping || !stats?.swap_enabled || !swapAmount || parseFloat(swapAmount) <= 0}
              className="w-full py-4 rounded-xl font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-cyber-blue via-cyber-blue to-cyber-green text-white hover:shadow-lg hover:shadow-cyber-blue/25"
            >
              {swapping ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.wallet.swapping}
                </span>
              ) : !swapAmount || parseFloat(swapAmount) <= 0 ? (
                t.wallet.enterAmount
              ) : (
                t.wallet.swap
              )}
            </button>

            <div className="text-xs text-gray-500 text-center">
              {t.wallet.min}: {swapDirection === 'fxu_to_usdt'
                ? `${(stats?.swap_min_fxu || 1000).toLocaleString()} TUNG`
                : `${stats?.swap_min_usdt || 0.1} USDT`
              }
            </div>
          </div>
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="card-glass p-6">
          <h2 className="font-orbitron text-lg text-white mb-1">{t.wallet.movementsTitle}</h2>
          <p className="text-sm text-gray-400 mb-4">{t.wallet.movementsDesc}</p>

          {loadingMovements ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-cyber-blue animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <p className="text-gray-400 text-center py-8">{t.wallet.noMovementsYet}</p>
          ) : (
            <div className="space-y-2">
              {movements.map((mv) => {
                const isIn = Number(mv.delta) > 0;
                const label =
                  (mv.category && t.wallet.movementCategories[mv.category]) ||
                  mv.category ||
                  (isIn ? t.wallet.depositTx : t.wallet.withdrawalTx);
                return (
                  <div
                    key={mv.id}
                    className={`p-3 rounded-lg border border-space-600 ${
                      isIn ? 'bg-green-500/5' : 'bg-orange-500/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {isIn ? (
                          <ArrowDownToLine className="w-5 h-5 text-cyber-green shrink-0" />
                        ) : (
                          <ArrowUpFromLine className="w-5 h-5 text-amber-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate">{label}</p>
                          {mv.description && (
                            <p className="text-sm text-gray-400 truncate">{mv.description}</p>
                          )}
                          <p className="text-xs text-gray-500">
                            {new Date(mv.created_at).toLocaleString()}
                            {mv.is_estimated && ` · ${t.wallet.movementEstimated}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-orbitron ${isIn ? 'text-cyber-green' : 'text-amber-400'}`}>
                          {isIn ? '+' : ''}
                          {Number(mv.delta).toLocaleString(undefined, { maximumFractionDigits: 2 })} TUNG
                        </p>
                        {mv.balance_after !== null && (
                          <p className="text-xs text-gray-500">
                            {t.wallet.movementBalanceAfter}:{' '}
                            {Number(mv.balance_after).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card-glass p-6">
          <h2 className="font-orbitron text-lg text-white mb-4">{t.wallet.transactionHistory}</h2>

          {transactions.length === 0 ? (
            <p className="text-gray-400 text-center py-8">{t.wallet.noTransactionsYet}</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`p-4 rounded-lg ${getStatusBg(tx.status)} border border-space-600`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {tx.tx_type === 'deposit' ? (
                        <ArrowDownToLine className={`w-5 h-5 ${tx.token_type === 'USDT' ? 'text-cyber-green' : 'text-cyber-blue'}`} />
                      ) : (
                        <ArrowUpFromLine className="w-5 h-5 text-cyber-orange" />
                      )}
                      <div>
                        <p className="text-white font-medium">
                          {tx.tx_type === 'deposit' ? t.wallet.depositTx : t.wallet.withdrawalTx}
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                            tx.token_type === 'USDT' ? 'bg-cyber-green/20 text-cyber-green' : 'bg-cyber-blue/20 text-cyber-blue'
                          }`}>
                            {tx.token_type || 'TUNG'}
                          </span>
                        </p>
                        <p className="text-sm text-gray-400">
                          {new Date(tx.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-orbitron ${
                        tx.tx_type === 'deposit'
                          ? (tx.token_type === 'USDT' ? 'text-cyber-green' : 'text-cyber-blue')
                          : 'text-cyber-orange'
                      }`}>
                        {tx.tx_type === 'deposit' ? '+' : '-'}{tx.fxu_amount.toFixed(2)} {tx.token_type || 'TUNG'}
                      </p>
                      <p className={`text-sm capitalize ${getStatusColor(tx.status)}`}>
                        {tx.status}
                      </p>
                    </div>
                  </div>

                  {tx.tx_hash && (
                    <div className="mt-2 pt-2 border-t border-space-600">
                      <a
                        href={`https://bscscan.com/tx/${tx.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyber-blue hover:underline text-sm flex items-center gap-1"
                      >
                        {tx.tx_hash.slice(0, 10)}...{tx.tx_hash.slice(-8)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {tx.tx_type === 'withdrawal' && tx.status === 'pending' && (
                    <div className="mt-2 pt-2 border-t border-space-600 flex items-center justify-between">
                      <p className="text-sm text-gray-400">
                        {t.wallet.toLabel} {tx.wallet_address.slice(0, 10)}...{tx.wallet_address.slice(-8)}
                      </p>
                      <button
                        onClick={() => handleCancelWithdrawal(tx.id, tx.token_type || 'TUNG')}
                        className="flex items-center gap-1 text-cyber-red hover:text-cyber-red/80 text-sm"
                      >
                        <X className="w-4 h-4" />
                        {t.wallet.cancel}
                      </button>
                    </div>
                  )}

                  {tx.error_message && (
                    <div className="mt-2 pt-2 border-t border-space-600">
                      <p className="text-cyber-red text-sm">{tx.error_message}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

interface PlusPlan {
  id: number;
  name: string;
  code: string;
  duration_months: number;
  duration_days: number | null;
  price_fxu: number;
  price_usdt: number;
  commission_share_percent: number;
}

interface PlusStatus {
  is_plus: boolean;
  plan_name?: string;
  expires_at?: string;
  commission_share?: number;
  total_earned?: number;
}

function PlusSubscriptionSection({ fxuBalance, usdtBalance, onPurchase }: {
  fxuBalance: number;
  usdtBalance: number;
  onPurchase: () => void;
}) {
  const [plans, setPlans] = useState<PlusPlan[]>([]);
  const [plusStatus, setPlusStatus] = useState<PlusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { t, language } = useI18n();

  // Precio de mercado en vivo de TUNG (DexScreener), obtenido del servidor via RPC
  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
  const fetchTungPrice = useCallback(async (): Promise<number | null> => {
    try {
      const { data, error } = await supabase.rpc('get_live_tung_price_usd');
      if (!error && data != null) {
        const price = typeof data === 'number' ? data : parseFloat(data as string);
        if (!isNaN(price) && price > 0) {
          setTungPriceUsd(price);
          return price;
        }
      }
    } catch (e) {
      console.error('Error fetching TUNG price:', e);
    }
    return null;
  }, []);
  // TUNG a cobrar = precio en USDT / precio en vivo (redondeado hacia arriba)
  const tungCostFor = (plan: PlusPlan): number | null =>
    tungPriceUsd && tungPriceUsd > 0 ? Math.ceil(plan.price_usdt / tungPriceUsd) : null;

  const loadData = useCallback(async () => {
    try {
      const [plansRes, statusRes] = await Promise.all([
        supabase.from('plus_plans').select('*').eq('is_active', true).order('duration_months'),
        supabase.rpc('get_plus_status')
      ]);

      if (plansRes.data) setPlans((plansRes.data as PlusPlan[]).filter(p => p.code !== 'plus_weekly'));
      if (statusRes.data) setPlusStatus(statusRes.data as PlusStatus);
    } catch {
      console.error('Error loading Plus data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    fetchTungPrice();
  }, [loadData, fetchTungPrice]);

  const handlePurchase = async (planCode: string) => {
    setPurchasing(`${planCode}-fxu`);
    setMessage(null);

    // Refrescar el precio en vivo justo antes de cobrar (el servidor valida el precio)
    await fetchTungPrice();

    const { data, error } = await supabase.rpc('purchase_plus_subscription', {
      p_plan_code: planCode,
      p_payment_type: 'fxu'
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setMessage({ type: 'success', text: data.message });
      loadData();
      onPurchase();
    } else {
      setMessage({ type: 'error', text: data?.error || t.wallet.unknownError });
    }

    setPurchasing(null);
    setTimeout(() => setMessage(null), 5000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50' : 'bg-red-900/30 border border-red-700/50'}`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            )}
            <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
              {message.text}
            </span>
          </div>
        </div>
      )}

      {plusStatus?.is_plus ? (
        <div className="card-glass p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-xl border border-yellow-500/30">
              <Star className="w-10 h-10 text-yellow-400" />
            </div>
            <div>
              <h2 className="font-orbitron text-xl text-yellow-400">{t.wallet.plusSubscriptionActive}</h2>
              <p className="text-gray-400">{t.wallet.plan} {plusStatus.plan_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-space-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">{t.wallet.expires}</p>
              <p className="font-orbitron text-lg text-white">
                {plusStatus.expires_at ? formatDate(plusStatus.expires_at) : 'N/A'}
              </p>
            </div>
            <div className="bg-space-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">{t.wallet.totalEarned}</p>
              <p className="font-orbitron text-lg text-emerald-400">
                {plusStatus.total_earned?.toLocaleString() || 0} TUNG
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
            <p className="text-sm text-yellow-300">
              {t.wallet.plusPoolInfo}
            </p>
          </div>
        </div>
      ) : (
        <div className="card-glass p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-xl border border-yellow-500/30">
              <Star className="w-10 h-10 text-yellow-400" />
            </div>
            <div>
              <h2 className="font-orbitron text-xl text-white">{t.wallet.plusSubscription}</h2>
              <p className="text-gray-400">{t.wallet.plusSubscriptionDesc}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-gradient-to-br from-space-700/80 to-space-800/80 border border-space-600 rounded-xl p-5 hover:border-yellow-500/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-orbitron text-lg text-white">{plan.name}</h3>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.wallet.duration}</span>
                    <span className="text-white">
                      {plan.duration_days && plan.duration_days > 0
                        ? `${plan.duration_days} ${t.wallet.days}`
                        : `${plan.duration_months} ${plan.duration_months === 1 ? t.wallet.month : t.wallet.months}`
                      }
                    </span>
                  </div>
                </div>

                <div className="border-t border-space-600 pt-4 space-y-2">
                  {(() => {
                    const tungCost = tungCostFor(plan);
                    const insufficient = tungCost != null && fxuBalance < tungCost;
                    return (
                      <button
                        onClick={() => handlePurchase(plan.code)}
                        disabled={purchasing !== null || tungCost == null || insufficient}
                        className="w-full py-2 px-4 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue border border-cyber-blue/50 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                      >
                        {purchasing === `${plan.code}-fxu` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <span>{tungCost != null ? `${tungCost.toLocaleString()} TUNG` : (language === 'es' ? 'Cargando precio…' : 'Loading price…')}</span>
                            <span className="text-xs text-emerald-400">= ${plan.price_usdt} USDT</span>
                            {insufficient && <span className="text-xs text-red-400">({t.wallet.insufficient})</span>}
                          </>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-space-700/50 rounded-lg">
            <h4 className="font-semibold text-white mb-2">{t.wallet.plusBenefitsTitle}:</h4>
            <ul className="space-y-1 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit1}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit2}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit3}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit4}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit7}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit8}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit9}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit10}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit11}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.wallet.plusBenefit12}
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
