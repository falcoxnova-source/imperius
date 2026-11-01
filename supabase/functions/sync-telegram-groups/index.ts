import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TelegramChat {
  id: number;
  title?: string;
  username?: string;
  type: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: TelegramChat;
  };
  my_chat_member?: {
    chat: TelegramChat;
  };
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
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`,
      { method: "GET" }
    );

    const result = await response.json();

    if (!result.ok) {
      return new Response(
        JSON.stringify({ success: false, error: result.description || "Telegram API error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updates: TelegramUpdate[] = result.result || [];
    const groupsFound = new Map<string, { chat_id: string; title: string; username: string | null }>();

    for (const update of updates) {
      const chat = update.message?.chat || update.my_chat_member?.chat;
      if (chat && (chat.type === "group" || chat.type === "supergroup" || chat.type === "channel")) {
        const chatId = String(chat.id);
        if (!groupsFound.has(chatId)) {
          groupsFound.set(chatId, {
            chat_id: chatId,
            title: chat.title || "Unknown Group",
            username: chat.username || null,
          });
        }
      }
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const group of groupsFound.values()) {
      const { data: existing } = await adminClient
        .from("telegram_groups")
        .select("id")
        .eq("chat_id", group.chat_id)
        .maybeSingle();

      if (existing) {
        await adminClient
          .from("telegram_groups")
          .update({
            title: group.title,
            username: group.username,
          })
          .eq("chat_id", group.chat_id);
        updatedCount++;
      } else {
        await adminClient
          .from("telegram_groups")
          .insert({
            chat_id: group.chat_id,
            title: group.title,
            username: group.username,
            is_enabled: true,
          });
        addedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        groups_found: groupsFound.size,
        added: addedCount,
        updated: updatedCount,
        groups: Array.from(groupsFound.values()),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Sync telegram groups error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
