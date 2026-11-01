import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    if (!botToken) {
      return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const info = await infoRes.json();

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "set") {
      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
      const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "chat_member", "my_chat_member"],
          drop_pending_updates: false,
        }),
      });
      const setResult = await setRes.json();

      const newInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const newInfo = await newInfoRes.json();

      return new Response(JSON.stringify({
        action: "set",
        webhook_url: webhookUrl,
        set_result: setResult,
        new_webhook_info: newInfo.result,
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      action: "info",
      webhook_info: info.result,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
