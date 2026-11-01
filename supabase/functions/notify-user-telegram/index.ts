import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotificationPayload {
  recipient_id: string;
  subject: string;
  body: string;
  message_type: string;
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    battle: "\u2694\uFE0F",
    espionage: "\uD83D\uDD0D",
    expedition: "\uD83D\uDE80",
    alliance: "\uD83E\uDD1D",
    system: "\u2699\uFE0F",
    broadcast: "\uD83D\uDCE2",
    player: "\uD83D\uDCAC",
    transport: "\uD83D\uDE9A",
  };
  return icons[type] || "\uD83D\uDCE9";
}

function getTypeName(type: string): string {
  const names: Record<string, string> = {
    battle: "Reporte de Batalla",
    espionage: "Reporte de Espionaje",
    expedition: "Expedicion",
    alliance: "Alianza",
    system: "Sistema",
    broadcast: "Anuncio",
    player: "Mensaje",
    transport: "Transporte",
  };
  return names[type] || "Notificacion";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Bot token not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload: NotificationPayload = await req.json();

    if (!payload.recipient_id || !payload.subject) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid payload" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: link } = await supabase
      .from("telegram_links")
      .select("telegram_id")
      .eq("user_id", payload.recipient_id)
      .not("telegram_id", "is", null)
      .maybeSingle();

    if (!link?.telegram_id) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "No Telegram linked",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const icon = getTypeIcon(payload.message_type);
    const typeName = getTypeName(payload.message_type);
    const cleanBody = stripHtml(payload.body || "");
    const truncatedBody = truncateText(cleanBody, 500);

    let message = `${icon} <b>${typeName}</b>\n\n`;
    message += `<b>${payload.subject}</b>\n\n`;
    if (truncatedBody) {
      message += `${truncatedBody}\n\n`;
    }
    message += `\uD83C\uDFAE FALCO-X Universe`;

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: link.telegram_id,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    const result = await telegramResponse.json();

    if (!result.ok) {
      console.error(
        `Telegram DM failed for user ${payload.recipient_id}:`,
        result.description
      );
      return new Response(
        JSON.stringify({ success: false, error: result.description }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("DM notification error:", errorMsg);
    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
