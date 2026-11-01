import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ListingPayload {
  listing_id: string;
  seller_username: string;
  listing_type: string;
  item_code: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
}

function getItemEmoji(itemCode: string, listingType: string): string {
  if (listingType === "dark_matter") return "🌑";

  const emojis: Record<string, string> = {
    metal: "🔩",
    crystal: "💎",
    deuterium: "⚗️",
    light_fighter: "🛩️",
    heavy_fighter: "✈️",
    cruiser: "🚀",
    battleship: "⚔️",
    battlecruiser: "🗡️",
    bomber: "💣",
    destroyer: "💥",
    deathstar: "☠️",
    small_cargo: "📦",
    large_cargo: "🚚",
    colony_ship: "🏠",
    recycler: "♻️",
    espionage_probe: "🔍",
    solar_satellite: "☀️",
    star_destroyer: "⭐",
  };

  return emojis[itemCode] || "📦";
}

function getQuantityEmoji(quantity: number): string {
  if (quantity >= 10000000) return "🔥🔥🔥 MEGA OFERTA 🔥🔥🔥";
  if (quantity >= 1000000) return "🔥🔥 GRAN OFERTA 🔥🔥";
  if (quantity >= 100000) return "🔥 OFERTA DESTACADA 🔥";
  if (quantity >= 10000) return "⭐ BUENA OFERTA ⭐";
  return "📢 Nueva Oferta";
}

function formatNumber(num: number): string {
  if (num >= 1000000000) return (num / 1000000000).toFixed(2) + "B";
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(2) + "K";
  return num.toLocaleString();
}

function getItemName(itemCode: string, listingType: string): string {
  if (listingType === "dark_matter") return "Materia Oscura";

  const names: Record<string, string> = {
    metal: "Metal",
    crystal: "Cristal",
    deuterium: "Deuterio",
    light_fighter: "Cazador Ligero",
    heavy_fighter: "Cazador Pesado",
    cruiser: "Crucero",
    battleship: "Nave de Batalla",
    battlecruiser: "Acorazado",
    bomber: "Bombardero",
    destroyer: "Destructor",
    deathstar: "Estrella de la Muerte",
    small_cargo: "Carguero Pequeño",
    large_cargo: "Carguero Grande",
    colony_ship: "Nave Colonizadora",
    recycler: "Reciclador",
    espionage_probe: "Sonda de Espionaje",
    solar_satellite: "Satelite Solar",
    star_destroyer: "Destructor Estelar",
  };

  return names[itemCode] || itemCode;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function buildMarketMessage(data: ListingPayload): string {
  const quantityHeader = getQuantityEmoji(data.quantity);
  const itemEmoji = getItemEmoji(data.item_code, data.listing_type);
  const itemName = getItemName(data.item_code, data.listing_type);

  const typeLabel = data.listing_type === "resource" ? "Recurso"
    : data.listing_type === "ship" ? "Nave"
    : "Materia Oscura";

  const lines = [
    `${quantityHeader}`,
    ``,
    `${itemEmoji} *${escapeMarkdown(itemName)}*`,
    ``,
    `📊 *Tipo:* ${escapeMarkdown(typeLabel)}`,
    `📦 *Cantidad:* ${escapeMarkdown(formatNumber(data.quantity))}`,
    `💰 *Precio/u:* ${escapeMarkdown(formatNumber(data.price_per_unit))} FXU`,
    `💵 *Total:* ${escapeMarkdown(formatNumber(data.total_price))} FXU`,
    ``,
    `👤 *Vendedor:* ${escapeMarkdown(data.seller_username)}`,
    ``,
    `🎮 ¡Entra al juego y aprovecha esta oferta\\!`,
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
      console.error("TELEGRAM_BOT_TOKEN not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Bot token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: ListingPayload = await req.json();

    if (!payload.listing_id || !payload.item_code || !payload.quantity) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: groups, error: groupsError } = await adminClient
      .from("telegram_groups")
      .select("id, chat_id, title")
      .eq("is_enabled", true);

    if (groupsError || !groups || groups.length === 0) {
      console.log("No Telegram groups configured or error:", groupsError);
      return new Response(
        JSON.stringify({ success: true, message: "No groups to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = buildMarketMessage(payload);

    let successCount = 0;
    let failCount = 0;

    for (const group of groups) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: group.chat_id,
              text: message,
              parse_mode: "MarkdownV2",
            }),
          }
        );

        const result = await response.json();

        if (result.ok) {
          successCount++;
        } else {
          console.error("Telegram error for group", group.title, ":", result);
          failCount++;
        }
      } catch (error) {
        console.error("Error sending to group", group.title, ":", error);
        failCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        groups_notified: successCount,
        groups_failed: failCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Market notification error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
