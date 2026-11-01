const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

async function main() {
  await c.connect();

  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'purchase_market_listing'");
  let src = fn.rows[0].prosrc;
  
  if (!src.includes('EXCEPTION')) {
    // Replace the final END; with EXCEPTION...END;
    const lastEnd = src.lastIndexOf('END;');
    src = src.substring(0, lastEnd) + 
      `EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al procesar la compra: ' || SQLERRM);
END;`;
    
    const ddl = `CREATE OR REPLACE FUNCTION public.purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
${src}
$function$`;

    await c.query(ddl);
    console.log('EXCEPTION block added to purchase_market_listing');
  } else {
    console.log('Already has EXCEPTION block');
  }

  // Verify
  const verify = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'purchase_market_listing'");
  console.log('Has EXCEPTION:', verify.rows[0].prosrc.includes('EXCEPTION'));

  await c.end();
}
main().catch(e => { console.error(e.message); c.end(); });
