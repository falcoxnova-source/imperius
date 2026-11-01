import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "npm:emailjs@4.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SmtpConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  is_enabled: boolean;
}

async function sendEmail(
  config: SmtpConfig,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new SMTPClient({
      user: config.smtp_user,
      password: config.smtp_password,
      host: config.smtp_host,
      port: config.smtp_port || 587,
      ssl: config.smtp_port === 465,
      tls: config.smtp_port !== 465,
      timeout: 30000,
    });

    const fromEmail = config.smtp_from_email || config.smtp_user;
    const fromName = config.smtp_from_name || "Falco-X Universo";

    await client.sendAsync({
      from: `${fromName} <${fromEmail}>`,
      to: to,
      subject: subject,
      text: subject,
      attachment: [
        { data: htmlBody, alternative: true },
      ],
    });

    console.log(`Email sent successfully to ${to}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error sending to ${to}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
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

    const { subject, body } = await req.json();

    if (!subject || !body) {
      return new Response(
        JSON.stringify({ success: false, error: "Subject and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: smtpConfig, error: smtpError } = await adminClient
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
      return new Response(
        JSON.stringify({ success: false, error: "SMTP no esta habilitado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config: SmtpConfig = {
      smtp_host: smtpConfig.smtp_host,
      smtp_port: smtpConfig.smtp_port || 587,
      smtp_user: smtpConfig.smtp_user,
      smtp_password: smtpConfig.smtp_password,
      smtp_from_email: smtpConfig.smtp_from_email || smtpConfig.smtp_user,
      smtp_from_name: smtpConfig.smtp_from_name || "Falco-X Universo",
      is_enabled: smtpConfig.is_enabled,
    };

    console.log(`Using SMTP: ${config.smtp_host}:${config.smtp_port} from ${config.smtp_from_email}`);

    const { data: users } = await adminClient
      .from("profiles")
      .select("id")
      .neq("id", user.id);

    const userIds = users?.map(u => u.id) || [];
    console.log(`Found ${userIds.length} users to email`);

    const { data: authUsers } = await adminClient.auth.admin.listUsers();

    const emailMap = new Map<string, string>();
    authUsers?.users?.forEach(u => {
      if (u.email) {
        emailMap.set(u.id, u.email);
      }
    });

    const htmlBody = `<!DOCTYPE html>
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
          <tr>
            <td style="text-align: center; padding-bottom: 20px;">
              <img src="https://photos.pinksale.finance/file/pinksale-logo-upload/1768087759296-101b69e5b11592c274998ca8b9b37290.jpg" alt="Falco-X" style="max-width: 100%; height: auto; border-radius: 16px; box-shadow: 0 8px 32px rgba(0, 200, 255, 0.3);">
            </td>
          </tr>
          <tr>
            <td style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%); border-radius: 16px; border: 1px solid rgba(34, 211, 238, 0.2); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="color: #22d3ee; margin: 0 0 8px 0; font-size: 32px; font-weight: 700; text-shadow: 0 0 20px rgba(34, 211, 238, 0.5);">${config.smtp_from_name}</h1>
                    <p style="color: #94a3b8; margin: 0; font-size: 16px;">Comunicado Oficial</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(34, 211, 238, 0.08); border: 1px solid rgba(34, 211, 238, 0.25); border-radius: 12px;">
                      <tr>
                        <td style="padding: 30px; text-align: center;">
                          <h2 style="color: #f8fafc; margin: 0 0 16px 0; font-size: 24px;">${subject}</h2>
                          <p style="color: #cbd5e1; margin: 0; font-size: 16px; line-height: 1.8; text-align: left; white-space: pre-wrap;">${body}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px 40px;">
                    <div style="border-top: 1px solid rgba(148, 163, 184, 0.2);"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
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
          <tr>
            <td style="padding: 30px 20px; text-align: center;">
              <p style="color: #475569; font-size: 12px; margin: 0 0 8px 0;">Este es un comunicado oficial de ${config.smtp_from_name}</p>
              <p style="color: #334155; font-size: 11px; margin: 0;">No respondas a este correo</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const userId of userIds) {
      const email = emailMap.get(userId);
      if (email) {
        console.log(`Attempting to send email to: ${email}`);
        const result = await sendEmail(config, email, subject, htmlBody);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
          if (errors.length < 3) {
            errors.push(`${email}: ${result.error}`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Broadcast complete: ${successCount} sent, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        emails_sent: successCount,
        emails_failed: failCount,
        total_users: userIds.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Broadcast email error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
