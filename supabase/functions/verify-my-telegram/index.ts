import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function checkGroupMembership(botToken: string, groupId: string, userId: number): Promise<{ isMember: boolean; status: string; groupId: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getChatMember`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: groupId,
        user_id: userId,
      }),
    });
    const data = await response.json();
    if (data.ok && data.result) {
      const status = data.result.status;
      const memberStatuses = ["member", "administrator", "creator"];
      return { isMember: memberStatuses.includes(status), status, groupId };
    }
    return { isMember: false, status: data.description || "unknown", groupId };
  } catch (e) {
    console.error("Error checking membership:", e);
    return { isMember: false, status: "error", groupId };
  }
}

async function checkAllGroups(botToken: string, userId: number, groups: Array<{ chat_id: string; title: string }>): Promise<{ isMember: boolean; groupTitle: string; status: string }> {
  for (const group of groups) {
    const result = await checkGroupMembership(botToken, group.chat_id, userId);
    console.log(`Checking group ${group.title} (${group.chat_id}): ${result.status}`);
    if (result.isMember) {
      return { isMember: true, groupTitle: group.title, status: result.status };
    }
  }
  return { isMember: false, groupTitle: "", status: "not_member_in_any_group" };
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
      return new Response(JSON.stringify({ success: false, error: "Bot not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ success: false, error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: link } = await supabase
      .from("telegram_links")
      .select("telegram_id, telegram_username")
      .eq("user_id", user.id)
      .single();

    if (!link?.telegram_id) {
      return new Response(JSON.stringify({
        success: false,
        error: "Telegram not linked",
        telegram_linked: false
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: groups } = await supabase
      .from("telegram_groups")
      .select("chat_id, title")
      .eq("is_enabled", true);

    const { data: config } = await supabase
      .from("telegram_config")
      .select("group_id, group_title, group_invite_link")
      .limit(1)
      .single();

    const groupsToCheck = groups && groups.length > 0
      ? groups
      : config?.group_id
        ? [{ chat_id: config.group_id, title: config.group_title }]
        : [];

    if (groupsToCheck.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No groups configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Checking ${groupsToCheck.length} groups for user ${link.telegram_id}`);

    const membership = await checkAllGroups(botToken, link.telegram_id, groupsToCheck);

    console.log(`User ${link.telegram_id} final result: isMember=${membership.isMember}, group=${membership.groupTitle}`);

    if (membership.isMember) {
      const { data, error } = await supabase.rpc("process_telegram_join", {
        p_telegram_id: link.telegram_id,
      });

      if (error) {
        console.error("Process join error:", error);
        return new Response(JSON.stringify({
          success: false,
          error: "Error processing membership",
          telegram_linked: true,
          is_member: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        telegram_linked: true,
        telegram_username: link.telegram_username,
        is_member: true,
        reward_given: data.reward_given,
        reward_amount: data.amount,
        message: data.message || "Membership verified!",
        group_title: membership.groupTitle
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        telegram_linked: true,
        telegram_username: link.telegram_username,
        is_member: false,
        status: membership.status,
        message: "Not a member of any configured group. Join one of our Telegram groups.",
        group_invite_link: config?.group_invite_link || "https://t.me/TrungTungMeme"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Verification error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
