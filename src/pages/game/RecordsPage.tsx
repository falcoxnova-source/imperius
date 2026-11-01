import { useState, useEffect } from 'react';
import { Trophy, Building2, Scroll, Swords, Shield, Crown, Loader2, Medal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n, translateBuildingName, translateResearchName, translateShipName, translateDefenseName } from '../../lib/i18n';
import { formatNumber } from '../../lib/utils';

type RecordCategory = 'buildings' | 'research' | 'ships' | 'defense';

interface RecordEntry {
  itemName: string;
  itemCode?: string;
  itemImage?: string;
  username: string;
  value: number;
  planetName?: string;
}

interface AllRecords {
  buildings: RecordEntry[];
  research: RecordEntry[];
  ships: RecordEntry[];
  defense: RecordEntry[];
}

const categoryIcons: Record<RecordCategory, React.ReactNode> = {
  buildings: <Building2 className="w-5 h-5" />,
  research: <Scroll className="w-5 h-5" />,
  ships: <Swords className="w-5 h-5" />,
  defense: <Shield className="w-5 h-5" />,
};

export function RecordsPage() {
  const { t } = useI18n();
  const [category, setCategory] = useState<RecordCategory>('buildings');
  const [allRecords, setAllRecords] = useState<AllRecords>({ buildings: [], research: [], ships: [], defense: [] });
  const [loading, setLoading] = useState(true);

  const categories: { key: RecordCategory; label: string; icon: React.ReactNode }[] = [
    { key: 'buildings', label: t.records.buildings, icon: categoryIcons.buildings },
    { key: 'research', label: t.records.research, icon: categoryIcons.research },
    { key: 'ships', label: t.records.ships, icon: categoryIcons.ships },
    { key: 'defense', label: t.records.defense, icon: categoryIcons.defense },
  ];

  useEffect(() => {
    fetchAllRecords();
  }, []);

  async function fetchAllRecords() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_universe_records');

      if (error) {
        console.error('Error fetching records:', error);
        setAllRecords({ buildings: [], research: [], ships: [], defense: [] });
        return;
      }

      const result = data as any;
      setAllRecords({
        buildings: (result.buildings || []).map((r: any) => ({
          itemName: r.item_name,
          itemCode: r.item_code,
          itemImage: r.item_image,
          username: r.username,
          value: r.value,
          planetName: r.planet_name,
        })),
        research: (result.research || []).map((r: any) => ({
          itemName: r.item_name,
          itemCode: r.item_code,
          itemImage: r.item_image,
          username: r.username,
          value: r.value,
        })),
        ships: (result.ships || []).map((r: any) => ({
          itemName: r.item_name,
          itemCode: r.item_code,
          itemImage: r.item_image,
          username: r.username,
          value: r.value,
          planetName: r.planet_name,
        })),
        defense: (result.defense || []).map((r: any) => ({
          itemName: r.item_name,
          itemCode: r.item_code,
          itemImage: r.item_image,
          username: r.username,
          value: r.value,
          planetName: r.planet_name,
        })),
      });
    } catch (err) {
      console.error('Error fetching records:', err);
      setAllRecords({ buildings: [], research: [], ships: [], defense: [] });
    } finally {
      setLoading(false);
    }
  }

  const records = allRecords[category];

  const getDisplayName = (record: RecordEntry) => {
    const code = record.itemCode ?? '';
    switch (category) {
      case 'buildings':
        return translateBuildingName(t, code, record.itemName);
      case 'research':
        return translateResearchName(t, code, record.itemName);
      case 'ships':
        return translateShipName(t, code, record.itemName);
      case 'defense':
        return translateDefenseName(t, code, record.itemName);
      default:
        return record.itemName;
    }
  };

  const getMedalColor = (index: number) => {
    if (index === 0) return 'text-yellow-400';
    if (index === 1) return 'text-gray-300';
    if (index === 2) return 'text-amber-600';
    return 'text-gray-500';
  };

  const valueLabel = category === 'buildings' || category === 'research'
    ? t.records.level
    : t.records.quantity;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Trophy className="w-7 h-7 text-yellow-400" />
        <h1 className="text-xl font-orbitron text-white">{t.records.title}</h1>
      </div>

      <p className="text-sm text-gray-400">{t.records.description}</p>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              category === cat.key
                ? 'bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/40'
                : 'bg-space-700 text-gray-400 border border-space-600 hover:bg-space-600 hover:text-gray-300'
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Records Table */}
      <div className="bg-space-800 border border-space-600 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-cyber-blue animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            {t.records.noRecords}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-space-600 bg-space-700/50">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">{t.records.item}</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">{t.records.player}</th>
                  {(category === 'buildings' || category === 'ships' || category === 'defense') && (
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">{t.records.planet}</th>
                  )}
                  <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">{valueLabel}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => (
                  <tr
                    key={record.itemName}
                    className="border-b border-space-700/50 hover:bg-space-700/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Medal className={`w-4 h-4 ${getMedalColor(index)}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {record.itemImage && (
                          <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-space-700 border border-space-600">
                            <img
                              src={record.itemImage}
                              alt={record.itemName}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <span className="text-sm text-white font-medium">{getDisplayName(record)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Crown className="w-3.5 h-3.5 text-yellow-500" />
                        <span className="text-sm text-cyber-blue font-medium">{record.username}</span>
                      </div>
                    </td>
                    {(category === 'buildings' || category === 'ships' || category === 'defense') && (
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {record.planetName || '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-400">
                        {category === 'buildings' || category === 'research'
                          ? record.value
                          : formatNumber(record.value)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
