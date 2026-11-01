import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
const TOKEN_CONTRACT = "0xd19C01DE3C379441c3F4e8af442E10a3EE440CdE";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

Deno.serve(async (req: Request) => {
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

    let privateKey = Deno.env.get("WALLET_PRIVATE_KEY");
    if (!privateKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server wallet not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!privateKey.startsWith("0x")) {
      privateKey = "0x" + privateKey;
    }

    let body: { tx_id?: string } = {};
    try {
      body = await req.json();
    } catch {
    }

    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: config } = await supabase
      .from("wallet_config")
      .select("is_withdrawals_enabled")
      .single();

    if (!config?.is_withdrawals_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "Withdrawals are disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabase
      .from("wallet_transactions")
      .select("*")
      .eq("tx_type", "withdrawal")
      .eq("status", "pending");

    if (body.tx_id) {
      query = query.eq("id", body.tx_id);
    } else {
      query = query.order("created_at", { ascending: true }).limit(10);
    }

    const { data: pendingWithdrawals, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pendingWithdrawals || pendingWithdrawals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending withdrawals", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    const tokenContract = new ethers.Contract(TOKEN_CONTRACT, ERC20_ABI, wallet);

    console.log("Server wallet address:", wallet.address);

    const decimals = await tokenContract.decimals();

    const results: { txId: string; status: string; txHash?: string; error?: string }[] = [];

    for (const withdrawal of pendingWithdrawals) {
      try {
        if (!withdrawal.wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(withdrawal.wallet_address)) {
          await supabase.rpc("fail_withdrawal", {
            p_tx_id: withdrawal.id,
            p_error_message: "Invalid wallet address",
          });
          results.push({ txId: withdrawal.id, status: "failed", error: "Invalid wallet address" });
          continue;
        }

        const currentBalance = await tokenContract.balanceOf(wallet.address);
        const amountWei = ethers.parseUnits(withdrawal.amount.toString(), decimals);

        console.log("Processing withdrawal:", withdrawal.id, "amount:", withdrawal.amount);

        if (currentBalance < amountWei) {
          await supabase.rpc("fail_withdrawal", {
            p_tx_id: withdrawal.id,
            p_error_message: "Insufficient token balance",
          });
          results.push({ txId: withdrawal.id, status: "failed", error: "Insufficient balance" });
          continue;
        }

        const bnbBalance = await provider.getBalance(wallet.address);
        if (bnbBalance < ethers.parseEther("0.001")) {
          await supabase.rpc("fail_withdrawal", {
            p_tx_id: withdrawal.id,
            p_error_message: "Insufficient BNB for gas",
          });
          results.push({ txId: withdrawal.id, status: "failed", error: "Insufficient BNB" });
          continue;
        }

        await supabase
          .from("wallet_transactions")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", withdrawal.id);

        const gasPrice = await provider.getFeeData();
        const tx = await tokenContract.transfer(withdrawal.wallet_address, amountWei, {
          gasLimit: 100000n,
          gasPrice: gasPrice.gasPrice,
        });

        console.log("Transaction sent:", tx.hash);

        const receipt = await tx.wait(1);

        if (receipt && receipt.status === 1) {
          await supabase.rpc("complete_withdrawal", {
            p_tx_id: withdrawal.id,
            p_tx_hash: receipt.hash,
            p_block_number: Number(receipt.blockNumber),
          });
          results.push({ txId: withdrawal.id, status: "confirmed", txHash: receipt.hash });
        } else {
          await supabase.rpc("fail_withdrawal", {
            p_tx_id: withdrawal.id,
            p_error_message: "Transaction reverted",
          });
          results.push({ txId: withdrawal.id, status: "failed", error: "Transaction reverted" });
        }
      } catch (error) {
        console.error(`Error processing ${withdrawal.id}:`, error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        await supabase.rpc("fail_withdrawal", {
          p_tx_id: withdrawal.id,
          p_error_message: errorMsg,
        });
        results.push({ txId: withdrawal.id, status: "failed", error: errorMsg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in process-withdrawal:", error);
    const errorMsg = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
