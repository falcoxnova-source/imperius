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
const BSCSCAN_API_URL = "https://api.bscscan.com/api";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface TransferLog {
  from: string;
  to: string;
  value: bigint;
  tokenContract: string;
}

function decodeTransferLog(log: { address: string; topics: string[]; data: string }): TransferLog | null {
  if (log.topics[0] !== ERC20_TRANSFER_TOPIC || log.topics.length < 3) {
    return null;
  }
  const from = "0x" + log.topics[1].slice(26);
  const to = "0x" + log.topics[2].slice(26);
  const value = BigInt(log.data);
  return { from, to, value, tokenContract: log.address };
}

async function verifyWithBscscan(txHash: string, apiKey: string): Promise<{
  verified: boolean;
  status?: string;
  blockNumber?: number;
  confirmations?: number;
  from?: string;
  to?: string;
  error?: string;
}> {
  try {
    const url = `${BSCSCAN_API_URL}?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "1" && data.result?.status === "1") {
      const txUrl = `${BSCSCAN_API_URL}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
      const txResponse = await fetch(txUrl);
      const txData = await txResponse.json();

      if (txData.result) {
        const blockUrl = `${BSCSCAN_API_URL}?module=proxy&action=eth_blockNumber&apikey=${apiKey}`;
        const blockResponse = await fetch(blockUrl);
        const blockData = await blockResponse.json();
        const currentBlock = parseInt(blockData.result, 16);
        const txBlock = parseInt(txData.result.blockNumber, 16);

        return {
          verified: true,
          status: "success",
          blockNumber: txBlock,
          confirmations: currentBlock - txBlock,
          from: txData.result.from,
          to: txData.result.to,
        };
      }
    }

    return {
      verified: false,
      status: "failed",
      error: "Transaction not successful or not found",
    };
  } catch (error) {
    console.error("BSCScan verification error:", error);
    return {
      verified: false,
      error: error instanceof Error ? error.message : "BSCScan API error",
    };
  }
}

async function getTransactionReceipt(txHash: string) {
  const response = await fetch(BSC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txHash],
      id: 1,
    }),
  });
  const data = await response.json();
  return data.result;
}

async function getBlockNumber(): Promise<number> {
  const response = await fetch(BSC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1,
    }),
  });
  const data = await response.json();
  return parseInt(data.result, 16);
}

interface DetectedDeposit {
  tokenType: 'TUNG' | 'USDT';
  tokenContract: string;
  amount: bigint;
  senderAddress: string;
}

function detectTokenDeposit(
  logs: Array<{ address: string; topics: string[]; data: string }>,
  depositWallet: string
): DetectedDeposit | null {
  for (const log of logs) {
    const logAddress = log.address.toLowerCase();

    const isFXU = logAddress === FXU_TOKEN_CONTRACT.toLowerCase();
    const isUSDT = logAddress === USDT_CONTRACT.toLowerCase();

    if (!isFXU && !isUSDT) continue;

    const transfer = decodeTransferLog(log);
    if (transfer && transfer.to.toLowerCase() === depositWallet) {
      return {
        tokenType: isUSDT ? 'USDT' : 'TUNG',
        tokenContract: log.address,
        amount: transfer.value,
        senderAddress: transfer.from.toLowerCase(),
      };
    }
  }

  return null;
}

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

    const { txHash } = await req.json();
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid transaction hash" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingTx } = await supabase
      .from("wallet_transactions")
      .select("id, status, user_id")
      .eq("tx_hash", txHash.toLowerCase())
      .maybeSingle();

    if (existingTx) {
      if (existingTx.status === "confirmed") {
        return new Response(
          JSON.stringify({ success: false, error: "Transaction already processed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (existingTx.user_id !== user.id) {
        return new Response(
          JSON.stringify({ success: false, error: "Transaction belongs to another user" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const bscscanApiKey = Deno.env.get("BSCSCAN_API_KEY") || "MBJENV8K3C1HCGGEWD2YUHVG3XZW5CKKFZ";
    const bscscanResult = await verifyWithBscscan(txHash, bscscanApiKey);

    console.log("BSCScan verification result:", bscscanResult);

    const receipt = await getTransactionReceipt(txHash);
    if (!receipt) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction not found on blockchain",
          bscscanVerified: bscscanResult.verified,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (receipt.status !== "0x1") {
      return new Response(
        JSON.stringify({ success: false, error: "Transaction failed on blockchain" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: config } = await supabase
      .from("wallet_config")
      .select("*")
      .single();

    const requiredConfirmations = config?.required_confirmations || 3;
    const currentBlock = await getBlockNumber();
    const txBlock = parseInt(receipt.blockNumber, 16);
    const confirmations = currentBlock - txBlock;

    if (confirmations < requiredConfirmations) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Waiting for confirmations: ${confirmations}/${requiredConfirmations}`,
          confirmations,
          required: requiredConfirmations,
          bscscanVerified: bscscanResult.verified,
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const depositWallet = config?.deposit_wallet_address?.toLowerCase();
    if (!depositWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Deposit wallet not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const detectedDeposit = detectTokenDeposit(receipt.logs, depositWallet);

    if (!detectedDeposit) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No valid FXU or USDT transfer to deposit wallet found in this transaction"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tokenType, tokenContract, amount: depositAmount, senderAddress } = detectedDeposit;
    const isUSDT = tokenType === 'USDT';

    const depositsEnabled = isUSDT ? config?.is_usdt_deposits_enabled : config?.is_deposits_enabled;
    if (!depositsEnabled) {
      return new Response(
        JSON.stringify({ success: false, error: `${tokenType} deposits are currently disabled` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingWalletOwner } = await supabase
      .from("user_wallets")
      .select("user_id")
      .eq("wallet_address", senderAddress)
      .maybeSingle();

    if (existingWalletOwner && existingWalletOwner.user_id !== user.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "This sender wallet is registered to another account"
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const tokenContractInstance = new ethers.Contract(tokenContract, ERC20_ABI, provider);

    let tokenDecimals = 18;
    try {
      tokenDecimals = Number(await tokenContractInstance.decimals());
    } catch (e) {
      console.warn("Could not fetch decimals, using 18");
    }

    const amountInTokens = Number(depositAmount) / Math.pow(10, tokenDecimals);

    const minDeposit = isUSDT ? (config?.usdt_min_deposit || 1) : (config?.min_deposit || 0);
    if (amountInTokens < minDeposit) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Deposit amount (${amountInTokens}) is below minimum (${minDeposit} ${tokenType})`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existingWalletOwner) {
      await supabase
        .from("user_wallets")
        .insert({
          user_id: user.id,
          wallet_address: senderAddress,
          label: "Deposit Wallet",
        });
    }

    const confirmFunction = isUSDT ? "confirm_deposit_usdt" : "confirm_deposit";
    const { data: result, error } = await supabase.rpc(confirmFunction, {
      p_tx_hash: txHash.toLowerCase(),
      p_user_id: user.id,
      p_amount: amountInTokens,
      p_block_number: txBlock,
      p_confirmations: confirmations,
    });

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        amount: amountInTokens,
        tokenType,
        confirmations,
        blockNumber: txBlock,
        senderAddress,
        bscscanVerified: bscscanResult.verified,
        message: `Deposit of ${amountInTokens} ${tokenType} confirmed`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying deposit:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
