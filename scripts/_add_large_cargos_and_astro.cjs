// Script para añadir 200 naves de carga grandes y subir Astrofísica a nivel 7
// Uso: node scripts/_add_large_cargos_and_astro.cjs
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://vpfpvtwxwquoxmrevmaz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_secret_PON_TU_CLAVE_AQUI'; // Nunca subir claves reales al repo

const USER_EMAIL = 'jenserfs@gmail.com';
const ASTROPHYSICS_TECH_ID = 16; // Ajusta si tu tabla usa otro ID para Astrofísica
const ASTROPHYSICS_LEVEL = 7; // Nivel necesario para 4 colonias
const LARGE_CARGO_ID = 2; // Ajusta si tu tabla usa otro ID para Large Cargo
const LARGE_CARGO_AMOUNT = 200;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // 1. Buscar el usuario
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', USER_EMAIL)
    .single();
  if (userError || !user) {
    console.error('No se encontró el usuario:', userError);
    process.exit(1);
  }
  const userId = user.id;

  // 2. Buscar el planeta principal
  const { data: mainPlanet, error: planetError } = await supabase
    .from('planets')
    .select('id')
    .eq('user_id', userId)
    .eq('is_main', true)
    .single();
  if (planetError || !mainPlanet) {
    console.error('No se encontró el planeta principal:', planetError);
    process.exit(1);
  }
  const planetId = mainPlanet.id;

  // 3. Añadir 200 naves de carga grandes al planeta principal
  // Verificar si ya tiene registro de Large Cargo
  const { data: shipRow, error: shipError } = await supabase
    .from('planet_ships')
    .select('id,amount')
    .eq('planet_id', planetId)
    .eq('ship_type_id', LARGE_CARGO_ID)
    .single();
  if (shipError && shipError.code !== 'PGRST116') {
    // PGRST116 = no rows found
    console.error('Error consultando planet_ships:', shipError);
    process.exit(1);
  }
  if (shipRow) {
    // Ya existe, sumar 200
    const newAmount = (shipRow.amount || 0) + LARGE_CARGO_AMOUNT;
    const { error: updateError } = await supabase
      .from('planet_ships')
      .update({ amount: newAmount })
      .eq('id', shipRow.id);
    if (updateError) {
      console.error('Error actualizando planet_ships:', updateError);
      process.exit(1);
    }
    console.log(`Actualizadas Large Cargo a ${newAmount}`);
  } else {
    // No existe, crear registro
    const { error: insertError } = await supabase
      .from('planet_ships')
      .insert({ planet_id: planetId, ship_type_id: LARGE_CARGO_ID, amount: LARGE_CARGO_AMOUNT });
    if (insertError) {
      console.error('Error insertando planet_ships:', insertError);
      process.exit(1);
    }
    console.log('Añadidas 200 Large Cargo');
  }

  // 4. Subir Astrofísica a nivel 7
  // Verificar si ya tiene registro
  const { data: techRow, error: techError } = await supabase
    .from('user_technologies')
    .select('id,level')
    .eq('user_id', userId)
    .eq('technology_id', ASTROPHYSICS_TECH_ID)
    .single();
  if (techError && techError.code !== 'PGRST116') {
    console.error('Error consultando user_technologies:', techError);
    process.exit(1);
  }
  if (techRow) {
    if (techRow.level < ASTROPHYSICS_LEVEL) {
      const { error: updateTechError } = await supabase
        .from('user_technologies')
        .update({ level: ASTROPHYSICS_LEVEL })
        .eq('id', techRow.id);
      if (updateTechError) {
        console.error('Error actualizando Astrofísica:', updateTechError);
        process.exit(1);
      }
      console.log('Astrofísica actualizada a nivel 7');
    } else {
      console.log('Astrofísica ya está en nivel suficiente');
    }
  } else {
    // No existe, crear registro
    const { error: insertTechError } = await supabase
      .from('user_technologies')
      .insert({ user_id: userId, technology_id: ASTROPHYSICS_TECH_ID, level: ASTROPHYSICS_LEVEL });
    if (insertTechError) {
      console.error('Error insertando Astrofísica:', insertTechError);
      process.exit(1);
    }
    console.log('Astrofísica añadida a nivel 7');
  }

  console.log('¡Listo!');
}

main();