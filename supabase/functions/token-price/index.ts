import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TOKEN_CONTRACT = "0x09514EcF8270C12101D077B5e8B034B164F71C5f"; // TUNG

// Simple in-memory cache: stores result + timestamp
let cachedData: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

// Persist the live price into game_settings (server-side source of truth) so that
// purchase RPCs can charge dynamic TUNG amounts without trusting the client.
// Uses the service role (bypasses RLS); the client can NEVER set this value.
async function persistLivePrice(priceUsd: number | null): Promise<void> {
  if (priceUsd === null || !isFinite(priceUsd) || priceUsd <= 0) return;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await admin.rpc("set_live_tung_price", { p_price: priceUsd });
  } catch (e) {
    console.error("Failed to persist live TUNG price:", e);
  }
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
  };
  liquidity: {
    usd: number;
  };
  fdv: number;
  marketCap: number;
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Return cached data if still fresh (< 60 seconds old)
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_TTL_MS) {
      // Keep the server-side price fresh even on cache hits.
      await persistLivePrice(cachedData.data?.priceUsd ?? null);
      return new Response(JSON.stringify(cachedData.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_CONTRACT}`;
    
    const response = await fetch(dexScreenerUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }

    const data: DexScreenerResponse = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          tokenAddress: TOKEN_CONTRACT,
          priceUsd: null,
          priceNative: null,
          volume24h: null,
          liquidity: null,
          marketCap: null,
          message: "Token not found on DexScreener - may not be listed yet",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bestPair = data.pairs.reduce((best, current) => {
      const currentLiquidity = current.liquidity?.usd || 0;
      const bestLiquidity = best.liquidity?.usd || 0;
      return currentLiquidity > bestLiquidity ? current : best;
    }, data.pairs[0]);

    const resultData = {
      success: true,
      tokenAddress: TOKEN_CONTRACT,
      tokenName: bestPair.baseToken.name,
      tokenSymbol: bestPair.baseToken.symbol,
      priceUsd: bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : null,
      priceNative: bestPair.priceNative ? parseFloat(bestPair.priceNative) : null,
      volume24h: bestPair.volume?.h24 || null,
      liquidity: bestPair.liquidity?.usd || null,
      marketCap: bestPair.marketCap || null,
      fdv: bestPair.fdv || null,
      dex: bestPair.dexId,
      pairAddress: bestPair.pairAddress,
      transactions24h: bestPair.txns?.h24 || null,
      allPairs: data.pairs.map((p: any) => ({
        dex: p.dexId,
        pairAddress: p.pairAddress,
        priceUsd: p.priceUsd,
        liquidity: p.liquidity?.usd,
      })),
    };
    cachedData = { data: resultData, timestamp: Date.now() };

    // Store the fresh price server-side for purchase RPCs.
    await persistLivePrice(resultData.priceUsd);

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching token price:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch token price",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
