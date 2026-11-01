import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    text?: string;
    new_chat_members?: Array<{
      id: number;
      is_bot: boolean;
      username?: string;
    }>;
    left_chat_member?: {
      id: number;
      is_bot: boolean;
    };
  };
  my_chat_member?: {
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    new_chat_member: {
      user: {
        id: number;
        is_bot: boolean;
      };
      status: string;
    };
  };
  chat_member?: {
    chat: {
      id: number;
      title?: string;
    };
    from: {
      id: number;
      username?: string;
    };
    new_chat_member: {
      user: {
        id: number;
        username?: string;
        first_name?: string;
        is_bot?: boolean;
      };
      status: string;
    };
    old_chat_member: {
      status: string;
    };
  };
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
      }),
    });
    const result = await response.json();
    if (!result.ok) {
      console.error(`Telegram sendMessage FAILED [${response.status}]: ${JSON.stringify(result)}`);
    } else {
      console.log(`Telegram sendMessage OK to chat ${chatId}`);
    }
    return result;
  } catch (e) {
    console.error("Error sending message:", e);
    return null;
  }
}

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
    if (!data.ok) {
      console.error(`Telegram getChatMember FAILED [${response.status}]: ${JSON.stringify(data)}`);
    }
    if (data.ok && data.result) {
      const status = data.result.status;
      const memberStatuses = ["member", "administrator", "creator"];
      return { isMember: memberStatuses.includes(status), status };
    }
    return { isMember: false, status: "unknown" };
  } catch (e) {
    console.error("Error checking membership:", e);
    return { isMember: false, status: "error" };
  }
}

async function getGroupConfig(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("telegram_config")
    .select("group_id, group_title, group_invite_link")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Error loading telegram_config:", error);
  } else if (!data) {
    console.error("No telegram_config row found");
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("VPS_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("VPS_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN not configured");
      return new Response(JSON.stringify({ error: "Bot not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const update: TelegramUpdate = await req.json();

    console.log("Received update:", JSON.stringify(update, null, 2));

    const config = await getGroupConfig(supabase);
    const groupId = config?.group_id;
    const groupInviteLink = config?.group_invite_link;

    if (update.my_chat_member) {
      const myMember = update.my_chat_member;
      const chatType = myMember.chat.type;
      const newStatus = myMember.new_chat_member.status;

      if ((chatType === "group" || chatType === "supergroup") &&
          (newStatus === "administrator" || newStatus === "member")) {
        const chatId = myMember.chat.id.toString();
        const chatTitle = myMember.chat.title || "Unknown Group";

        console.log(`Bot added to group: ${chatTitle} (${chatId})`);

        await supabase
          .from("telegram_config")
          .update({
            group_id: chatId,
            group_title: chatTitle,
            bot_added_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", "00000000-0000-0000-0000-000000000001");

        await sendTelegramMessage(
          botToken,
          parseInt(chatId),
          `Bot configured for this group!\n\nGroup ID: ${chatId}\nGroup: ${chatTitle}\n\nUsers who link their FALCO-X accounts and join this group will receive 50 FXU.`
        );
      }
    }

    if (update.message?.text) {
      const text = update.message.text;
      const chatId = update.message.chat.id;
      const chatType = update.message.chat.type;
      const userId = update.message.from.id;
      const username = update.message.from.username || update.message.from.first_name || "User";

      console.log(`Message from ${userId} in ${chatType}: ${text}`);

      if (text === "/setgroup" && (chatType === "group" || chatType === "supergroup")) {
        const { data: link } = await supabase
          .from("telegram_links")
          .select("user_id")
          .eq("telegram_id", userId)
          .single();

        if (link?.user_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", link.user_id)
            .single();

          if (profile?.is_admin) {
            const chatIdStr = chatId.toString();
            const chatTitle = update.message.chat.title || "Unknown Group";

            await supabase
              .from("telegram_config")
              .update({
                group_id: chatIdStr,
                group_title: chatTitle,
                bot_added_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", "00000000-0000-0000-0000-000000000001");

            await sendTelegramMessage(
              botToken,
              chatId,
              `This group is now the main task group!\n\nGroup: ${chatTitle}\nID: ${chatIdStr}\n\nUsers who link accounts and join THIS group will receive 50 FXU.`
            );
          }
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (chatType !== "private") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (text.startsWith("/start")) {
        let welcomeMsg = `Welcome to FALCO-X Universe!\n\n`;
        welcomeMsg += `To earn 50 FXU:\n\n`;
        welcomeMsg += `1. Generate a code in the game (Tasks page)\n`;
        welcomeMsg += `2. Send it here: /link YOUR_CODE\n`;
        welcomeMsg += `3. Join our Telegram group\n\n`;

        if (groupInviteLink) {
          welcomeMsg += `Join group: ${groupInviteLink}`;
        } else {
          welcomeMsg += `(Group link will be available soon)`;
        }

        await sendTelegramMessage(botToken, chatId, welcomeMsg);
      } else if (text.startsWith("/link")) {
        const code = text.replace(/^\/link\s*/i, "").trim().toUpperCase();

        if (code.length !== 8) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "Invalid code. Enter the 8-character code from the game."
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabase.rpc("complete_telegram_link", {
          p_link_code: code,
          p_telegram_id: userId,
          p_telegram_username: username,
        });

        if (error) {
          console.error("Link error:", error);
          await sendTelegramMessage(botToken, chatId, "Error linking. Try again.");
        } else if (data.success) {
          let successMsg = `Account linked!\n\n`;
          if (groupInviteLink) {
            successMsg += `Now join our group to get 50 FXU:\n${groupInviteLink}`;
          } else {
            successMsg += `Join our Telegram group to receive your reward.`;
          }
          await sendTelegramMessage(botToken, chatId, successMsg);
        } else {
          await sendTelegramMessage(botToken, chatId, data.error || "Failed to link.");
        }
      } else if (text === "/status") {
        const { data: link } = await supabase
          .from("telegram_links")
          .select("*")
          .eq("telegram_id", userId)
          .single();

        if (link) {
          const { data: reward } = await supabase
            .from("telegram_task_rewards")
            .select("*")
            .eq("telegram_id", userId)
            .eq("task_type", "join_group")
            .single();

          let status = `Your Status:\n`;
          status += `Linked: Yes\n`;
          status += `In Group: ${reward?.is_member ? "Yes" : "No"}\n`;
          status += `Reward: ${reward?.reward_claimed ? (reward?.reward_revoked ? "Revoked" : "Claimed") : "Pending"}\n`;
          await sendTelegramMessage(botToken, chatId, status);
        } else {
          await sendTelegramMessage(botToken, chatId, "Not linked. Use /link CODE");
        }
      } else if (text === "/verify") {
        const { data: link } = await supabase
          .from("telegram_links")
          .select("*")
          .eq("telegram_id", userId)
          .single();

        if (!link) {
          await sendTelegramMessage(botToken, chatId, "Not linked. Use /link CODE first.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!groupId) {
          await sendTelegramMessage(botToken, chatId, "Group not configured yet.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const membership = await checkGroupMembership(botToken, groupId, userId);

        if (membership.isMember) {
          const { data, error } = await supabase.rpc("process_telegram_join", {
            p_telegram_id: userId,
          });

          if (error) {
            console.error("Verify join error:", error);
            await sendTelegramMessage(botToken, chatId, "Error processing. Try again.");
          } else if (data.reward_given) {
            await sendTelegramMessage(
              botToken,
              chatId,
              `Verified! You received ${data.amount} FXU!\n\nStay in the group to keep your reward.`
            );
          } else {
            await sendTelegramMessage(
              botToken,
              chatId,
              `Verified! You are in the group.\n\n${data.message || "Reward already claimed."}`
            );
          }
        } else {
          const { data: reward } = await supabase
            .from("telegram_task_rewards")
            .select("*")
            .eq("telegram_id", userId)
            .eq("task_type", "join_group")
            .single();

          if (reward?.is_member && reward?.reward_claimed && !reward?.reward_revoked) {
            const { data, error } = await supabase.rpc("process_telegram_leave", {
              p_telegram_id: userId,
            });

            if (!error && data.reward_revoked) {
              await sendTelegramMessage(
                botToken,
                chatId,
                `You are not in the group. Your ${data.amount} FXU reward was revoked.`
              );
            } else {
              await sendTelegramMessage(botToken, chatId, `You are not in the group (status: ${membership.status}).`);
            }
          } else {
            let msg = `You are not in the group (status: ${membership.status}).\n\n`;
            if (groupInviteLink) {
              msg += `Join here: ${groupInviteLink}`;
            }
            await sendTelegramMessage(botToken, chatId, msg);
          }
        }
      } else if (/^[A-Z0-9]{8}$/i.test(text.trim())) {
        const code = text.trim().toUpperCase();
        console.log(`Direct code input: ${code}`);

        const { data, error } = await supabase.rpc("complete_telegram_link", {
          p_link_code: code,
          p_telegram_id: userId,
          p_telegram_username: username,
        });

        if (error) {
          console.error("Link error:", error);
          await sendTelegramMessage(botToken, chatId, "Error linking. Try again.");
        } else if (data.success) {
          let successMsg = `Account linked!\n\n`;
          if (groupInviteLink) {
            successMsg += `Now join our group to get 50 FXU:\n${groupInviteLink}`;
          } else {
            successMsg += `Join our Telegram group to receive your reward.`;
          }
          await sendTelegramMessage(botToken, chatId, successMsg);
        } else {
          await sendTelegramMessage(botToken, chatId, data.error || "Invalid or expired code.");
        }
      } else if (text === "/setlink" || text.startsWith("/setlink ")) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", (await supabase.from("telegram_links").select("user_id").eq("telegram_id", userId).single()).data?.user_id)
          .single();

        if (!profile?.is_admin) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const link = text.replace("/setlink", "").trim();
        if (link) {
          await supabase
            .from("telegram_config")
            .update({ group_invite_link: link, updated_at: new Date().toISOString() })
            .eq("id", "00000000-0000-0000-0000-000000000001");
          await sendTelegramMessage(botToken, chatId, `Group link updated: ${link}`);
        } else {
          await sendTelegramMessage(botToken, chatId, "Usage: /setlink https://t.me/+yourlink");
        }
      }
    }

    if (update.chat_member) {
      const chatMember = update.chat_member;
      const telegramId = chatMember.new_chat_member.user.id;
      const isBot = chatMember.new_chat_member.user.is_bot;
      const newStatus = chatMember.new_chat_member.status;
      const oldStatus = chatMember.old_chat_member.status;
      const chatIdStr = chatMember.chat.id.toString();

      if (isBot) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Chat member: ${telegramId} ${oldStatus} -> ${newStatus} in ${chatIdStr}`);

      if (groupId && chatIdStr !== groupId && chatIdStr !== `-100${groupId}` && !chatIdStr.endsWith(groupId.replace("-100", ""))) {
        console.log(`Wrong group. Expected: ${groupId}, Got: ${chatIdStr}`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const memberStatuses = ["member", "administrator", "creator"];
      const leftStatuses = ["left", "kicked", "banned"];

      const wasNotMember = leftStatuses.includes(oldStatus) || oldStatus === "restricted";
      const isNowMember = memberStatuses.includes(newStatus);
      const wasMember = memberStatuses.includes(oldStatus);
      const isNowNotMember = leftStatuses.includes(newStatus);

      if (wasNotMember && isNowMember) {
        console.log(`User ${telegramId} joined`);
        const { data, error } = await supabase.rpc("process_telegram_join", {
          p_telegram_id: telegramId,
        });

        if (error) {
          console.error("Join error:", error);
        } else if (data.reward_given) {
          await sendTelegramMessage(
            botToken,
            telegramId,
            `You received ${data.amount} FXU!\n\nStay in the group to keep your reward.`
          );
        } else if (!data.success && data.error) {
          console.log("Join note:", data.error);
        }
      } else if (wasMember && isNowNotMember) {
        console.log(`User ${telegramId} left`);
        const { data, error } = await supabase.rpc("process_telegram_leave", {
          p_telegram_id: telegramId,
        });

        if (error) {
          console.error("Leave error:", error);
        } else if (data.reward_revoked) {
          let revokeMsg = `You left the group. Your ${data.amount} FXU reward was revoked.\n\n`;
          revokeMsg += `Previous balance: ${data.old_balance} FXU\n`;
          revokeMsg += `New balance: ${data.new_balance} FXU`;
          if (data.new_balance < 0) {
            revokeMsg += `\n\nYour balance is now negative. This debt must be paid before you can use FXU features.`;
          }
          await sendTelegramMessage(botToken, telegramId, revokeMsg);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error instanceof Error ? { message: error.message, stack: error.stack } : error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
