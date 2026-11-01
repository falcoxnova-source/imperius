// Test parsing with the "Combate en..." format (solo combat reports)

const soloCombat = `Combate en Planeta ryze [1:140:5]\n\nResultado: VICTORIA\nRondas: 1\n\n=== TUS FUERZAS ===\n  Destructor: 8 (sin perdidas)\n  Destructor de Estrellas: 7 (sin perdidas)\n\n=== FUERZAS ENEMIGAS ===\n  Laser Ligero: 1 -> 0 (-1 destruidas)\n\nBotin: 117337 Metal, 71950 Cristal, 123276 Deuterio\nEscombros generados: 300 Metal, 300 Cristal`;

function simulate(body, label) {
  console.log(`\n===== ${label} =====`);
  
  const resultMatch = body.match(/Resultado:\s*(VICTORIA ATACANTE|VICTORIA DEFENSOR|VICTORIA|DERROTA|EMPATE|ATTACKER|DEFENDER|DRAW)/i);
  const rawResult = (resultMatch?.[1] || '').toUpperCase();
  const isAttackerWin = rawResult === 'VICTORIA ATACANTE' || rawResult === 'VICTORIA' || rawResult === 'ATTACKER';
  const isDefenderWin = rawResult === 'VICTORIA DEFENSOR' || rawResult === 'DERROTA' || rawResult === 'DEFENDER';
  
  const isAcsReport = body.startsWith('Combate ACS');
  const isSoloCombatReport = body.startsWith('Combate en ');
  const isUserAttacker = body.startsWith('Tu flota') || isAcsReport || isSoloCombatReport;
  const isUserDefender = body.startsWith('Tu planeta');
  
  const userWon = isSoloCombatReport
    ? (isAttackerWin || rawResult === 'VICTORIA')
    : (isUserAttacker && isAttackerWin) || (isUserDefender && isDefenderWin);
  const userLost = isSoloCombatReport
    ? (isDefenderWin || rawResult === 'DERROTA')
    : (isUserAttacker && isDefenderWin) || (isUserDefender && isAttackerWin);
  
  console.log('Result:', rawResult);
  console.log('Banner:', userWon ? '🏆 ¡VICTORIA!' : userLost ? '💥 DERROTA' : '⚔️ EMPATE');
  
  // Coords
  const coordsMatch = isSoloCombatReport
    ? body.match(/Combate en .+?\[([^\]]+)\]/)
    : null;
  console.log('Coords:', coordsMatch?.[1] || '?');
  
  // Units
  const attackerUnitsMatch = body.match(/---\s*Unidades Atacante\s*---\s*\n([\s\S]*?)(?=\n\n---\s*Unidades Defensor|$)/)
    || body.match(/===\s*FUERZAS ATACANTES\s*===\s*\n([\s\S]*?)(?=\n\n===\s*FUERZAS DEFENSORAS|$)/)
    || body.match(/===\s*TUS FUERZAS\s*===\s*\n([\s\S]*?)(?=\n\n===\s*FUERZAS ENEMIGAS|$)/);
  const defenderUnitsMatch = body.match(/---\s*Unidades Defensor\s*---\s*\n([\s\S]*?)(?=\n\n|$)/)
    || body.match(/===\s*FUERZAS DEFENSORAS\s*===\s*\n([\s\S]*?)(?=\n\n|$)/)
    || body.match(/===\s*FUERZAS ENEMIGAS\s*===\s*\n([\s\S]*?)(?=\n\n|$)/);
  
  console.log('Your forces raw:', attackerUnitsMatch?.[1]?.trim() || 'EMPTY');
  console.log('Enemy forces raw:', defenderUnitsMatch?.[1]?.trim() || 'EMPTY');
  
  // Loot
  const lootMatch = body.match(/Saqueo:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/)
    || body.match(/Botin total:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/)
    || body.match(/Botin:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/);
  console.log('Loot:', lootMatch ? [lootMatch[1], lootMatch[2], lootMatch[3]] : 'NONE');
}

simulate(soloCombat, 'SOLO COMBAT - Combate en...');
