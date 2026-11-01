// Router principal del edge-runtime self-hosted: /<funcion> -> /home/deno/functions/<funcion>
const FUNCTION_NAME = /^[a-zA-Z0-9_-]+$/;

Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url);
  const serviceName = pathname.split("/")[1];

  if (pathname === "/health" || pathname === "/_internal/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!serviceName || serviceName === "main" || !FUNCTION_NAME.test(serviceName)) {
    return new Response(JSON.stringify({ error: "function not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const envVarsObj = Deno.env.toObject();
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${serviceName}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60 * 1000,
      cpuTimeSoftLimitMs: 10 * 1000,
      cpuTimeHardLimitMs: 20 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(`[main] ${serviceName}:`, e);
    return new Response(JSON.stringify({ error: "function error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
