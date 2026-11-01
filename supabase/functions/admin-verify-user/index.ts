import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "npm:emailjs@4.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendVerificationNotificationEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
  username: string
): Promise<boolean> {
  try {
    const { data: smtpConfig, error: smtpError } = await supabase
      .from("admin_smtp_settings")
      .select("*")
      .single();

    if (smtpError || !smtpConfig || !smtpConfig.is_enabled) {
      console.log("SMTP not configured or disabled, skipping notification email");
      return false;
    }

    const client = new SMTPClient({
      user: smtpConfig.smtp_user,
      password: smtpConfig.smtp_password,
      host: smtpConfig.smtp_host,
      port: smtpConfig.smtp_port || 587,
      ssl: smtpConfig.smtp_port === 465,
      tls: smtpConfig.smtp_port !== 465,
      timeout: 30000,
    });

    const fromEmail = smtpConfig.smtp_from_email || smtpConfig.smtp_user;
    const fromName = smtpConfig.smtp_from_name || "Falco-X Universo";
    const gameUrl = "https://falco-x.com";

    await client.sendAsync({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: "Tu cuenta ha sido verificada - Falco-X Universo",
      text: `Hola ${username || 'Comandante'},\n\nTu cuenta en Falco-X Universo ha sido verificada exitosamente.\n\nYa puedes acceder al juego y comenzar tu aventura espacial:\n${gameUrl}\n\nVisita nuestras plataformas:\n- Web oficial: https://falcox.net/\n- Exchange: https://falcoxswap.com/?inputCurrency=BNB&outputCurrency=0x09514EcF8270C12101D077B5e8B034B164F71C5f\n\nBienvenido a bordo, Comandante!\n\n-- Falco-X Universo`,
      attachment: [
        {
          data: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%); min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <!-- Header with Logo/Banner -->
          <tr>
            <td style="text-align: center; padding-bottom: 20px;">
              <img src="https://photos.pinksale.finance/file/pinksale-logo-upload/1768087759296-101b69e5b11592c274998ca8b9b37290.jpg" alt="Falco-X" style="max-width: 100%; height: auto; border-radius: 16px; box-shadow: 0 8px 32px rgba(0, 200, 255, 0.3);">
            </td>
          </tr>

          <!-- Main Content Card -->
          <tr>
            <td style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%); border-radius: 16px; border: 1px solid rgba(34, 197, 94, 0.3); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <!-- Success Icon -->
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <div style="display: inline-block; background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.2) 100%); border-radius: 50%; padding: 20px; margin-bottom: 20px;">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <h1 style="color: #22c55e; margin: 0 0 8px 0; font-size: 28px; font-weight: 700; text-shadow: 0 0 20px rgba(34, 197, 94, 0.5);">Cuenta Verificada!</h1>
                    <p style="color: #94a3b8; margin: 0; font-size: 16px;">Tu cuenta ha sido activada exitosamente</p>
                  </td>
                </tr>

                <!-- Message Box -->
                <tr>
                  <td style="padding: 0 40px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 12px;">
                      <tr>
                        <td style="padding: 30px; text-align: center;">
                          <h2 style="color: #f8fafc; margin: 0 0 12px 0; font-size: 22px;">Bienvenido, ${username || 'Comandante'}!</h2>
                          <p style="color: #cbd5e1; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">Tu cuenta en Falco-X Universo ha sido verificada por nuestro equipo. Ya puedes acceder al juego y comenzar tu conquista del cosmos!</p>
                          <a href="${gameUrl}" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #0f172a; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 16px rgba(34, 197, 94, 0.4);">Entrar al Juego</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Features Preview -->
                <tr>
                  <td style="padding: 30px 40px 20px 40px;">
                    <p style="color: #94a3b8; font-size: 14px; text-align: center; margin: 0 0 16px 0;">Que te espera en el universo</p>
                    <table width="100%" cellpadding="0" cellspacing="8">
                      <tr>
                        <td width="33%" style="background: rgba(34, 211, 238, 0.1); border-radius: 8px; padding: 16px; text-align: center;">
                          <span style="display: block; color: #22d3ee; font-size: 24px; margin-bottom: 4px;">&#x1F680;</span>
                          <span style="display: block; color: #e2e8f0; font-size: 13px; font-weight: 600;">Construye Flotas</span>
                        </td>
                        <td width="33%" style="background: rgba(249, 115, 22, 0.1); border-radius: 8px; padding: 16px; text-align: center;">
                          <span style="display: block; color: #f97316; font-size: 24px; margin-bottom: 4px;">&#x1F30D;</span>
                          <span style="display: block; color: #e2e8f0; font-size: 13px; font-weight: 600;">Coloniza Planetas</span>
                        </td>
                        <td width="33%" style="background: rgba(168, 85, 247, 0.1); border-radius: 8px; padding: 16px; text-align: center;">
                          <span style="display: block; color: #a855f7; font-size: 24px; margin-bottom: 4px;">&#x2694;</span>
                          <span style="display: block; color: #e2e8f0; font-size: 13px; font-weight: 600;">Conquista Galaxias</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding: 0 40px;">
                    <div style="border-top: 1px solid rgba(148, 163, 184, 0.2);"></div>
                  </td>
                </tr>

                <!-- Visit Us Section -->
                <tr>
                  <td style="padding: 30px 40px;">
                    <p style="color: #94a3b8; font-size: 14px; text-align: center; margin: 0 0 20px 0;">Visitanos en nuestras plataformas</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="25%" style="padding-right: 6px;">
                          <a href="https://falcox.net/" style="display: block; background: rgba(34, 211, 238, 0.1); border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 8px; padding: 12px; text-decoration: none; text-align: center;">
                            <span style="display: block; color: #22d3ee; font-size: 14px; font-weight: 600;">Web</span>
                            <span style="display: block; color: #64748b; font-size: 11px; margin-top: 2px;">falcox.net</span>
                          </a>
                        </td>
                        <td width="25%" style="padding: 0 6px;">
                          <a href="https://falcoxswap.com/?inputCurrency=BNB&outputCurrency=0x09514EcF8270C12101D077B5e8B034B164F71C5f" style="display: block; background: rgba(249, 115, 22, 0.1); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 8px; padding: 12px; text-decoration: none; text-align: center;">
                            <span style="display: block; color: #f97316; font-size: 14px; font-weight: 600;">Swap</span>
                            <span style="display: block; color: #64748b; font-size: 11px; margin-top: 2px;">falcoxswap.com</span>
                          </a>
                        </td>
                        <td width="25%" style="padding: 0 6px;">
                          <a href="https://chat.whatsapp.com/FhahXAGmJ89I1LaQfs0xRw" style="display: block; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 12px; text-decoration: none; text-align: center;">
                            <span style="display: block; color: #22c55e; font-size: 14px; font-weight: 600;">WhatsApp</span>
                            <span style="display: block; color: #64748b; font-size: 11px; margin-top: 2px;">Grupo</span>
                          </a>
                        </td>
                        <td width="25%" style="padding-left: 6px;">
                          <a href="https://t.me/+1Oo1iGBuQ-xjY2Zh" style="display: block; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; text-decoration: none; text-align: center;">
                            <span style="display: block; color: #3b82f6; font-size: 14px; font-weight: 600;">Telegram</span>
                            <span style="display: block; color: #64748b; font-size: 11px; margin-top: 2px;">Grupo</span>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 20px; text-align: center;">
              <p style="color: #475569; font-size: 12px; margin: 0 0 8px 0;">Gracias por unirte a Falco-X Universo!</p>
              <p style="color: #334155; font-size: 11px; margin: 0;">&copy; 2026 Falco-X Universo. Todos los derechos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          alternative: true,
        },
      ],
    });

    console.log("Verification notification email sent to:", email);
    return true;
  } catch (error) {
    console.error("Error sending verification notification email:", error);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ success: false, error: "Error de configuracion del servidor" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "No autorizado - falta token" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError) {
      console.error("Auth error:", authError);
      return jsonResponse({ success: false, error: "Token invalido: " + authError.message }, 401);
    }

    if (!callerUser) {
      return jsonResponse({ success: false, error: "Usuario no encontrado en token" }, 401);
    }

    const { data: adminCheck, error: adminError } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (adminError) {
      console.error("Admin check error:", adminError);
      return jsonResponse({ success: false, error: "Error verificando permisos" }, 500);
    }

    if (!adminCheck?.is_admin) {
      return jsonResponse({ success: false, error: "Solo administradores pueden verificar usuarios" }, 403);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("JSON parse error:", e);
      return jsonResponse({ success: false, error: "Cuerpo de solicitud invalido" }, 400);
    }

    const { user_id } = body;

    if (!user_id) {
      return jsonResponse({ success: false, error: "user_id es requerido" }, 400);
    }

    console.log("Attempting to verify user:", user_id);

    const { data: targetUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(user_id);

    if (getUserError) {
      console.error("Get user error:", getUserError);
      return jsonResponse({ success: false, error: "Error al buscar usuario: " + getUserError.message }, 404);
    }

    if (!targetUser?.user) {
      return jsonResponse({ success: false, error: "Usuario no encontrado" }, 404);
    }

    const userEmail = targetUser.user.email;

    console.log("Updating user email_confirm for:", user_id);

    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      email_confirm: true,
    });

    if (updateError) {
      console.error("Update user error:", updateError);
      return jsonResponse({ success: false, error: "Error al verificar: " + updateError.message }, 500);
    }

    console.log("Auth user verified, now updating profiles table");

    const { data: profileData, error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({ email_verified: true })
      .eq("id", user_id)
      .select("username")
      .single();

    if (profileUpdateError) {
      console.error("Profile update error:", profileUpdateError);
      return jsonResponse({ success: false, error: "Error al actualizar perfil: " + profileUpdateError.message }, 500);
    }

    console.log("User verified successfully:", updatedUser?.user?.id);

    await supabaseAdmin
      .from("email_verification_tokens")
      .delete()
      .eq("user_id", user_id)
      .eq("type", "verification");

    let emailSent = false;
    if (userEmail) {
      emailSent = await sendVerificationNotificationEmail(
        supabaseAdmin,
        userEmail,
        profileData?.username || "Comandante"
      );
    }

    return jsonResponse({
      success: true,
      message: emailSent
        ? "Usuario verificado y notificado por correo"
        : "Usuario verificado correctamente"
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Error interno del servidor";
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});
