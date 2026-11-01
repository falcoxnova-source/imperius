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

    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error listing users:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al buscar usuario" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuario no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user.email_confirmed_at) {
      return new Response(
        JSON.stringify({ success: false, error: "El email ya esta verificado" }),
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
      return new Response(
        JSON.stringify({ success: false, error: "SMTP no esta habilitado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("email_verification_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("type", "verification");

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { error: insertError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: user.id,
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
    const username = user.user_metadata?.username || 'Comandante';

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
      text: `Hola ${username},\n\nGracias por registrarte en Falco-X Universo.\n\nPara activar tu cuenta, haz clic en el siguiente enlace:\n${verificationUrl}\n\nEste enlace expira en 24 horas.\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.\n\n-- Falco-X Universo`,
      attachment: [
        {
          data: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 12px; text-align: center;">
    <h1 style="color: #22d3ee; margin: 0 0 20px 0; font-size: 28px;">Falco-X Universo</h1>
    <div style="background: rgba(34, 211, 238, 0.1); border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="color: #f8fafc; margin: 0 0 10px 0;">Bienvenido, ${username}!</h2>
      <p style="color: #94a3b8; margin: 0 0 20px 0; font-size: 16px;">Gracias por unirte a Falco-X Universo. Para comenzar tu conquista del universo, confirma tu cuenta.</p>
      <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%); color: #0f172a; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">Confirmar Cuenta</a>
    </div>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Este enlace expira en 24 horas.</p>
    <p style="color: #475569; font-size: 12px; margin-top: 30px;">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
  </div>
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