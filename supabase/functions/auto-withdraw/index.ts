import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BSC_RPC_URLS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed4.binance.org",
];

const FXU_TOKEN_CONTRACT = "0x09514EcF8270C12101D077B5e8B034B164F71C5f"; // TUNG
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function getWorkingProvider(): Promise<ethers.JsonRpcProvider> {
  for (const rpcUrl of BSC_RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      await provider.getBlockNumber();
      console.log("Using RPC:", rpcUrl);
      return provider;
    } catch (e) {
      console.log("RPC failed:", rpcUrl);
    }
  }
  throw new Error("All BSC RPC endpoints failed");
}

Deno.serve(async (req: Request) => {
  console.log("auto-withdraw function called", req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: { amount?: number; wallet_address?: string; tokenType?: string } = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { amount, wallet_address, tokenType } = body;
    const isUSDT = tokenType === 'USDT';
    console.log("Withdrawal request:", { amount, wallet_address, tokenType: isUSDT ? 'USDT' : 'TUNG' });

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid wallet address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let privateKey = Deno.env.get("WALLET_PRIVATE_KEY");
    if (!privateKey) {
      console.error("WALLET_PRIVATE_KEY not configured in environment");
      return new Response(
        JSON.stringify({ success: false, error: "Server wallet not configured. Contact administrator to set WALLET_PRIVATE_KEY." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!privateKey.startsWith("0x")) {
      privateKey = "0x" + privateKey;
    }

    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("Authenticated user:", user.id);

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: config, error: configError } = await serviceSupabase
      .from("wallet_config")
      .select("*")
      .single();

    if (configError || !config) {
      console.error("Error fetching wallet config:", configError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load wallet configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const withdrawalsEnabled = isUSDT ? config.is_usdt_withdrawals_enabled : config.is_withdrawals_enabled;
    if (!withdrawalsEnabled) {
      return new Response(
        JSON.stringify({ success: false, error: `${isUSDT ? 'USDT' : 'TUNG'} withdrawals are currently disabled` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const withdrawFunction = isUSDT ? "request_withdrawal_usdt" : "request_withdrawal";
    console.log(`Calling ${withdrawFunction} with user session...`);
    const { data: withdrawalResult, error: withdrawalError } = await userSupabase.rpc(
      withdrawFunction,
      { p_amount: amount, p_wallet_address: wallet_address }
    );

    if (withdrawalError) {
      console.error("request_withdrawal error:", withdrawalError);
      return new Response(
        JSON.stringify({ success: false, error: withdrawalError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Withdrawal result:", withdrawalResult);

    if (!withdrawalResult?.success) {
      return new Response(
        JSON.stringify({ success: false, error: withdrawalResult?.error || "Failed to create withdrawal request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const txId = withdrawalResult.transaction_id;
    const netAmount = withdrawalResult.amount;
    console.log("Transaction created:", txId, "Net amount:", netAmount);

    const TOKEN_CONTRACT = isUSDT ? USDT_CONTRACT : FXU_TOKEN_CONTRACT;
    const failFunction = isUSDT ? "fail_withdrawal_usdt" : "fail_withdrawal";

    try {
      await serviceSupabase
        .from("wallet_transactions")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", txId);

      const provider = await getWorkingProvider();
      const wallet = new ethers.Wallet(privateKey, provider);
      const tokenContract = new ethers.Contract(TOKEN_CONTRACT, ERC20_ABI, wallet);

      console.log("Server wallet address:", wallet.address);
      console.log("Token contract:", TOKEN_CONTRACT);

      const decimals = await tokenContract.decimals();
      const amountWei = ethers.parseUnits(netAmount.toString(), decimals);

      console.log("Checking balance for amount:", netAmount, "decimals:", decimals);

      const currentBalance = await tokenContract.balanceOf(wallet.address);
      console.log("Current token balance:", ethers.formatUnits(currentBalance, decimals));

      if (currentBalance < amountWei) {
        const availableBalance = ethers.formatUnits(currentBalance, decimals);
        console.error("Insufficient balance:", availableBalance, "<", netAmount);
        await serviceSupabase.rpc(failFunction, {
          p_tx_id: txId,
          p_error_message: `Insufficient ${isUSDT ? 'USDT' : 'token'} balance: ${availableBalance} available, ${netAmount} needed`,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: `Server wallet has insufficient ${isUSDT ? 'USDT' : 'tokens'}. Available: ${availableBalance}, needed: ${netAmount}. Your balance has been refunded.`
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const bnbBalance = await provider.getBalance(wallet.address);
      console.log("BNB balance for gas:", ethers.formatEther(bnbBalance));

      if (bnbBalance < ethers.parseEther("0.0005")) {
        await serviceSupabase.rpc(failFunction, {
          p_tx_id: txId,
          p_error_message: "Insufficient BNB for gas fees",
        });
        return new Response(
          JSON.stringify({ success: false, error: "Server wallet has insufficient BNB for gas. Your balance has been refunded." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Sending", netAmount, isUSDT ? 'USDT' : 'tokens', "to", wallet_address);

      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ? feeData.gasPrice * 110n / 100n : ethers.parseUnits("3", "gwei");

      console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");

      const tx = await tokenContract.transfer(wallet_address, amountWei, {
        gasLimit: 100000n,
        gasPrice: gasPrice,
      });

      console.log("Transaction sent:", tx.hash);

      await serviceSupabase
        .from("wallet_transactions")
        .update({
          tx_hash: tx.hash,
          updated_at: new Date().toISOString()
        })
        .eq("id", txId);

      console.log("Waiting for confirmation...");
      const receipt = await tx.wait(2);
      console.log("Transaction confirmed:", receipt?.hash, "status:", receipt?.status);

      if (receipt && receipt.status === 1) {
        await serviceSupabase.rpc("complete_withdrawal", {
          p_tx_id: txId,
          p_tx_hash: receipt.hash,
          p_block_number: Number(receipt.blockNumber),
        });

        return new Response(
          JSON.stringify({
            success: true,
            amount: netAmount,
            tokenType: isUSDT ? 'USDT' : 'TUNG',
            txHash: receipt.hash,
            blockNumber: Number(receipt.blockNumber),
            message: `Withdrawal of ${netAmount} ${isUSDT ? 'USDT' : 'tokens'} completed successfully`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        await serviceSupabase.rpc(failFunction, {
          p_tx_id: txId,
          p_error_message: "Transaction reverted - likely insufficient token balance in server wallet",
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: "Transaction reverted. This usually means the server wallet doesn't have enough tokens. Your balance has been refunded."
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (blockchainError: unknown) {
      console.error("Blockchain error:", blockchainError);

      const errorMessage = blockchainError instanceof Error ? blockchainError.message : "Unknown blockchain error";

      await serviceSupabase.rpc(failFunction, {
        p_tx_id: txId,
        p_error_message: errorMessage,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: `Blockchain error: ${errorMessage}. Your balance has been refunded.`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error in auto-withdraw:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});