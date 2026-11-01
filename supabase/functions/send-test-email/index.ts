import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "npm:emailjs@4.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No autorizado - falta header de autorizacion" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing env vars");
      return new Response(
        JSON.stringify({ success: false, error: "Error de configuracion del servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Usuario no autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ success: false, error: "No tienes permisos de administrador" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Cuerpo de solicitud invalido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { recipient_email } = body;

    if (!recipient_email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email de destino requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: smtpConfig, error: smtpError } = await supabase
      .from("admin_smtp_settings")
      .select("*")
      .single();

    if (smtpError) {
      console.error("SMTP config error:", smtpError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al leer configuracion SMTP: " + smtpError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smtpConfig) {
      return new Response(
        JSON.stringify({ success: false, error: "No se encontro configuracion SMTP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smtpConfig.is_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "SMTP no esta habilitado. Habilita SMTP primero." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smtpConfig.smtp_host || !smtpConfig.smtp_user || !smtpConfig.smtp_password) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuracion SMTP incompleta. Verifica host, usuario y contrasena." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Connecting to SMTP:", smtpConfig.smtp_host, "port:", smtpConfig.smtp_port);

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

    console.log("Sending email from:", fromEmail, "to:", recipient_email);

    await client.sendAsync({
      from: `${fromName} <${fromEmail}>`,
      to: recipient_email,
      subject: "Prueba de Configuracion SMTP - Falco-X Universo",
      text: `Este es un correo de prueba desde Falco-X Universo.\n\nSi puedes leer este mensaje, la configuracion SMTP esta funcionando correctamente.\n\nFecha: ${new Date().toISOString()}\n\n-- Falco-X Universo`,
      attachment: [
        {
          data: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 12px; text-align: center;">
    <h1 style="color: #22d3ee; margin: 0 0 20px 0; font-size: 28px;">Falco-X Universo</h1>
    <div style="background: rgba(34, 211, 238, 0.1); border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="color: #10b981; margin: 0 0 10px 0;">Configuracion SMTP Exitosa!</h2>
      <p style="color: #94a3b8; margin: 0; font-size: 16px;">Tu servidor de correo esta configurado correctamente.</p>
    </div>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Fecha de prueba: ${new Date().toISOString()}</p>
    <p style="color: #475569; font-size: 12px; margin-top: 30px;">Este es un correo automatico de prueba.</p>
  </div>
</body>
</html>`,
          alternative: true,
        },
      ],
    });

    console.log("Email sent successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Correo de prueba enviado a ${recipient_email}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending test email:", error);
    let errorMessage = "Error al enviar correo";
    
    if (error instanceof Error) {
      errorMessage = error.message;
      if (errorMessage.includes("ECONNREFUSED")) {
        errorMessage = "No se pudo conectar al servidor SMTP. Verifica el host y puerto.";
      } else if (errorMessage.includes("authentication") || errorMessage.includes("AUTH")) {
        errorMessage = "Error de autenticacion SMTP. Verifica usuario y contrasena.";
      } else if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("timeout")) {
        errorMessage = "Tiempo de espera agotado. El servidor SMTP no responde.";
      } else if (errorMessage.includes("certificate") || errorMessage.includes("SSL") || errorMessage.includes("TLS")) {
        errorMessage = "Error de certificado SSL/TLS. Verifica la configuracion de seguridad.";
      }
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
