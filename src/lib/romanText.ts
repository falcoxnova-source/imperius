// Traduce al estilo imperio los textos que genera el servidor (asuntos y cuerpos
// de mensajes del sistema). Solo afecta a lo que se muestra: los textos originales
// siguen intactos en la BD y los analizadores de reportes leen el texto original.
const ROMAN_RULES: Array<[RegExp, string]> = [
  [/¡?Flota hostil detectada!/g, '¡Ejército hostil detectado!'],
  [/Flota hostil detectada/g, 'Ejército hostil detectado'],
  [/\bdel Planeta del Tesoro\b/g, 'de la Ciudad del Tesoro'],
  [/\bEl Planeta del Tesoro\b/g, 'La Ciudad del Tesoro'],
  [/\bel Planeta del Tesoro\b/g, 'la Ciudad del Tesoro'],
  [/(La Ciudad del Tesoro[^\n.]*?) fue atacado\b/g, '$1 fue atacada'],
  [/Tu planeta Colonia\b/g, 'Tu ciudad'],
  [/Tu planeta Planeta Principal\b/g, 'Tu Ciudad Principal'],
  [/Tu planeta\b/g, 'Tu ciudad'],
  [/(Tu (?:ciudad|Ciudad Principal)[^\n.]*?) fue atacado\b/g, '$1 fue atacada'],
  [/Planeta Principal/g, 'Ciudad Principal'],
  [/\bLa flota\b/g, 'El ejército'],
  [/\bla flota\b/g, 'el ejército'],
  [/\bFlotas\b/g, 'Ejércitos'],
  [/\bflotas\b/g, 'ejércitos'],
  [/\bFlota\b/g, 'Ejército'],
  [/\bflota\b/g, 'ejército'],
  [/ejército regresa vac[ií]a\b/g, 'ejército regresa vacío'],
  [/\bRecicladores\b/g, 'Carroñeros'],
  [/\brecicladores\b/g, 'Carroñeros'],
  [/\bReciclador\b/g, 'Carroñero'],
  [/\breciclador\b/g, 'Carroñero'],
  [/\bNaves\b/g, 'Tropas'],
  [/\bnaves\b/g, 'tropas'],
  [/\bNave\b/g, 'Tropa'],
  [/\bnave\b/g, 'tropa'],
  [/\bplanetas\b/g, 'ciudades'],
  [/\bPlanetas\b/g, 'Ciudades'],
  [/\bplaneta\b/g, 'ciudad'],
  [/\bPlaneta\b/g, 'Ciudad'],
  [/\bMetal\b/g, 'Hierro'],
  [/\bmetal\b/g, 'hierro'],
  [/\bCristal\b/g, 'Piedra'],
  [/\bcristal\b/g, 'piedra'],
  [/\bDeuterio\b/g, 'Comida'],
  [/\bdeuterio\b/g, 'comida'],
];

export function romanizeText(text: string | null | undefined): string {
  let s = text ?? '';
  for (const [re, rep] of ROMAN_RULES) s = s.replace(re, rep);
  return s;
}

// Nombre de ciudad por defecto de la BD -> estilo imperio.
export function romanCityName(name: string | null | undefined): string {
  if (!name || name === 'Colonia') return 'Ciudad';
  if (name === 'Planeta Principal') return 'Ciudad Principal';
  return name;
}
