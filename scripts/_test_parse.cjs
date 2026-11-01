// Simulate the PlainTextBattleReport parsing logic with real DB messages

const defenderWon = `Tu planeta [2:11:8] fue atacado por mitercr desde [2:91:8].\n\nResultado: VICTORIA DEFENSOR\n\nEscombros generados: 900 Metal, 300 Cristal\nRecursos perdidos: 0 Metal, 0 Cristal, 0 Deuterio\n\n--- Unidades Atacante ---\n  Cazador Ligero: 1 -> 0 (-1 destruidas)\n\n--- Unidades Defensor ---\n  Sonda de Espionaje: 14 (sin perdidas)\n  Crucero: 4 (sin perdidas)\n  Luna Negra: 1 (sin perdidas)`;

const attackerWon = `Tu planeta [2:146:15] fue atacado por CountDooku[DTM] desde [2:131:9].\n\nResultado: VICTORIA ATACANTE\n\nEscombros generados: 81000 Metal, 109200 Cristal\nRecursos perdidos: 84903 Metal, 44413 Cristal, 17214 Deuterio\n\n--- Unidades Atacante ---\n  Cazador Ligero: 417 -> 407 (-10)\n  Cazador Pesado: 15 (sin perdidas)\n  Crucero: 12 (sin perdidas)\n  Nave de Batalla: 10 (sin perdidas)\n  Estrella de la Muerte: 2 (sin perdidas)\n\n--- Unidades Defensor ---\n  Satelite Solar: 57 -> 0 (-57 destruidas)\n  Nave Grande de Carga: 40 -> 0 (-40 destruidas)\n  Lanzamisiles: 502 -> 0 (-502 destruidas)\n  Laser Ligero: 41 -> 0 (-41 destruidas)\n  Laser Pesado: 21 -> 0 (-21 destruidas)\n  Canon de Gauss: 5 -> 0 (-5 destruidas)\n  Canon Ionico: 3 -> 0 (-3 destruidas)\n  Cupula Pequena de Escudo: 1 -> 0 (-1 destruidas)\n  Cupula Grande de Escudo: 1 -> 0 (-1 destruidas)\n\nDano a infraestructura: Fabrica de Robots (nivel 10 → 9)`;

function simulateParse(body, label) {
  console.log(`\n========== ${label} ==========`);
  
  const resultMatch = body.match(/Resultado:\s*(VICTORIA ATACANTE|VICTORIA DEFENSOR|VICTORIA|DERROTA|EMPATE|ATTACKER|DEFENDER|DRAW)/i);
  const rawResult = (resultMatch?.[1] || '').toUpperCase();
  const isAttackerWin = rawResult === 'VICTORIA ATACANTE' || rawResult === 'VICTORIA' || rawResult === 'ATTACKER';
  const isDefenderWin = rawResult === 'VICTORIA DEFENSOR' || rawResult === 'DERROTA' || rawResult === 'DEFENDER';
  console.log('Result:', rawResult, '| isAttackerWin:', isAttackerWin, '| isDefenderWin:', isDefenderWin);

  const isUserAttacker = body.startsWith('Tu flota');
  const isUserDefender = body.startsWith('Tu planeta');
  console.log('isUserAttacker:', isUserAttacker, '| isUserDefender:', isUserDefender);

  const userWon = (isUserAttacker && isAttackerWin) || (isUserDefender && isDefenderWin);
  const userLost = (isUserAttacker && isDefenderWin) || (isUserDefender && isAttackerWin);
  console.log('userWon:', userWon, '| userLost:', userLost);
  console.log('Banner shows:', userWon ? '🏆 ¡VICTORIA!' : userLost ? '💥 DERROTA' : '⚔️ EMPATE');

  // Coordinates
  const coordsMatch = isUserAttacker
    ? body.match(/desde\s*\[([^\]]+)\]\s*ataco\s*\[([^\]]+)\]/)
    : body.match(/planeta\s*\[([^\]]+)\]\s*fue atacado.*desde\s*\[([^\]]+)\]/);
  console.log('Coords match:', coordsMatch ? [coordsMatch[1], coordsMatch[2]] : 'FAILED');

  // Enemy name
  const enemyMatch = body.match(/fue atacado por\s+(.+?)\s+desde/);
  console.log('Enemy name:', enemyMatch?.[1] || 'NOT FOUND');

  // Units
  const attackerUnitsMatch = body.match(/---\s*Unidades Atacante\s*---\s*\n([\s\S]*?)(?=\n\n---\s*Unidades Defensor|$)/)
    || body.match(/===\s*FUERZAS ATACANTES\s*===\s*\n([\s\S]*?)(?=\n\n===\s*FUERZAS DEFENSORAS|$)/);
  const defenderUnitsMatch = body.match(/---\s*Unidades Defensor\s*---\s*\n([\s\S]*?)(?=\n\n|$)/)
    || body.match(/===\s*FUERZAS DEFENSORAS\s*===\s*\n([\s\S]*?)(?=\n\n|$)/);
  
  const attackerUnitsRaw = attackerUnitsMatch?.[1]?.trim() || '';
  const defenderUnitsRaw = defenderUnitsMatch?.[1]?.trim() || '';
  
  console.log('\nAttacker units raw:', JSON.stringify(attackerUnitsRaw));
  console.log('Defender units raw:', JSON.stringify(defenderUnitsRaw));

  const parseUnits = (text) => {
    if (!text) return [];
    return text.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const matchChange = trimmed.match(/^(.+?):\s*(\d+)\s*->\s*(\d+)\s*\((-?\d+)(?:\s*destruidas?)?\)/);
      const matchNoLoss = trimmed.match(/^(.+?):\s*(\d+)\s*\(sin perdidas\)/);
      if (matchChange) return { name: matchChange[1].trim(), initial: parseInt(matchChange[2]), final: parseInt(matchChange[3]), lost: Math.abs(parseInt(matchChange[4])) };
      if (matchNoLoss) return { name: matchNoLoss[1].trim(), initial: parseInt(matchNoLoss[2]), final: parseInt(matchNoLoss[2]), lost: 0 };
      return null;
    }).filter(Boolean);
  };

  const attackerUnits = parseUnits(attackerUnitsRaw);
  const defenderUnits = parseUnits(defenderUnitsRaw);
  
  console.log('\nParsed attacker units:', attackerUnits.length, attackerUnits.map(u => `${u.name}: ${u.final}/${u.initial}`));
  console.log('Parsed defender units:', defenderUnits.length, defenderUnits.map(u => `${u.name}: ${u.final}/${u.initial}`));

  // Loot
  const lootMatch = body.match(/Saqueo:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/);
  const resourcesLostMatch = body.match(/Recursos perdidos:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/);
  console.log('\nLoot match:', lootMatch ? [lootMatch[1], lootMatch[2], lootMatch[3]] : 'NONE');
  console.log('Resources lost match:', resourcesLostMatch ? [resourcesLostMatch[1], resourcesLostMatch[2], resourcesLostMatch[3]] : 'NONE');
}

simulateParse(defenderWon, 'DEFENDER WON');
simulateParse(attackerWon, 'ATTACKER WON (defender lost)');
