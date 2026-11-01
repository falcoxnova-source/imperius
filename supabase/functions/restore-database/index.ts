import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid user" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return new Response(
        JSON.stringify({ success: false, error: "Solo administradores pueden restaurar la base de datos" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { sqlContent, mode } = await req.json();

    if (!sqlContent || typeof sqlContent !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "No SQL content provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dangerousPatterns = [
      /DROP\s+DATABASE/i,
      /DROP\s+SCHEMA\s+public/i,
      /TRUNCATE\s+.*auth\./i,
      /DELETE\s+FROM\s+auth\./i,
      /DROP\s+TABLE\s+auth\./i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sqlContent)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "SQL contiene comandos peligrosos que no estan permitidos"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const statements = sqlContent
      .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0 && !s.startsWith("--"));

    const results: Array<{ statement: string; success: boolean; error?: string; rowCount?: number }> = [];
    let successCount = 0;
    let errorCount = 0;

    if (mode === "validate") {
      return new Response(
        JSON.stringify({
          success: true,
          mode: "validate",
          statementCount: statements.length,
          preview: statements.slice(0, 10).map((s: string) => s.substring(0, 100) + (s.length > 100 ? "..." : "")),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const statement of statements) {
      if (!statement || statement.length < 3) continue;

      try {
        const { data, error } = await adminClient.rpc("exec_sql_admin", {
          p_sql: statement,
        });

        if (error) {
          results.push({
            statement: statement.substring(0, 100) + (statement.length > 100 ? "..." : ""),
            success: false,
            error: error.message,
          });
          errorCount++;
        } else {
          results.push({
            statement: statement.substring(0, 100) + (statement.length > 100 ? "..." : ""),
            success: true,
            rowCount: data?.row_count || 0,
          });
          successCount++;
        }
      } catch (err) {
        results.push({
          statement: statement.substring(0, 100) + (statement.length > 100 ? "..." : ""),
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "execute",
        totalStatements: statements.length,
        successCount,
        errorCount,
        results: results.slice(0, 50),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
