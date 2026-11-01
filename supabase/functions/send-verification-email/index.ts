import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "npm:emailjs@4.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Error de configuracion del servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Cuerpo de solicitud invalido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, user_id, username, redirect_url } = body;

    if (!email || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Email y user_id son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: smtpConfig, error: smtpError } = await supabase
      .from("admin_smtp_settings")
      .select("*")
      .single();

    if (smtpError || !smtpConfig) {
      console.error("SMTP config error:", smtpError);
      return new Response(
        JSON.stringify({ success: false, error: "Configuracion SMTP no encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smtpConfig.is_enabled) {
      // SMTP disabled: auto-verify the user directly in the DB
      await supabase
        .from("profiles")
        .update({ email_verified: true })
        .eq("id", user_id);

      await supabase.auth.admin.updateUserById(user_id, {
        email_confirm: true,
      });

      return new Response(
        JSON.stringify({ success: true, auto_verified: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("email_verification_tokens")
      .delete()
      .eq("user_id", user_id)
      .eq("type", "verification");

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { error: insertError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id,
        email,
        token,
        type: "verification",
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Insert token error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al crear token de verificacion" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verificationUrl = `${redirect_url || 'https://falco-x.com'}/verify-email?token=${token}`;

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

    await client.sendAsync({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: "Confirma tu cuenta - Falco-X Universo",
      text: `Hola ${username || 'Comandante'},\n\nGracias por registrarte en Falco-X Universo.\n\nPara activar tu cuenta, haz clic en el siguiente enlace:\n${verificationUrl}\n\nEste enlace expira en 24 horas.\n\nVisita nuestras plataformas:\n- Web oficial: https://falcox.net/\n- Exchange: https://falcoxswap.com/?inputCurrency=BNB&outputCurrency=0x09514EcF8270C12101D077B5e8B034B164F71C5f\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.\n\n-- Falco-X Universo`,
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
            <td style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%); border-radius: 16px; border: 1px solid rgba(34, 211, 238, 0.2); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <!-- Welcome Section -->
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="color: #22d3ee; margin: 0 0 8px 0; font-size: 32px; font-weight: 700; text-shadow: 0 0 20px rgba(34, 211, 238, 0.5);">Falco-X Universo</h1>
                    <p style="color: #94a3b8; margin: 0; font-size: 16px;">Tu aventura espacial comienza aqui</p>
                  </td>
                </tr>
                
                <!-- Message Box -->
                <tr>
                  <td style="padding: 0 40px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(34, 211, 238, 0.08); border: 1px solid rgba(34, 211, 238, 0.25); border-radius: 12px;">
                      <tr>
                        <td style="padding: 30px; text-align: center;">
                          <h2 style="color: #f8fafc; margin: 0 0 12px 0; font-size: 24px;">Bienvenido, ${username || 'Comandante'}!</h2>
                          <p style="color: #cbd5e1; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">Gracias por unirte a Falco-X Universo. Para comenzar tu conquista del cosmos, confirma tu cuenta haciendo clic en el boton.</p>
                          <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%); color: #0f172a; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 16px rgba(34, 211, 238, 0.4); transition: all 0.3s;">Confirmar mi Cuenta</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Expiration Notice -->
                <tr>
                  <td style="padding: 20px 40px; text-align: center;">
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Este enlace expira en <strong style="color: #f59e0b;">24 horas</strong></p>
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
              <p style="color: #475569; font-size: 12px; margin: 0 0 8px 0;">Si no creaste esta cuenta, puedes ignorar este mensaje de forma segura.</p>
              <p style="color: #334155; font-size: 11px; margin: 0;">© 2026 Falco-X Universo. Todos los derechos reservados.</p>
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

    return new Response(
      JSON.stringify({ success: true, message: "Correo de verificacion enviado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending verification email:", error);
    let errorMessage = "Error al enviar correo";
    
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});