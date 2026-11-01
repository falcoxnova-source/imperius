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

const TOKEN_CONTRACT = "0xd19C01DE3C379441c3F4e8af442E10a3EE440CdE";

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
  console.log("process-admin-withdrawal function called", req.method);

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

    let body: { withdrawal_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { withdrawal_id } = body;
    console.log("Processing admin withdrawal:", withdrawal_id);

    if (!withdrawal_id) {
      return new Response(
        JSON.stringify({ success: false, error: "withdrawal_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let privateKey = Deno.env.get("WALLET_PRIVATE_KEY");
    if (!privateKey) {
      console.error("WALLET_PRIVATE_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Server wallet not configured" }),
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

    const { data: profile, error: profileError } = await serviceSupabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return new Response(
        JSON.stringify({ success: false, error: "Only admin can use this function" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: withdrawal, error: withdrawalError } = await serviceSupabase
      .from("admin_withdrawals")
      .select("*")
      .eq("id", withdrawal_id)
      .eq("admin_id", user.id)
      .eq("status", "pending")
      .single();

    if (withdrawalError || !withdrawal) {
      return new Response(
        JSON.stringify({ success: false, error: "Withdrawal not found or already processed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found withdrawal:", withdrawal.amount, "to", withdrawal.wallet_address);

    await serviceSupabase
      .from("admin_withdrawals")
      .update({ status: "processing" })
      .eq("id", withdrawal_id);

    try {
      const provider = await getWorkingProvider();
      const wallet = new ethers.Wallet(privateKey, provider);
      const tokenContract = new ethers.Contract(TOKEN_CONTRACT, ERC20_ABI, wallet);

      console.log("Server wallet address:", wallet.address);

      const decimals = await tokenContract.decimals();
      const amountWei = ethers.parseUnits(withdrawal.amount.toString(), decimals);

      const currentBalance = await tokenContract.balanceOf(wallet.address);
      console.log("Token balance:", ethers.formatUnits(currentBalance, decimals));

      if (currentBalance < amountWei) {
        await serviceSupabase
          .from("admin_withdrawals")
          .update({ status: "failed" })
          .eq("id", withdrawal_id);

        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient token balance. Available: ${ethers.formatUnits(currentBalance, decimals)}`
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const bnbBalance = await provider.getBalance(wallet.address);
      console.log("BNB balance:", ethers.formatEther(bnbBalance));

      if (bnbBalance < ethers.parseEther("0.0005")) {
        await serviceSupabase
          .from("admin_withdrawals")
          .update({ status: "failed" })
          .eq("id", withdrawal_id);

        return new Response(
          JSON.stringify({ success: false, error: "Insufficient BNB for gas" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Sending", withdrawal.amount, "tokens to", withdrawal.wallet_address);

      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ? feeData.gasPrice * 110n / 100n : ethers.parseUnits("3", "gwei");

      const tx = await tokenContract.transfer(withdrawal.wallet_address, amountWei, {
        gasLimit: 100000n,
        gasPrice: gasPrice,
      });

      console.log("Transaction sent:", tx.hash);

      await serviceSupabase
        .from("admin_withdrawals")
        .update({ tx_hash: tx.hash })
        .eq("id", withdrawal_id);

      console.log("Waiting for confirmation...");
      const receipt = await tx.wait(2);
      console.log("Transaction confirmed:", receipt?.hash, "status:", receipt?.status);

      if (receipt && receipt.status === 1) {
        await serviceSupabase
          .from("admin_withdrawals")
          .update({
            status: "confirmed",
            tx_hash: receipt.hash,
            processed_at: new Date().toISOString(),
          })
          .eq("id", withdrawal_id);

        return new Response(
          JSON.stringify({
            success: true,
            amount: withdrawal.amount,
            txHash: receipt.hash,
            blockNumber: Number(receipt.blockNumber),
            message: "Admin withdrawal completed successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        await serviceSupabase
          .from("admin_withdrawals")
          .update({ status: "failed" })
          .eq("id", withdrawal_id);

        return new Response(
          JSON.stringify({ success: false, error: "Transaction reverted" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (blockchainError: unknown) {
      console.error("Blockchain error:", blockchainError);

      await serviceSupabase
        .from("admin_withdrawals")
        .update({ status: "failed" })
        .eq("id", withdrawal_id);

      const errorMessage = blockchainError instanceof Error ? blockchainError.message : "Unknown error";
      return new Response(
        JSON.stringify({ success: false, error: `Blockchain error: ${errorMessage}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error in process-admin-withdrawal:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
