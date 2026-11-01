import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
const FXU_TOKEN_CONTRACT = "0x09514EcF8270C12101D077B5e8B034B164F71C5f"; // TUNG
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: config } = await supabase
      .from("wallet_config")
      .select("*")
      .single();

    let depositAddress = config?.deposit_wallet_address || "";

    const privateKey = Deno.env.get("WALLET_PRIVATE_KEY");
    if (privateKey) {
      try {
        let pk = privateKey;
        if (!pk.startsWith("0x")) {
          pk = "0x" + pk;
        }
        const wallet = new ethers.Wallet(pk);
        depositAddress = wallet.address;

        if (config?.deposit_wallet_address !== depositAddress) {
          await supabase
            .from("wallet_config")
            .update({ 
              deposit_wallet_address: depositAddress,
              updated_at: new Date().toISOString()
            })
            .eq("id", 1);
        }
      } catch (e) {
        console.error("Error deriving address from private key:", e);
      }
    }

    if (!depositAddress) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Wallet not configured",
          config: {
            depositsEnabled: false,
            withdrawalsEnabled: false,
            usdtDepositsEnabled: false,
            usdtWithdrawalsEnabled: false,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const fxuContract = new ethers.Contract(FXU_TOKEN_CONTRACT, ERC20_ABI, provider);
    const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, provider);

    let tokenBalance = "0";
    let tokenSymbol = "TOKEN";
    let tokenName = "Unknown Token";
    let tokenDecimals = 18;
    let bnbBalance = "0";
    let usdtBalance = "0";

    try {
      const [balanceWei, symbol, name, decimals, bnbWei, usdtBalanceWei] = await Promise.all([
        fxuContract.balanceOf(depositAddress),
        fxuContract.symbol().catch(() => "TOKEN"),
        fxuContract.name().catch(() => "Unknown Token"),
        fxuContract.decimals().catch(() => 18),
        provider.getBalance(depositAddress),
        usdtContract.balanceOf(depositAddress),
      ]);

      tokenBalance = ethers.formatUnits(balanceWei, decimals);
      tokenSymbol = symbol;
      tokenName = name;
      tokenDecimals = Number(decimals);
      bnbBalance = ethers.formatEther(bnbWei);
      usdtBalance = ethers.formatUnits(usdtBalanceWei, 18);
    } catch (error) {
      console.error("Error fetching balances:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        depositAddress,
        tokenContract: FXU_TOKEN_CONTRACT,
        usdtContract: USDT_CONTRACT,
        tokenSymbol,
        tokenName,
        tokenDecimals,
        tokenBalance,
        usdtBalance,
        bnbBalance,
        config: {
          minDeposit: config?.min_deposit || 1,
          maxWithdrawalDaily: config?.max_withdrawal_daily || 10000,
          withdrawalFeePercent: config?.withdrawal_fee_percent || 2,
          requiredConfirmations: config?.required_confirmations || 3,
          depositsEnabled: config?.is_deposits_enabled ?? true,
          withdrawalsEnabled: config?.is_withdrawals_enabled ?? true,
          usdtMinDeposit: config?.usdt_min_deposit || 1,
          usdtMaxWithdrawalDaily: config?.usdt_max_withdrawal_daily || 10000,
          usdtWithdrawalFeePercent: config?.usdt_withdrawal_fee_percent || 2,
          usdtDepositsEnabled: config?.is_usdt_deposits_enabled ?? true,
          usdtWithdrawalsEnabled: config?.is_usdt_withdrawals_enabled ?? true,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in wallet-info:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: "Failed to fetch wallet info",
        config: {
          depositsEnabled: false,
          withdrawalsEnabled: false,
          usdtDepositsEnabled: false,
          usdtWithdrawalsEnabled: false,
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});