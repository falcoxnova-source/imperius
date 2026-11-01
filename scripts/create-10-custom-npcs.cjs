const { Client } = require('pg');
const crypto = require('crypto');

const EXECUTE = process.argv.includes('--execute');

const TARGET_POINTS = [
  235000, 201630, 187000, 171006, 153080,
  147068, 132762, 121136, 101369, 97541
];

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function splitPoints(total) {
  const b = Math.floor(total * 0.34);
  const r = Math.floor(total * 0.20);
  const f = Math.floor(total * 0.36);
  const d = total - b - r - f;
  return { b, r, f, d };
}

function daysAgoByPoints(points) {
  // Ajuste para server x10: ~21 días a ~48 días para el rango solicitado
  return Math.max(20, Math.min(50, Math.round(points * 0.000197 + 1.8 + (Math.random() * 2 - 1))));
}

function makeTimestamps(points) {
  const created = new Date(Date.now() - daysAgoByPoints(points) * 24 * 60 * 60 * 1000);
  created.setHours(randInt(8, 23), randInt(0, 59), randInt(0, 59), 0);

  const lastActivity = new Date(Date.now() - randInt(3, 180) * 60 * 1000);
  return { created, lastActivity };
}

function cfgByPoints(points) {
  if (points >= 200000) {
    return {
      planets: 3,
      buildings: {
        metal_mine: 30, crystal_mine: 27, deuterium_synthesizer: 24, solar_plant: 30,
        robotics_factory: 12, shipyard: 12, research_lab: 12,
        metal_storage: 8, crystal_storage: 8, deuterium_tank: 8, nanite_factory: 2
      },
      techs: {
        energy_tech: 14, combustion_drive: 12, espionage_tech: 10, computer_tech: 11,
        armour_tech: 12, weapons_tech: 12, shielding_tech: 10, impulse_drive: 10,
        laser_tech: 12, ion_tech: 8, astrophysics: 7, hyperspace_tech: 8,
        plasma_tech: 7, hyperspace_drive: 8
      },
      ships: {
        light_fighter: 1400, heavy_fighter: 700, cruiser: 260, battleship: 160,
        battlecruiser: 90, bomber: 75, destroyer: 55,
        small_cargo: 350, large_cargo: 220, recycler: 140, espionage_probe: 100, colony_ship: 2
      },
      defenses: {
        rocket_launcher: 2200, light_laser: 1400, heavy_laser: 800,
        gauss_cannon: 320, ion_cannon: 360, plasma_turret: 140,
        small_shield_dome: 1, large_shield_dome: 1
      }
    };
  }
  if (points >= 150000) {
    return {
      planets: 2,
      buildings: {
        metal_mine: 27, crystal_mine: 24, deuterium_synthesizer: 21, solar_plant: 27,
        robotics_factory: 10, shipyard: 10, research_lab: 10,
        metal_storage: 7, crystal_storage: 7, deuterium_tank: 7, nanite_factory: 1
      },
      techs: {
        energy_tech: 12, combustion_drive: 10, espionage_tech: 8, computer_tech: 9,
        armour_tech: 10, weapons_tech: 10, shielding_tech: 8, impulse_drive: 8,
        laser_tech: 10, ion_tech: 6, astrophysics: 5, hyperspace_tech: 6,
        plasma_tech: 5, hyperspace_drive: 6
      },
      ships: {
        light_fighter: 900, heavy_fighter: 450, cruiser: 170, battleship: 95,
        battlecruiser: 50, bomber: 40, destroyer: 30,
        small_cargo: 240, large_cargo: 130, recycler: 85, espionage_probe: 70, colony_ship: 1
      },
      defenses: {
        rocket_launcher: 1400, light_laser: 900, heavy_laser: 500,
        gauss_cannon: 190, ion_cannon: 210, plasma_turret: 70,
        small_shield_dome: 1, large_shield_dome: 1
      }
    };
  }
  if (points >= 120000) {
    return {
      planets: 2,
      buildings: {
        metal_mine: 24, crystal_mine: 21, deuterium_synthesizer: 18, solar_plant: 24,
        robotics_factory: 9, shipyard: 9, research_lab: 9,
        metal_storage: 6, crystal_storage: 6, deuterium_tank: 6
      },
      techs: {
        energy_tech: 10, combustion_drive: 8, espionage_tech: 7, computer_tech: 8,
        armour_tech: 8, weapons_tech: 8, shielding_tech: 7, impulse_drive: 7,
        laser_tech: 8, ion_tech: 5, astrophysics: 4, hyperspace_tech: 5,
        plasma_tech: 4, hyperspace_drive: 5
      },
      ships: {
        light_fighter: 620, heavy_fighter: 300, cruiser: 100, battleship: 55,
        battlecruiser: 25, bomber: 20, destroyer: 15,
        small_cargo: 170, large_cargo: 90, recycler: 50, espionage_probe: 45, colony_ship: 1
      },
      defenses: {
        rocket_launcher: 900, light_laser: 580, heavy_laser: 310,
        gauss_cannon: 100, ion_cannon: 120, plasma_turret: 35,
        small_shield_dome: 1, large_shield_dome: 1
      }
    };
  }
  return {
    planets: 2,
    buildings: {
      metal_mine: 21, crystal_mine: 18, deuterium_synthesizer: 15, solar_plant: 21,
      robotics_factory: 7, shipyard: 7, research_lab: 7,
      metal_storage: 5, crystal_storage: 5, deuterium_tank: 5
    },
    techs: {
      energy_tech: 8, combustion_drive: 7, espionage_tech: 6, computer_tech: 6,
      armour_tech: 7, weapons_tech: 7, shielding_tech: 5, impulse_drive: 5,
      laser_tech: 7, ion_tech: 4, astrophysics: 3, hyperspace_tech: 4,
      plasma_tech: 3, hyperspace_drive: 4
    },
    ships: {
      light_fighter: 280, heavy_fighter: 130, cruiser: 42, battleship: 20,
      battlecruiser: 9, bomber: 8, destroyer: 6,
      small_cargo: 85, large_cargo: 40, recycler: 22, espionage_probe: 26, colony_ship: 1
    },
    defenses: {
      rocket_launcher: 420, light_laser: 240, heavy_laser: 120,
      gauss_cannon: 35, ion_cannon: 42, plasma_turret: 11,
      small_shield_dome: 1, large_shield_dome: 1
    }
  };
}

function scaleConfig(cfg, factor) {
  const clone = JSON.parse(JSON.stringify(cfg));
  for (const group of ['buildings', 'techs']) {
    for (const k of Object.keys(clone[group])) {
      clone[group][k] = Math.max(1, Math.floor(clone[group][k] * (0.92 + factor * 0.12)));
    }
  }
  for (const group of ['ships', 'defenses']) {
    for (const k of Object.keys(clone[group])) {
      clone[group][k] = Math.max(0, Math.floor(clone[group][k] * factor));
    }
  }
  return clone;
}

function buildUsername(existing) {
  const first = [
    'Carlos', 'Luis', 'Javier', 'Pedro', 'Diego', 'Miguel', 'Andres', 'Pablo', 'Sergio', 'Ruben',
    'Natalia', 'Paula', 'Andrea', 'Marina', 'Lucia', 'Camila', 'Valeria', 'Daniela', 'Rocio', 'Marta'
  ];
  const tails = ['M', 'JR', 'KR', 'AR', 'EC', 'RD', '77', '88', '_', ''];

  for (let i = 0; i < 200; i++) {
    const base = first[randInt(0, first.length - 1)];
    const tail = tails[randInt(0, tails.length - 1)];
    const n = Math.random() < 0.45 ? String(randInt(10, 99)) : '';
    const candidate = (base + tail + n).replace(/__+/g, '_');
    if (!existing.has(candidate.toLowerCase())) {
      existing.add(candidate.toLowerCase());
      return candidate;
    }
  }

  const fallback = `Jugador${randInt(1000, 9999)}`;
  existing.add(fallback.toLowerCase());
  return fallback;
}

function makeEmail(username) {
  const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com'];
  const local = username.toLowerCase().replace(/[^a-z0-9]/g, '') + randInt(10, 99);
  return `${local}@${domains[randInt(0, domains.length - 1)]}`;
}

function randomReferralCode() {
  // código normal de referido, no visible como marcador de bot
  return `FX${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function main() {
  await client.connect();
  console.log(`Modo: ${EXECUTE ? 'EJECUCION REAL' : 'SIMULACION (no inserta)'}`);

  const profilesRes = await client.query(`SELECT id, username FROM profiles`);
  const planetsRes = await client.query(`SELECT galaxy, solar_system, position FROM planets WHERE planet_type='planet' AND NOT is_destroyed`);
  const btypesRes = await client.query(`SELECT id, code FROM building_types`);
  const ttypesRes = await client.query(`SELECT id, code FROM technology_types`);
  const stypesRes = await client.query(`SELECT id, code FROM ship_types`);
  const dtypesRes = await client.query(`SELECT id, code FROM defense_types`);

  const existingUsernames = new Set(profilesRes.rows.map(r => (r.username || '').toLowerCase()));
  const occupied = new Set(planetsRes.rows.map(p => `${p.galaxy}:${p.solar_system}:${p.position}`));

  const idByBuilding = Object.fromEntries(btypesRes.rows.map(r => [r.code, r.id]));
  const idByTech = Object.fromEntries(ttypesRes.rows.map(r => [r.code, r.id]));
  const idByShip = Object.fromEntries(stypesRes.rows.map(r => [r.code, r.id]));
  const idByDefense = Object.fromEntries(dtypesRes.rows.map(r => [r.code, r.id]));

  const freeCoords = [];
  for (let g = 1; g <= 5; g++) {
    for (let s = 1; s <= 499; s++) {
      for (let p = 4; p <= 12; p++) {
        const key = `${g}:${s}:${p}`;
        if (!occupied.has(key)) freeCoords.push({ galaxy: g, solar_system: s, position: p, key });
      }
    }
  }
  shuffle(freeCoords);

  const sortedPoints = [...TARGET_POINTS].sort((a, b) => b - a);
  const maxP = sortedPoints[0];

  const plan = sortedPoints.map((points, idx) => {
    const username = buildUsername(existingUsernames);
    const email = makeEmail(username);
    const referralCode = randomReferralCode();
    const factor = points / maxP;
    const cfg = scaleConfig(cfgByPoints(points), factor);
    const ts = makeTimestamps(points);
    return {
      idx: idx + 1,
      points,
      username,
      email,
      referralCode,
      cfg,
      createdAt: ts.created,
      lastActivity: ts.lastActivity
    };
  });

  console.log(`NPCs a crear: ${plan.length}`);
  plan.forEach((x, i) => {
    console.log(`${i + 1}. ${x.username} -> ${x.points} pts, creado ${x.createdAt.toISOString().slice(0, 10)}`);
  });

  if (!EXECUTE) {
    console.log('Simulación finalizada. Usa --execute para insertar.');
    await client.end();
    return;
  }

  let coordPtr = 0;
  let created = 0;

  for (const bot of plan) {
    const userId = crypto.randomUUID();
    const pts = splitPoints(bot.points);

    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO auth.users (
          id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          is_sso_user, is_anonymous
        ) VALUES (
          $1, 'authenticated', 'authenticated', $2, '', $3,
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          $3, $4, false, false
        )`,
        [userId, bot.email, bot.createdAt, bot.lastActivity]
      );

      await client.query(
        `INSERT INTO profiles (
          id, username, email, is_bot, points_total, points_buildings, points_research,
          points_fleet, points_defense, rank_position, is_admin, is_banned,
          vacation_mode, created_at, updated_at, last_activity, email_verified, is_hidden,
          battles_won, battles_draw, battles_lost, referral_code
        ) VALUES (
          $1, $2, $3, true, $4, $5, $6, $7, $8, 0, false, false,
          false, $9, $10, $10, true, false,
          $11, $12, $13, $14
        )
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          is_bot = true,
          points_total = EXCLUDED.points_total,
          points_buildings = EXCLUDED.points_buildings,
          points_research = EXCLUDED.points_research,
          points_fleet = EXCLUDED.points_fleet,
          points_defense = EXCLUDED.points_defense,
          referral_code = EXCLUDED.referral_code,
          updated_at = EXCLUDED.updated_at,
          last_activity = EXCLUDED.last_activity`,
        [
          userId, bot.username, bot.email,
          bot.points, pts.b, pts.r, pts.f, pts.d,
          bot.createdAt, bot.lastActivity,
          randInt(8, 28), randInt(1, 7), randInt(5, 22), bot.referralCode
        ]
      );

      const planetsToCreate = Math.max(2, bot.cfg.planets);
      const createdPlanets = [];

      for (let pi = 0; pi < planetsToCreate; pi++) {
        if (coordPtr >= freeCoords.length) throw new Error('Sin coordenadas libres');
        const c = freeCoords[coordPtr++];
        const pname = pi === 0 ? `${bot.username} I` : `${bot.username} ${pi + 1}`;

        const pRes = await client.query(
          `INSERT INTO planets (
            user_id, name, galaxy, solar_system, position, planet_type, image_id,
            diameter, fields_used, fields_max, temp_min, temp_max, is_main_planet,
            is_destroyed, last_update, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'planet', $6,
            $7, $8, $9, $10, $11, $12,
            false, $13, $14
          ) RETURNING id`,
          [
            userId, pname, c.galaxy, c.solar_system, c.position,
            randInt(1, 15), randInt(11800, 19800),
            Object.values(bot.cfg.buildings).filter(v => v > 0).length,
            randInt(180, 260), randInt(-125, -35), randInt(-40, 28), pi === 0,
            bot.lastActivity, bot.createdAt
          ]
        );

        const planetId = pRes.rows[0].id;
        createdPlanets.push(planetId);

        const baseRes = Math.max(30000, Math.floor(bot.points * 1.6));
        await client.query(
          `INSERT INTO planet_resources (
            planet_id, metal, crystal, deuterium, energy_used, energy_max,
            metal_per_hour, crystal_per_hour, deuterium_per_hour,
            metal_storage, crystal_storage, deuterium_storage, last_update
          ) VALUES (
            $1, $2, $3, $4, 0, $5,
            $6, $7, $8,
            $9, $10, $11, $12
          )`,
          [
            planetId,
            Math.floor(baseRes * (0.65 + Math.random() * 0.30)),
            Math.floor(baseRes * (0.35 + Math.random() * 0.25)),
            Math.floor(baseRes * (0.22 + Math.random() * 0.20)),
            Math.floor(baseRes * 0.2),
            Math.floor(baseRes * 0.06),
            Math.floor(baseRes * 0.03),
            Math.floor(baseRes * 0.02),
            Math.floor(baseRes * 12),
            Math.floor(baseRes * 9),
            Math.floor(baseRes * 8),
            bot.lastActivity
          ]
        );

        for (const [code, lvl] of Object.entries(bot.cfg.buildings)) {
          const id = idByBuilding[code];
          if (!id || lvl <= 0) continue;
          const finalLvl = pi === 0 ? lvl : Math.max(1, lvl - randInt(3, 6));
          await client.query(
            `INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, created_at)
             VALUES ($1, $2, $3, false, $4)`,
            [planetId, id, finalLvl, bot.createdAt]
          );
        }

        const factor = pi === 0 ? 0.70 : (planetsToCreate === 2 ? 0.30 : 0.15);
        for (const [code, qty] of Object.entries(bot.cfg.ships)) {
          const id = idByShip[code];
          if (!id || qty <= 0) continue;
          const q = Math.max(0, Math.floor(qty * factor));
          if (q <= 0) continue;
          await client.query(
            `INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction, created_at)
             VALUES ($1, $2, $3, 0, $4)`,
            [planetId, id, q, bot.createdAt]
          );
        }

        for (const [code, qty] of Object.entries(bot.cfg.defenses)) {
          const id = idByDefense[code];
          if (!id || qty <= 0) continue;
          const q = Math.max(0, Math.floor(qty * factor));
          if (q <= 0) continue;
          await client.query(
            `INSERT INTO planet_defenses (planet_id, defense_type_id, quantity, in_construction, created_at)
             VALUES ($1, $2, $3, 0, $4)`,
            [planetId, id, q, bot.createdAt]
          );
        }
      }

      for (const [code, lvl] of Object.entries(bot.cfg.techs)) {
        const id = idByTech[code];
        if (!id || lvl <= 0) continue;
        await client.query(
          `INSERT INTO user_technologies (
            user_id, technology_type_id, level, is_researching,
            research_end_time, research_planet_id, created_at, research_start_time
          ) VALUES (
            $1, $2, $3, false, null, $4, $5, null
          )`,
          [userId, id, lvl, createdPlanets[0], bot.createdAt]
        );
      }

      await client.query('COMMIT');
      created++;
      console.log(`✅ ${bot.username} creado (${bot.points} pts)`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Error creando ${bot.username}:`, err.message);
    }
  }

  console.log(`\nProceso terminado. NPCs creados: ${created}/${plan.length}`);
  const verify = await client.query(`
    SELECT COUNT(*)::int AS n FROM profiles
    WHERE is_bot = true AND points_total IN (235000,201630,187000,171006,153080,147068,132762,121136,101369,97541)
  `);
  console.log(`Verificación por puntos objetivo: ${verify.rows[0].n}`);

  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await client.end(); } catch (_) {}
  process.exit(1);
});
