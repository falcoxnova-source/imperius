import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LotteryResultPayload {
  draw_number: number;
  winning_numbers: number[];
  total_tickets: number;
  total_pool: number;
  jackpot: number;
  jackpot_winners: number;
  jackpot_per_winner: number;
  winners_3match: number;
  winners_2match: number;
  minor_prizes_paid: number;
  accumulated_to_next: number;
  prize_3match: number;
  prize_2match: number;
  // Winner names for display
  jackpot_winner_names?: string[];
  winners_3_names?: string[];
  winners_2_names?: string[];
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get group chat ID and check if enabled
    const { data: config } = await supabase
      .from("admin_telegram_config")
      .select("group_chat_id, is_enabled")
      .single();

    if (!config || !config.is_enabled || !config.group_chat_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Telegram group not configured or disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: LotteryResultPayload = await req.json();

    const numbersStr = payload.winning_numbers.map((n) => `<b>${n}</b>`).join(" · ");
    const drawLabel = `🎰 <b>SORTEO #${payload.draw_number} — FALCO-X NOVA</b>`;
    const separator = "──────────────────";

    let message = "";

    const noWinnersAtAll =
      payload.jackpot_winners === 0 &&
      payload.winners_3match === 0 &&
      payload.winners_2match === 0;

    if (noWinnersAtAll) {
      // No winners — jackpot rolls over
      message = [
        drawLabel,
        separator,
        `🔢 <b>Números ganadores:</b> ${numbersStr}`,
        "",
        `🎫 Tickets vendidos: <b>${payload.total_tickets}</b>`,
        `💰 Pool total: <b>${payload.total_pool.toLocaleString("es")} FXU</b>`,
        "",
        `😔 <b>¡Esta semana no hubo ganadores!</b>`,
        "",
        `🏆 El jackpot de <b>${payload.jackpot.toLocaleString("es")} FXU</b> se acumula para el próximo sorteo.`,
        `💎 <b>Jackpot próximo sorteo: ${payload.accumulated_to_next.toLocaleString("es")} FXU</b>`,
        "",
        `🎟️ ¡Compra tu ticket para el próximo sorteo y no te quedes fuera!`,
      ].join("\n");
    } else {
      // Build winners lines
      const lines: string[] = [drawLabel, separator];
      lines.push(`🔢 <b>Números ganadores:</b> ${numbersStr}`);
      lines.push(`🎫 Tickets vendidos: <b>${payload.total_tickets}</b>`);
      lines.push(`💰 Pool total: <b>${payload.total_pool.toLocaleString("es")} FXU</b>`);
      lines.push("");

      // Jackpot winners (4 matches)
      if (payload.jackpot_winners > 0) {
        lines.push(`🏆 <b>¡JACKPOT! (4 aciertos)</b>`);
        if (payload.jackpot_winner_names && payload.jackpot_winner_names.length > 0) {
          payload.jackpot_winner_names.forEach((name) => {
            lines.push(`   🥇 <b>${name}</b> — ${payload.jackpot_per_winner.toLocaleString("es")} FXU`);
          });
        } else {
          lines.push(`   🥇 ${payload.jackpot_winners} ganador(es) — ${payload.jackpot_per_winner.toLocaleString("es")} FXU c/u`);
        }
        lines.push("");
      }

      // 3-match winners
      if (payload.winners_3match > 0) {
        const prize3 = (payload.prize_3match || 500).toLocaleString("es");
        lines.push(`🥈 <b>3 aciertos (${prize3} FXU c/u):</b>`);
        if (payload.winners_3_names && payload.winners_3_names.length > 0) {
          payload.winners_3_names.slice(0, 10).forEach((name) => {
            lines.push(`   • <b>${name}</b> — ${prize3} FXU`);
          });
          if (payload.winners_3_names.length > 10) {
            lines.push(`   • ...y ${payload.winners_3_names.length - 10} más`);
          }
        } else {
          lines.push(`   ${payload.winners_3match} ganador(es) — ${prize3} FXU c/u`);
        }
        lines.push("");
      }

      // 2-match winners
      if (payload.winners_2match > 0) {
        const prize2 = (payload.prize_2match || 50).toLocaleString("es");
        lines.push(`🥉 <b>2 aciertos (${prize2} FXU c/u):</b>`);
        if (payload.winners_2_names && payload.winners_2_names.length > 0) {
          payload.winners_2_names.slice(0, 10).forEach((name) => {
            lines.push(`   • <b>${name}</b> — ${prize2} FXU`);
          });
          if (payload.winners_2_names.length > 10) {
            lines.push(`   • ...y ${payload.winners_2_names.length - 10} más`);
          }
        } else {
          lines.push(`   ${payload.winners_2match} ganador(es) — ${prize2} FXU c/u`);
        }
        lines.push("");
      }

      lines.push(separator);

      if (payload.accumulated_to_next > 0) {
        lines.push(`💎 <b>Jackpot próximo sorteo: ${payload.accumulated_to_next.toLocaleString("es")} FXU</b>`);
      } else {
        lines.push(`🎟️ ¡Participa en el próximo sorteo!`);
      }

      message = lines.join("\n");
    }

    // Send to Telegram group
    const telegramRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.group_chat_id,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
      console.error("Telegram error:", telegramData);
      return new Response(
        JSON.stringify({ success: false, error: telegramData.description }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("notify-lottery-result error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
