import { createContext, useContext } from 'react';
import type { Translations } from './types';

export type Language = 'en' | 'es';

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

export const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'es';
  const stored = localStorage.getItem('falcox-language');
  if (stored === 'en' || stored === 'es') return stored;
  const browserLang = navigator.language.split('-')[0];
  return browserLang === 'en' ? 'en' : 'es';
}

export function setStoredLanguage(lang: Language): void {
  localStorage.setItem('falcox-language', lang);
}

/**
 * Mapa de codigo de base de datos → clave i18n para edificios
 */
const buildingCodeMap: Record<string, keyof Translations['buildings']> = {
  metal_mine: 'metalMine',
  crystal_mine: 'crystalMine',
  deuterium_synthesizer: 'deuteriumSynthesizer',
  solar_plant: 'solarPlant',
  fusion_reactor: 'fusionReactor',
  metal_storage: 'metalStorage',
  crystal_storage: 'crystalStorage',
  deuterium_tank: 'deuteriumTank',
  robotics_factory: 'roboticsFactory',
  shipyard: 'shipyard',
  research_lab: 'researchLab',
  alliance_depot: 'allianceDepot',
  missile_silo: 'missileSilo',
  nanite_factory: 'naniteFactory',
  terraformer: 'terraformer',
  space_dock: 'spaceDock',
  lunar_base: 'lunarBase',
  sensor_phalanx: 'sensorPhalanx',
  jump_gate: 'jumpGate',
  university: 'university',
};

/**
 * Mapa de codigo de base de datos → clave i18n para tecnologias
 */
const researchCodeMap: Record<string, keyof Translations['research']> = {
  espionage_tech: 'espionageTech',
  computer_tech: 'computerTech',
  weapons_tech: 'weaponsTech',
  shielding_tech: 'shieldingTech',
  armour_tech: 'armorTech',
  energy_tech: 'energyTech',
  hyperspace_tech: 'hyperspaceTech',
  combustion_drive: 'combustionDrive',
  impulse_drive: 'impulseDrive',
  hyperspace_drive: 'hyperspaceDrive',
  laser_tech: 'laserTech',
  ion_tech: 'ionTech',
  plasma_tech: 'plasmaTech',
  intergalactic_research_network: 'intergalacticResearchNetwork',
  astrophysics: 'astrophysics',
  graviton_tech: 'gravitonTech',
  metal_production: 'metalProduction',
  crystal_production: 'crystalProduction',
  deuterium_production: 'deuteriumProduction',
  matter_manipulation: 'matterManipulation',
  expedition: 'expedition',
};

/**
 * Mapa de codigo de base de datos → clave i18n para naves
 */
const shipCodeMap: Record<string, keyof Translations['shipyard']> = {
  small_cargo: 'smallCargo',
  large_cargo: 'largeCargo',
  light_fighter: 'lightFighter',
  heavy_fighter: 'heavyFighter',
  cruiser: 'cruiser',
  battleship: 'battleship',
  colony_ship: 'colonyShip',
  recycler: 'recycler',
  espionage_probe: 'espionageProbe',
  bomber: 'bomber',
  solar_satellite: 'solarSatellite',
  destroyer: 'destroyer',
  deathstar: 'deathstar',
  battlecruiser: 'battlecruiser',
  pathfinder: 'pathfinder',
  star_destroyer: 'starDestroyer',
  black_moon: 'blackMoon',
  falco_x_clasica: 'falcoXClasica',
  nova: 'nova',
  large_frigate: 'largeFrigate',
  destruccion_masiva: 'destruccionMasiva',
  occupation_ship: 'occupationShip',
  mega_recycler: 'megaRecycler',
  dark_matter_collector: 'darkMatterCollector',
};

/**
 * Mapa de codigo de base de datos → clave i18n para defensas
 */
const defenseCodeMap: Record<string, keyof Translations['defense']> = {
  rocket_launcher: 'rocketLauncher',
  light_laser: 'lightLaser',
  heavy_laser: 'heavyLaser',
  gauss_cannon: 'gaussCannon',
  ion_cannon: 'ionCannon',
  plasma_turret: 'plasmaTurret',
  small_shield_dome: 'smallShieldDome',
  large_shield_dome: 'largeShieldDome',
  anti_ballistic_missiles: 'antiBallisticMissiles',
  interplanetary_missiles: 'interplanetaryMissiles',
  anti_ballistic_missile: 'antiBallisticMissiles',
  interplanetary_missile: 'interplanetaryMissiles',
  graviton_cannon: 'gravitonCannon',
  outer_protection_dome: 'outerProtectionDome',
  orbital_defense_platform: 'orbitalDefensePlatform',
};

/**
 * Mapa de codigo de base de datos → clave i18n para oficiales (nombre)
 */
const officerCodeMap: Record<string, keyof Translations['officers']> = {
  commander: 'commander',
  admiral: 'admiral',
  engineer: 'engineer',
  geologist: 'geologist',
  technocrat: 'technocrat',
  android: 'android',
};

/**
 * Mapa de codigo de base de datos → clave i18n para oficiales (descripcion)
 */
const officerDescCodeMap: Record<string, keyof Translations['officers']> = {
  commander: 'commanderDesc',
  admiral: 'admiralDesc',
  engineer: 'engineerDesc',
  geologist: 'geologistDesc',
  technocrat: 'technocratDesc',
  android: 'androidDesc',
};

/**
 * Traduce el nombre de un edificio segun el codigo de la BD
 * Si no encuentra traduccion, devuelve el fallback (nombre de la BD)
 */
export function translateBuildingName(t: Translations, code: string, fallback: string): string {
  const key = buildingCodeMap[code];
  return key ? (t.buildings[key] as string) : fallback;
}

/**
 * Traduce el nombre de una tecnologia segun el codigo de la BD
 */
export function translateResearchName(t: Translations, code: string, fallback: string): string {
  const key = researchCodeMap[code];
  return key ? (t.research[key] as string) : fallback;
}

/**
 * Traduce el nombre de una nave segun el codigo de la BD
 */
export function translateShipName(t: Translations, code: string, fallback: string): string {
  const key = shipCodeMap[code];
  return key ? (t.shipyard[key] as string) : fallback;
}

/**
 * Traduce el nombre de una defensa segun el codigo de la BD
 */
export function translateDefenseName(t: Translations, code: string, fallback: string): string {
  const key = defenseCodeMap[code];
  return key ? (t.defense[key] as string) : fallback;
}

/**
 * Traduce cualquier nombre de entidad (edificio, tecnologia, nave o defensa)
 * Intenta en todos los mapas hasta encontrar una coincidencia
 */
export function translateEntityName(t: Translations, code: string, fallback: string): string {
  return buildingCodeMap[code] ? (t.buildings[buildingCodeMap[code]] as string)
    : researchCodeMap[code] ? (t.research[researchCodeMap[code]] as string)
    : shipCodeMap[code] ? (t.shipyard[shipCodeMap[code]] as string)
    : defenseCodeMap[code] ? (t.defense[defenseCodeMap[code]] as string)
    : fallback;
}

/**
 * Descripciones del tema imperio para tecnologias (por codigo de BD).
 * La BD no se toca: esto es solo texto visible en el frontend.
 */
const techDescriptionTheme: Record<string, string> = {
  espionage_tech: 'Informa sobre ejércitos y defensas enemigas. A mayor nivel, más detalles de las ciudades ajenas.',
  computer_tech: 'Amplía los registros del imperio para poder enviar más escuadrones a la vez.',
  weapons_tech: 'Mejora el poder de ataque de todas tus unidades.',
  shielding_tech: 'Refuerza los escudos de todas tus unidades.',
  armour_tech: 'Blindajes más resistentes para todas tus tropas.',
  energy_tech: 'Más poder para las construcciones del imperio.',
  hyperspace_tech: 'Permite mapear nuevos continentes y explorar más allá.',
  combustion_drive: 'Fuego básico para caravanas y unidades ligeras. Bajo consumo pero poca velocidad.',
  impulse_drive: 'Cabalgaduras rápidas para unidades medianas. Equilibrio entre velocidad y consumo.',
  hyperspace_drive: 'Los caminos del imperio llevan a tus ejércitos lejos en poco tiempo.',
  laser_tech: 'Haces de luz para tus torres de defensa.',
  ion_tech: 'Rayos capaces de desactivar las defensas enemigas.',
  plasma_tech: 'La llama purificadora, devastadora contra cualquier muralla.',
  intergalactic_research_network: 'Une las academias de todas tus ciudades para investigar más rápido.',
  astrophysics: 'Estudia los cielos para fundar nuevas ciudades.',
  graviton_tech: 'Conocimiento prohibido necesario para reclutar al Centurión.',
  metal_production: 'Aumenta la producción de hierro de tus minas.',
  crystal_production: 'Aumenta la producción de piedra de tus canteras.',
  deuterium_production: 'Aumenta la producción de comida de tus granjas.',
  matter_manipulation: 'Manipula la materia para acelerar la producción del imperio.',
  expedition: 'Envía campañas de exploración en busca de tesoros y recursos.',
};

/**
 * Devuelve la descripcion tematica de una tecnologia segun su codigo de BD.
 * Si no hay descripcion tematica, devuelve la original de la BD.
 */
export function translateTechDescription(code: string, fallback: string): string {
  return techDescriptionTheme[code] ?? fallback;
}

/**
 * Nombres de planeta por defecto de la BD traducidos al tema imperio (UI-only).
 * Los nombres personalizados por el jugador se muestran tal cual.
 */
const planetNameTheme: Record<string, string> = {
  'Planeta Principal': 'Ciudad Principal',
};

export function translatePlanetName(name: string): string {
  return planetNameTheme[name] ?? name;
}

/**
 * Imágenes locales de edificios del tema imperio (por codigo de BD).
 * La BD no se toca: si no hay imagen tematica se usa la URL original.
 */
const buildingImageTheme: Record<string, string> = {
  metal_mine: '/Imagenes/Edificios/Mina de hierro bajo la luz de antorchas.webp',
  crystal_mine: '/Imagenes/Edificios/Mina de Cristales Violeta resplandeciente.webp',
  deuterium_synthesizer: '/Imagenes/Edificios/Laboratorio de alquimia bajo la montaña.webp',
  solar_plant: '/Imagenes/Edificios/Templo del Sol Radiante.webp',
  fusion_reactor: '/Imagenes/Edificios/Forja arcana bajo el resplandor de cristales.webp',
  metal_storage: '/Imagenes/Edificios/Almacén medieval de hierro y brasas.webp',
  crystal_storage: '/Imagenes/Edificios/Bóveda real de gemas y tesoros.webp',
  deuterium_tank: '/Imagenes/Edificios/Depósito medieval de combustible industrial.webp',
  robotics_factory: '/Imagenes/Edificios/Forja Épica del Gremio Enano.webp',
  shipyard: '/Imagenes/Edificios/Falcon Banner Barracks and Training Yard.webp',
  research_lab: '/Imagenes/Edificios/Biblioteca Imperial de Sabiduría Dorada.webp',
  alliance_depot: '/Imagenes/Edificios/Sunlit Royal Granary Hall.webp',
  missile_silo: '/Imagenes/Edificios/Arsenal medieval bajo estandartes dorados.webp',
  nanite_factory: '/Imagenes/Edificios/Taller de ingeniería medieval steampunk.webp',
  terraformer: '/Imagenes/Edificios/Construcción del castillo bajo estandartes dorados.webp',
  sensor_phalanx: '/Imagenes/Edificios/Torre Imperial del Telescopio Celestial.webp',
  jump_gate: '/Imagenes/Edificios/Portal imperial de luz dorada.webp',
  university: '/Imagenes/Edificios/Sunlit Fantasy Academy Courtyard and Library.webp',
};

export function getBuildingImage(code: string, fallback: string | null | undefined): string | null | undefined {
  const themed = buildingImageTheme[code];
  return themed ? encodeURI(themed) : fallback;
}

/**
 * Imágenes locales de tropas del tema imperio (por codigo de BD).
 * La BD no se toca: si no hay imagen tematica se usa la URL original.
 */
const shipImageTheme: Record<string, string> = {
  small_cargo: '/Imagenes/Barraca/Caravana-.webp',
  large_cargo: '/Imagenes/Barraca/Caravana-Grande.webp',
  light_fighter: '/Imagenes/Barraca/Jinete Ligero.webp',
  heavy_fighter: '/Imagenes/Barraca/Arquero Auxiliar.webp',
  cruiser: '/Imagenes/Barraca/Eques.webp',
  battleship: '/Imagenes/Barraca/Legionario Pesado.webp',
  colony_ship: '/Imagenes/Barraca/Colono.webp',
  recycler: '/Imagenes/Barraca/Carroñero.webp',
  battlecruiser: '/Imagenes/Barraca/Pretoriano.webp',
  destroyer: '/Imagenes/Barraca/Ariete.webp',
  deathstar: '/Imagenes/Barraca/Centurión.webp',
  pathfinder: '/Imagenes/Barraca/Explorador_11zon.webp',
  nova: '/Imagenes/Barraca/Tribuno.webp',
  large_frigate: '/Imagenes/Barraca/Trirreme.webp',
  destruccion_masiva: '/Imagenes/Barraca/Legado Imperial.webp',
  espionage_probe: '/Imagenes/Barraca/Speculator.webp',
  bomber: '/Imagenes/Barraca/Onagro.webp',
  solar_satellite: '/Imagenes/Barraca/Fuente de Mana _11zon.webp',
  mega_recycler: '/Imagenes/Barraca/Carroñero Mayor.webp',
  dark_matter_collector: '/Imagenes/Barraca/Augur-de-Plutón.webp',
  occupation_ship: '/Imagenes/Barraca/Guardián.webp',
};

export function getShipImage(code: string, fallback: string | null | undefined): string | null | undefined {
  const themed = shipImageTheme[code];
  return themed ? encodeURI(themed) : fallback;
}

/**
 * Imágenes locales de defensas del tema imperio (por codigo de BD).
 * Se activan a medida que se generan las imágenes en /Imagenes/Defensas/.
 */
const defenseImageTheme: Record<string, string> = {
  rocket_launcher: '/Imagenes/Defensas/Funditor_11zon.webp',
  light_laser: '/Imagenes/Defensas/Turris_11zon.webp',
  heavy_laser: '/Imagenes/Defensas/Turris Magna_11zon.webp',
  gauss_cannon: '/Imagenes/Defensas/Ballista_11zon.webp',
  ion_cannon: '/Imagenes/Defensas/Scorpio_11zon.webp',
  plasma_turret: '/Imagenes/Defensas/Turris Ignea_11zon.webp',
  small_shield_dome: '/Imagenes/Defensas/Tholus Menor_11zon.webp',
  large_shield_dome: '/Imagenes/Defensas/Tholus Mayor_11zon.webp',
  anti_ballistic_missiles: '/Imagenes/Defensas/Pilum_11zon.webp',
  anti_ballistic_missile: '/Imagenes/Defensas/Pilum_11zon.webp',
  interplanetary_missiles: '/Imagenes/Defensas/Pilum de Asedio_11zon.webp',
  interplanetary_missile: '/Imagenes/Defensas/Pilum de Asedio_11zon.webp',
  graviton_cannon: '/Imagenes/Defensas/Catapulta_11zon.webp',
  outer_protection_dome: '/Imagenes/Defensas/Vallum_11zon.webp',
  orbital_defense_platform: '/Imagenes/Defensas/Arx Caeli_11zon.webp',
};

export function getDefenseImage(code: string, fallback: string | null | undefined): string | null | undefined {
  const themed = defenseImageTheme[code];
  return themed ? encodeURI(themed) : fallback;
}

/**
 * Traduce el nombre de un oficial segun el codigo de la BD
 */
export function translateOfficerName(t: Translations, code: string, fallback: string): string {
  const key = officerCodeMap[code];
  return key ? (t.officers[key] as string) : fallback;
}

/**
 * Traduce la descripcion de un oficial segun el codigo de la BD
 */
export function translateOfficerDescription(t: Translations, code: string, fallback: string): string {
  const key = officerDescCodeMap[code];
  return key ? (t.officers[key] as string) : fallback;
}
