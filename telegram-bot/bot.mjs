// TUNG Universe - Telegram bot (long polling)
// Handles /start, /link CODE, and channel join/leave membership.
// Calls existing DB RPCs: complete_telegram_link, process_telegram_join, process_telegram_leave.
import pg from "pg";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("FATAL: TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;

const pool = new pg.Pool({
  host: process.env.PGHOST || "xnova-database",
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "postgres",
  max: 4,
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

// ---- Telegram API helpers ----
async function tg(method, body) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    if (!data.ok) console.error(`TG ${method} FAILED:`, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error(`TG ${method} error:`, e.message);
    return { ok: false };
  }
}

function send(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

// ---- DB helpers ----
async function rpc(name, args) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query(`SELECT public.${name}(${placeholders}) AS result`, args);
  return rows[0]?.result;
}

let cfg = { group_id: null, group_invite_link: null, group_title: null };
async function loadConfig() {
  try {
    const { rows } = await pool.query(
      "SELECT group_id, group_invite_link, group_title FROM public.telegram_config ORDER BY id LIMIT 1"
    );
    if (rows[0]) cfg = rows[0];
  } catch (e) {
    console.error("loadConfig error:", e.message);
  }
}

// ---- Message handling ----
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name || "Jugador";
  const text = (msg.text || "").trim();

  // Only respond in private chats for commands
  if (chatType !== "private") return;

  if (text.startsWith("/start")) {
    let m = "🚀 <b>¡Bienvenido a TUNG Universe!</b>\n\n";
    m += "Para vincular tu cuenta y poder usar el <b>Mercado</b>:\n\n";
    m += "1️⃣ Genera tu código en el juego (página de <b>Tareas</b>)\n";
    m += "2️⃣ Envíalo aquí así: <code>/link TUCODIGO</code>\n";
    m += "3️⃣ Únete a nuestro canal y quédate en él\n\n";
    if (cfg.group_invite_link) m += `📢 Únete al canal: ${cfg.group_invite_link}`;
    await send(chatId, m);
    return;
  }

  // /link CODE  or a bare 8-char code
  let code = null;
  if (/^\/link\b/i.test(text)) {
    code = text.replace(/^\/link\s*/i, "").trim().toUpperCase();
  } else if (/^[A-Z0-9]{8}$/i.test(text)) {
    code = text.toUpperCase();
  }

  if (code !== null) {
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      await send(chatId, "❌ Código inválido. Ingresa el código de 8 caracteres que aparece en el juego (página de Tareas).");
      return;
    }
    try {
      const data = await rpc("complete_telegram_link", [code, userId, username]);
      if (data && data.success) {
        let m = "✅ <b>¡Cuenta vinculada!</b>\n\n";
        if (cfg.group_invite_link) m += `Ahora únete al canal para recibir tu recompensa y poder usar el mercado:\n${cfg.group_invite_link}`;
        else m += "Ahora únete a nuestro canal de Telegram para recibir tu recompensa.";
        await send(chatId, m);
      } else {
        await send(chatId, (data && data.error) || "❌ Código inválido o expirado.");
      }
    } catch (e) {
      console.error("complete_telegram_link error:", e.message);
      await send(chatId, "❌ Error al vincular. Intenta de nuevo.");
    }
    return;
  }

  if (text === "/status") {
    try {
      const { rows } = await pool.query(
        `SELECT r.is_member, r.reward_claimed, r.reward_revoked
         FROM public.telegram_links l
         LEFT JOIN public.telegram_task_rewards r
           ON r.telegram_id = l.telegram_id AND r.task_type='join_group'
         WHERE l.telegram_id = $1`,
        [userId]
      );
      if (!rows[0]) {
        await send(chatId, "No estás vinculado. Usa /link TUCODIGO");
      } else {
        const r = rows[0];
        let m = "<b>Tu estado:</b>\n";
        m += "Vinculado: Sí\n";
        m += `En el canal: ${r.is_member ? "Sí ✅" : "No ❌"}\n`;
        m += `Recompensa: ${r.reward_claimed ? (r.reward_revoked ? "Revocada" : "Reclamada") : "Pendiente"}`;
        await send(chatId, m);
      }
    } catch (e) {
      console.error("/status error:", e.message);
    }
    return;
  }
}

// ---- chat_member (join/leave) handling ----
const MEMBER = new Set(["member", "administrator", "creator"]);
const LEFT = new Set(["left", "kicked", "banned"]);

async function handleChatMember(cm) {
  const user = cm.new_chat_member.user;
  if (user.is_bot) return;
  const telegramId = user.id;
  const newStatus = cm.new_chat_member.status;
  const oldStatus = cm.old_chat_member.status;
  const chatIdStr = String(cm.chat.id);

  // Only react to the configured channel/group
  if (cfg.group_id && chatIdStr !== String(cfg.group_id)) {
    console.log(`Ignoring chat_member from ${chatIdStr} (expected ${cfg.group_id})`);
    return;
  }

  const wasMember = MEMBER.has(oldStatus);
  const isMember = MEMBER.has(newStatus);
  const wasOut = LEFT.has(oldStatus) || oldStatus === "restricted";
  const isOut = LEFT.has(newStatus);

  if (wasOut && isMember) {
    console.log(`User ${telegramId} JOINED (${oldStatus}->${newStatus})`);
    try {
      const data = await rpc("process_telegram_join", [telegramId]);
      if (data && data.reward_given) {
        await send(telegramId, `🎉 ¡Recibiste ${data.amount} de recompensa!\n\nQuédate en el canal para conservarla y poder usar el mercado.`);
      }
    } catch (e) {
      console.error("process_telegram_join error:", e.message);
    }
  } else if (wasMember && isOut) {
    console.log(`User ${telegramId} LEFT (${oldStatus}->${newStatus})`);
    try {
      const data = await rpc("process_telegram_leave", [telegramId]);
      if (data && data.reward_revoked) {
        let m = `⚠️ Saliste del canal. Tu recompensa de ${data.amount} fue revocada y el mercado quedó bloqueado.\n\n`;
        m += `Vuelve a unirte al canal para reactivarlo.`;
        if (cfg.group_invite_link) m += `\n${cfg.group_invite_link}`;
        await send(telegramId, m);
      } else {
        await send(telegramId, "⚠️ Saliste del canal. El mercado quedó bloqueado hasta que vuelvas a unirte.");
      }
    } catch (e) {
      console.error("process_telegram_leave error:", e.message);
    }
  }
}

// ---- my_chat_member: bot added as admin to a channel/group ----
async function handleMyChatMember(mcm) {
  const status = mcm.new_chat_member.status;
  const chatType = mcm.chat.type;
  console.log(`my_chat_member: bot is now '${status}' in ${chatType} ${mcm.chat.id} (${mcm.chat.title || ""})`);
}

// ---- Periodic reconciliation (safety net for missed join/leave events) ----
async function getChatMemberStatus(telegramId) {
  const data = await tg("getChatMember", { chat_id: cfg.group_id, user_id: telegramId });
  if (data.ok && data.result) return data.result.status;
  return null;
}

let verifying = false;
async function verifyMemberships() {
  if (verifying || !cfg.group_id) return;
  verifying = true;
  try {
    const { rows } = await pool.query(
      `SELECT l.telegram_id,
              COALESCE(r.is_member, false) AS is_member
       FROM public.telegram_links l
       LEFT JOIN public.telegram_task_rewards r
         ON r.telegram_id = l.telegram_id AND r.task_type = 'join_group'
       WHERE l.telegram_id IS NOT NULL`
    );
    for (const row of rows) {
      const status = await getChatMemberStatus(row.telegram_id);
      if (status === null) continue; // API error, skip this round
      const actuallyMember = MEMBER.has(status);
      if (actuallyMember && !row.is_member) {
        console.log(`Reconcile: ${row.telegram_id} in channel -> process_telegram_join`);
        try { await rpc("process_telegram_join", [row.telegram_id]); } catch (e) { console.error("reconcile join:", e.message); }
      } else if (!actuallyMember && row.is_member) {
        console.log(`Reconcile: ${row.telegram_id} left channel -> process_telegram_leave (market blocked)`);
        try { await rpc("process_telegram_leave", [row.telegram_id]); } catch (e) { console.error("reconcile leave:", e.message); }
      }
      await new Promise((r) => setTimeout(r, 120)); // gentle rate limit
    }
  } catch (e) {
    console.error("verifyMemberships error:", e.message);
  } finally {
    verifying = false;
  }
}

// ---- Long polling loop ----
let offset = 0;
async function poll() {
  const data = await tg("getUpdates", {
    offset,
    timeout: 30,
    allowed_updates: ["message", "chat_member", "my_chat_member", "chat_join_request"],
  });
  if (data.ok && Array.isArray(data.result)) {
    for (const upd of data.result) {
      offset = upd.update_id + 1;
      try {
        if (upd.message) await handleMessage(upd.message);
        else if (upd.chat_member) await handleChatMember(upd.chat_member);
        else if (upd.my_chat_member) await handleMyChatMember(upd.my_chat_member);
      } catch (e) {
        console.error("update handler error:", e.message);
      }
    }
  }
}

async function main() {
  console.log("TUNG bot starting...");
  await loadConfig();
  console.log("Config:", JSON.stringify(cfg));
  // Ensure no webhook is set (long polling requires it removed)
  await tg("deleteWebhook", { drop_pending_updates: false });
  const me = await tg("getMe");
  if (me.ok) console.log(`Bot: @${me.result.username} (${me.result.id})`);
  // Refresh config periodically
  setInterval(loadConfig, 60000);
  // Safety-net membership reconciliation every 5 minutes
  setInterval(verifyMemberships, 5 * 60 * 1000);
  setTimeout(verifyMemberships, 15000);
  // Poll forever
  while (true) {
    try {
      await poll();
    } catch (e) {
      console.error("poll loop error:", e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
