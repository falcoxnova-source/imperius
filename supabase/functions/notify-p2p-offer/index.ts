import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface P2POfferPayload {
  offer_id: string;
  seller_username: string;
  side: "sell" | "buy";
  asset: "FXU" | "USDT";
  fiat_currency: string;
  price_per_unit: number;
  available_amount: number;
  min_trade_amount: number;
  max_trade_amount: number | null;
  payment_methods?: string[];
}

function escapeMd(text: string): string {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function buildMessage(p: P2POfferPayload): string {
  const isSell = p.side === "sell";
  const header = isSell ? "🟢 Nueva oferta de VENTA" : "🔵 Nueva oferta de COMPRA";
  const actionLabel = isSell ? "comprar" : "vender";
  const assetEmoji = p.asset === "FXU" ? "🪙" : "💵";

  const limits =
    p.max_trade_amount && p.max_trade_amount > p.min_trade_amount
      ? `${fmt(p.min_trade_amount)} – ${fmt(p.max_trade_amount)} ${p.asset}`
      : `desde ${fmt(p.min_trade_amount)} ${p.asset}`;

  const methods =
    p.payment_methods && p.payment_methods.length
      ? p.payment_methods.slice(0, 4).join(", ")
      : p.fiat_currency;

  const lines = [
    `${header}`,
    ``,
    `${assetEmoji} *${escapeMd(p.asset)}* / *${escapeMd(p.fiat_currency)}*`,
    `💱 Precio: *${escapeMd(fmt(p.price_per_unit))} ${escapeMd(p.fiat_currency)}* por ${escapeMd(p.asset)}`,
    `📦 Disponible: *${escapeMd(fmt(p.available_amount))} ${escapeMd(p.asset)}*`,
    `🎯 Límites: ${escapeMd(limits)}`,
    `💳 Pago: ${escapeMd(methods)}`,
    ``,
    `👤 Trader: *${escapeMd(p.seller_username)}*`,
    ``,
    `🎮 Entra al Mercado P2P de Falco\\-X para ${escapeMd(actionLabel)}\\.`,
  ];
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Bot token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload: P2POfferPayload = await req.json();
    if (!payload.offer_id || !payload.asset || !payload.fiat_currency) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: groups } = await admin
      .from("telegram_groups")
      .select("id, chat_id, title")
      .eq("is_enabled", true);

    if (!groups || groups.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No groups to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const message = buildMessage(payload);
    let ok = 0;
    let fail = 0;

    for (const g of groups) {
      try {
        const r = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: g.chat_id,
              text: message,
              parse_mode: "MarkdownV2",
              disable_web_page_preview: true,
            }),
          },
        );
        const j = await r.json();
        if (j.ok) ok++;
        else {
          console.error("Telegram error:", g.title, j);
          fail++;
        }
      } catch (e) {
        console.error("send error:", g.title, e);
        fail++;
      }
      await new Promise((res) => setTimeout(res, 60));
    }

    return new Response(
      JSON.stringify({ success: ok > 0, sent: ok, failed: fail, total: groups.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("notify-p2p-offer error:", e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
