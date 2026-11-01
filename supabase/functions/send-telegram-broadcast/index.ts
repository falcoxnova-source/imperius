import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const message = `*${escapeMarkdown(subject)}*\n\n${escapeMarkdown(body)}`;

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "MarkdownV2",
        }),
      }
    );

    const result = await response.json();

    if (!result.ok) {
      console.error("Telegram API error for chat", chatId, ":", result);
      return { success: false, error: result.description || "Unknown Telegram error" };
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Error sending Telegram message to", chatId, ":", errorMsg);
    return { success: false, error: errorMsg };
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, error: "TELEGRAM_BOT_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    
    // Auth: accept user JWT (frontend) or skip for internal calls
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    
    if (userError || !user) {
      // Also accept service_role key for DB function calls
      if (token !== supabaseServiceKey) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid authentication" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // service_role key accepted — skip admin check
    } else {
      // Valid user — verify admin
      const { data: profile } = await adminClient
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
    }

    const { subject, body } = await req.json();

    if (!subject || !body) {
      return new Response(
        JSON.stringify({ success: false, error: "Subject and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: groups, error: groupsError } = await adminClient
      .from("telegram_groups")
      .select("id, chat_id, title")
      .eq("is_enabled", true);

    if (groupsError) {
      console.error("Error fetching telegram groups:", groupsError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al obtener grupos de Telegram" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!groups || groups.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No hay grupos de Telegram configurados. Usa 'Sincronizar Grupos' primero." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const group of groups) {
      const result = await sendTelegramMessage(botToken, group.chat_id, subject, body);

      if (result.success) {
        successCount++;
        await adminClient
          .from("telegram_groups")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", group.id);
      } else {
        failCount++;
        if (errors.length < 3) {
          errors.push(`${group.title}: ${result.error}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        groups_sent: successCount,
        groups_failed: failCount,
        total_groups: groups.length,
        error: errors.length > 0 ? errors.join('; ') : (failCount > 0 ? 'Telegram API error - check bot token and permissions' : undefined),
        v: 4,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Telegram broadcast error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
