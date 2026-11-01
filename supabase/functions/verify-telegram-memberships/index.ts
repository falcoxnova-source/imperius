import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function checkGroupMembership(botToken: string, groupId: string, userId: number): Promise<{ isMember: boolean; status: string }> {
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
      return { isMember: memberStatuses.includes(status), status };
    }
    return { isMember: false, status: data.description || "unknown" };
  } catch (e) {
    console.error("Error checking membership:", e);
    return { isMember: false, status: "error" };
  }
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
      }),
    });
  } catch (e) {
    console.error("Error sending message:", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      return new Response(JSON.stringify({ error: "Bot not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("telegram_config")
      .select("group_id")
      .limit(1)
      .single();

    if (!config?.group_id) {
      return new Response(JSON.stringify({ error: "Group not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groupId = config.group_id;

    const { data: activeRewards, error: rewardsError } = await supabase
      .from("telegram_task_rewards")
      .select("telegram_id, user_id")
      .eq("task_type", "join_group")
      .eq("is_member", true)
      .eq("reward_claimed", true)
      .eq("reward_revoked", false);

    if (rewardsError) {
      console.error("Error fetching rewards:", rewardsError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!activeRewards || activeRewards.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No active rewards to verify",
        checked: 0,
        revoked: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Checking ${activeRewards.length} users with active rewards...`);

    let checked = 0;
    let revoked = 0;
    let stillMembers = 0;
    const revokedUsers: string[] = [];

    for (const reward of activeRewards) {
      const telegramId = reward.telegram_id;

      await new Promise(resolve => setTimeout(resolve, 100));

      const membership = await checkGroupMembership(botToken, groupId, telegramId);
      checked++;

      console.log(`User ${telegramId}: ${membership.status}`);

      if (!membership.isMember) {
        const { data, error } = await supabase.rpc("process_telegram_leave", {
          p_telegram_id: telegramId,
        });

        if (error) {
          console.error(`Error revoking reward for ${telegramId}:`, error);
        } else if (data?.reward_revoked) {
          revoked++;
          revokedUsers.push(telegramId.toString());

          await sendTelegramMessage(
            botToken,
            telegramId,
            `You left the FALCO-X group. Your ${data.amount} FXU reward has been revoked.`
          );
        }
      } else {
        stillMembers++;
      }
    }

    const result = {
      success: true,
      checked,
      stillMembers,
      revoked,
      revokedUsers,
      message: `Verified ${checked} users: ${stillMembers} still in group, ${revoked} rewards revoked`
    };

    console.log(result.message);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Verification error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
