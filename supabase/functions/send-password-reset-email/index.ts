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

    const { email, redirect_url } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (userError) {
      console.error("Error finding user:", userError);
    }

    let userId: string | null = null;
    let username = 'Comandante';

    if (userData) {
      userId = userData.id;
      username = userData.username || 'Comandante';
    } else {
      const { data: authUser, error: authError } = await supabase.rpc('get_user_by_email', {
        p_email: email.toLowerCase()
      });

      if (authError) {
        console.error("Error in RPC:", authError);
      }

      if (authUser && authUser.length > 0) {
        userId = authUser[0].id;
        username = authUser[0].username || 'Comandante';
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: true, message: "Si el correo existe, recibiras instrucciones" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      return new Response(
        JSON.stringify({ success: false, error: "SMTP no esta habilitado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("email_verification_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("type", "password_reset");

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const { error: insertError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: userId,
        email,
        token,
        type: "password_reset",
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Insert token error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al crear token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resetUrl = `${redirect_url || 'https://imperium.xnova.games'}/reset-password?token=${token}`;

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
    const fromName = smtpConfig.smtp_from_name || "Imperium";

    await client.sendAsync({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: "Recupera tu contrasena - Imperium",
      text: `Hola ${username},\n\nRecibimos una solicitud para restablecer la contrasena de tu cuenta.\n\nPara crear una nueva contrasena, haz clic en el siguiente enlace:\n${resetUrl}\n\nEste enlace expira en 1 hora.\n\nSi no solicitaste este cambio, puedes ignorar este mensaje. Tu contrasena no sera modificada.\n\n-- Imperium`,
      attachment: [
        {
          data: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 12px; text-align: center;">
    <h1 style="color: #22d3ee; margin: 0 0 20px 0; font-size: 28px;">Imperium</h1>
    <div style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="color: #fbbf24; margin: 0 0 10px 0;">Recuperar Contrasena</h2>
      <p style="color: #94a3b8; margin: 0 0 20px 0; font-size: 16px;">Hola ${username}, recibimos una solicitud para restablecer tu contrasena.</p>
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #0f172a; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">Restablecer Contrasena</a>
    </div>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Este enlace expira en 1 hora.</p>
    <p style="color: #475569; font-size: 12px; margin-top: 30px;">Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
  </div>
</body>
</html>`,
          alternative: true,
        },
      ],
    });

    return new Response(
      JSON.stringify({ success: true, message: "Correo de recuperacion enviado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending password reset email:", error);
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
