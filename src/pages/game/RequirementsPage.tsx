import { useState, useEffect } from 'react';
import { BookOpen, Building2, Scroll, Swords, Shield, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGameStore } from '../../store/gameStore';
import { useI18n, translateBuildingName, translateResearchName, translateShipName, translateDefenseName } from '../../lib/i18n';

interface RequirementItem {
  id: number;
  code: string;
  name: string;
  category?: string;
  requirements: {
    building_id?: number;
    building_name?: string;
    building_code?: string;
    building_level: number;
    tech_id?: number;
    tech_name?: string;
    tech_code?: string;
    tech_level: number;
  }[];
}

type TabType = 'buildings' | 'technologies' | 'ships' | 'defenses';

const HIDDEN_SHIP_CODES = new Set(['falco_x_clasica', 'dark_matter_collector']);

// Reintenta la consulta si falla (p.ej. 429 por limite de peticiones)
async function withRetry<T extends { error: unknown }>(run: () => PromiseLike<T>, attempts = 4): Promise<T> {
  let res = await run();
  for (let i = 1; i < attempts && res.error; i++) {
    await new Promise(r => setTimeout(r, 700 * i));
    res = await run();
  }
  return res;
}

export function RequirementsPage() {
  const { t } = useI18n();
  const { currentPlanet, buildings, technologies } = useGameStore();
  const [activeTab, setActiveTab] = useState<TabType>('buildings');
  const [buildingItems, setBuildingItems] = useState<RequirementItem[]>([]);
  const [techItems, setTechItems] = useState<RequirementItem[]>([]);
  const [shipItems, setShipItems] = useState<RequirementItem[]>([]);
  const [defenseItems, setDefenseItems] = useState<RequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAllRequirements();
  }, []);

  const loadAllRequirements = async () => {
    setLoading(true);
    try {
      // Usar FK explicitas para evitar ambiguedad en relaciones inversas
      // building_types tiene 2 FKs desde building_requirements (building_type_id y required_building_id)
      // technology_types tiene 2 FKs desde technology_requirements (technology_type_id y required_tech_id)
      const [buildingsRes, techRes, shipsRes, defensesRes] = await Promise.all([
        withRetry(() => supabase.from('building_types').select(`
          id, code, name, category,
          building_requirements!building_requirements_building_type_id_fkey (
            required_building_id,
            required_building_level,
            required_tech_id,
            required_tech_level
          )
        `).order('id')),
        withRetry(() => supabase.from('technology_types').select(`
          id, code, name, category,
          technology_requirements!technology_requirements_technology_type_id_fkey (
            required_building_id,
            required_building_level,
            required_tech_id,
            required_tech_level
          )
        `).order('id')),
        withRetry(() => supabase.from('ship_types').select(`
          id, code, name, category,
          ship_requirements!ship_requirements_ship_type_id_fkey (
            required_building_id,
            required_building_level,
            required_tech_id,
            required_tech_level
          )
        `).order('id')),
        withRetry(() => supabase.from('defense_types').select(`
          id, code, name,
          defense_requirements!defense_requirements_defense_type_id_fkey (
            required_building_id,
            required_building_level,
            required_tech_id,
            required_tech_level
          )
        `).order('id')),
      ]);

      const buildingTypes = (buildingsRes.data || []) as { id: number; name: string; code: string }[];
      const techTypes = (techRes.data || []) as { id: number; name: string; code: string }[];
      const buildingNames = new Map(buildingTypes.map(b => [b.id, b.name]));
      const techNames = new Map(techTypes.map(t => [t.id, t.name]));
      const buildingCodes = new Map(buildingTypes.map(b => [b.id, b.code]));
      const techCodes = new Map(techTypes.map(t => [t.id, t.code]));

      const processItems = (data: any[], reqKey: string): RequirementItem[] => {
        return data.map(item => ({
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          requirements: (item[reqKey] || []).map((req: any) => ({
            building_id: req.required_building_id,
            building_name: req.required_building_id ? buildingNames.get(req.required_building_id) : undefined,
            building_code: req.required_building_id ? buildingCodes.get(req.required_building_id) : undefined,
            building_level: req.required_building_level || 0,
            tech_id: req.required_tech_id,
            tech_name: req.required_tech_id ? techNames.get(req.required_tech_id) : undefined,
            tech_code: req.required_tech_id ? techCodes.get(req.required_tech_id) : undefined,
            tech_level: req.required_tech_level || 0,
          })).filter((req: any) => req.building_id || req.tech_id),
        }));
      };

      setBuildingItems(processItems(buildingsRes.data || [], 'building_requirements'));
      setTechItems(processItems(techRes.data || [], 'technology_requirements'));
      setShipItems(processItems((shipsRes.data || []).filter((s: any) => !HIDDEN_SHIP_CODES.has(s.code)), 'ship_requirements'));
      setDefenseItems(processItems(defensesRes.data || [], 'defense_requirements'));
    } catch (error) {
      console.error('Error loading requirements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBuildingLevel = (buildingId: number): number => {
    const building = buildings.find(b => b.building_type_id === buildingId);
    return building?.level || 0;
  };

  const getTechLevel = (techId: number): number => {
    const tech = technologies.find(t => t.technology_type_id === techId);
    return tech?.level || 0;
  };

  const isRequirementMet = (req: RequirementItem['requirements'][0]): boolean => {
    if (req.building_id && getBuildingLevel(req.building_id) < req.building_level) {
      return false;
    }
    if (req.tech_id && getTechLevel(req.tech_id) < req.tech_level) {
      return false;
    }
    return true;
  };

  const areAllRequirementsMet = (item: RequirementItem): boolean => {
    if (item.requirements.length === 0) return true;
    return item.requirements.every(isRequirementMet);
  };

  const toggleExpand = (key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'buildings', label: t.nav.buildings, icon: <Building2 className="w-5 h-5" /> },
    { key: 'technologies', label: t.nav.research, icon: <Scroll className="w-5 h-5" /> },
    { key: 'ships', label: t.nav.fleet, icon: <Swords className="w-5 h-5" /> },
    { key: 'defenses', label: t.nav.defense, icon: <Shield className="w-5 h-5" /> },
  ];

  const getActiveItems = (): RequirementItem[] => {
    switch (activeTab) {
      case 'buildings': return buildingItems;
      case 'technologies': return techItems;
      case 'ships': return shipItems;
      case 'defenses': return defenseItems;
    }
  };

  const renderRequirementRow = (item: RequirementItem) => {
    const key = `${activeTab}-${item.id}`;
    const isExpanded = expandedItems.has(key);
    const allMet = areAllRequirementsMet(item);
    const hasRequirements = item.requirements.length > 0;
    const displayName = activeTab === 'buildings' ? translateBuildingName(t, item.code, item.name)
      : activeTab === 'technologies' ? translateResearchName(t, item.code, item.name)
      : activeTab === 'ships' ? translateShipName(t, item.code, item.name)
      : translateDefenseName(t, item.code, item.name);

    return (
      <div key={key} className="border-b border-space-700 last:border-b-0">
        <div
          className={`flex items-center gap-4 p-4 ${hasRequirements ? 'cursor-pointer hover:bg-space-700/30' : ''}`}
          onClick={() => hasRequirements && toggleExpand(key)}
        >
          <div className="flex-shrink-0 w-8">
            {hasRequirements ? (
              isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )
            ) : (
              <div className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1">
            <span className={allMet ? 'text-white' : 'text-gray-400'}>{displayName}</span>
          </div>

          <div className="flex-shrink-0">
            {hasRequirements ? (
              allMet ? (
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <Check className="w-4 h-4" />
                  {t.common.available}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-400 text-sm">
                  <X className="w-4 h-4" />
                  {t.common.locked}
                </span>
              )
            ) : (
              <span className="text-green-400 text-sm">{t.common.no_requirements}</span>
            )}
          </div>
        </div>

        {isExpanded && hasRequirements && (
          <div className="bg-space-800/50 px-4 pb-4 pl-16">
            <div className="space-y-2">
              {item.requirements.map((req, idx) => {
                const met = isRequirementMet(req);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    {met ? (
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <span className={met ? 'text-green-400' : 'text-red-400'}>
                      {req.building_name && (
                        <>
                          {translateBuildingName(t, req.building_code || '', req.building_name)} ({t.common.level}{' '}
                          <span className="font-mono">
                            {getBuildingLevel(req.building_id!)}/{req.building_level}
                          </span>
                          )
                        </>
                      )}
                      {req.tech_name && (
                        <>
                          {translateResearchName(t, req.tech_code || '', req.tech_name)} ({t.common.level}{' '}
                          <span className="font-mono">
                            {getTechLevel(req.tech_id!)}/{req.tech_level}
                          </span>
                          )
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const groupItemsByCategory = (items: RequirementItem[]) => {
    const groups: Record<string, RequirementItem[]> = {};
    items.forEach(item => {
      const cat = item.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  };

  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      resources: t.categories.resources,
      facilities: t.categories.facilities,
      storage: t.categories.storage,
      basic: t.categories.basic,
      propulsion: t.categories.propulsion,
      military: t.categories.military,
      advanced: t.categories.advanced,
      civil: t.categories.civil,
      combat: t.categories.combat,
      special: t.categories.special,
      general: t.categories.general,
    };
    return labels[category] || category;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-amber-100 flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-amber-400" />
          {t.nav.requirements}
        </h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-amber-500 text-stone-900'
                : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card-glass overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            {(() => {
              const items = getActiveItems();
              const grouped = groupItemsByCategory(items);
              const categories = Object.keys(grouped);

              if (categories.length <= 1) {
                return items.map(renderRequirementRow);
              }

              return categories.map(cat => (
                <div key={cat}>
                  <div className="bg-space-700/50 px-4 py-2 border-b border-space-600">
                    <h3 className="font-serif text-sm text-amber-300">{getCategoryLabel(cat)}</h3>
                  </div>
                  {grouped[cat].map(renderRequirementRow)}
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      <div className="card-glass p-4">
        <h3 className="font-orbitron text-sm text-gray-400 mb-2">{t.common.legend}</h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-gray-400">{t.requirements.met}</span>
          </div>
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 text-red-400" />
            <span className="text-gray-400">{t.requirements.pending}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
