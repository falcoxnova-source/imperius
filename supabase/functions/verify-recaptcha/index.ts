import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { token, action } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing reCAPTCHA token" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: secretData } = await adminClient
      .from("game_settings")
      .select("value")
      .eq("key", "recaptcha_secret_key")
      .single();

    const { data: enabledData } = await adminClient
      .from("game_settings")
      .select("value")
      .eq("key", "recaptcha_enabled")
      .single();

    const { data: minScoreData } = await adminClient
      .from("game_settings")
      .select("value")
      .eq("key", "recaptcha_min_score")
      .single();

    const enabledVal = enabledData?.value;
    const isEnabled = enabledVal === true || enabledVal === "true";
    if (!isEnabled) {
      return new Response(
        JSON.stringify({ success: true, score: 1.0, bypassed: true }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let secretKey = secretData?.value || "";
    if (typeof secretKey === "string") {
      secretKey = secretKey.replace(/^"|"$/g, "");
    }

    if (!secretKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "reCAPTCHA not configured on server",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const minScore = Number(minScoreData?.value) || 0.5;

    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    const verifyResponse = await fetch(verifyUrl, {
      method: "POST",
      body: params,
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "reCAPTCHA verification failed",
          details: verifyResult["error-codes"],
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action && verifyResult.action !== action) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "reCAPTCHA action mismatch",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const score = verifyResult.score || 0;
    if (score < minScore) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "reCAPTCHA score too low",
          score,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        score,
        action: verifyResult.action,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
