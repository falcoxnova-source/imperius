/**
 * BuildingCard - Tarjeta individual de edificio
 * Muestra informacion del edificio, costos, produccion y boton de mejora
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Clock,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  TrendingUp,
  Zap,
  Sun,
  Warehouse,
  Droplets,
  X,
  CheckCircle,
  ShieldAlert,
} from 'lucide-react';
import { formatNumber, formatTime, formatTimeRemaining } from '../../../lib/utils';
import { translateBuildingName, getBuildingImage } from '../../../lib/i18n';
import { MediaDisplay } from '../../../components/ui/MediaDisplay';
import type { BuildingType } from '../../../types/game';
import type { BuildingProductionInfo } from './buildingUtils';

interface BuildingCardProps {
  buildingType: BuildingType;
  currentLevel: number;
  effectiveLevel: number;
  cost: { metal: number; crystal: number; deuterium: number };
  buildTime: number;
  isUpgrading?: boolean;
  isQueued?: boolean;
  queueCount?: number;
  canBuild: boolean;
  disabledReason?: string;
  missingReqs?: string[];
  allRequirements: { name: string; level: number; met: boolean }[];
  resources: { metal: number; crystal: number; deuterium: number } | null;
  endTime?: string;
  productionInfo: BuildingProductionInfo;
  energyBalance?: number;
  onBuild: () => void;
  onShowInfo: () => void;
  canDemolish: boolean;
  canAffordDemolishFxu?: boolean;
  demolishRefund: { metal: number; crystal: number; deuterium: number };
  onDemolish: () => void;
  isDemolishing?: boolean;
  fxuDemolishFee?: number;
  t: any;
}

function BuildingIcon({ code, imageUrl, className }: { code: string; imageUrl?: string; className?: string }) {
  if (imageUrl) {
    return (
      <MediaDisplay
        src={imageUrl}
        alt={code}
        className={`${className || 'w-8 h-8'} object-cover rounded-lg`}
      />
    );
  }
  return <Building2 className={className || 'w-8 h-8'} />;
}

function CostItem({
  label,
  value,
  available,
}: {
  label: string;
  value: number;
  available: number;
}) {
  const canAfford = available >= value;
  const resourceColors: Record<string, string> = {
    M: 'text-gray-400',
    C: 'text-cyan-400',
    D: 'text-green-400',
  };

  return (
    <div className={`bg-black/25 border border-amber-800/30 rounded px-2 py-1 flex-1 min-w-0 transition-all ${!canAfford ? 'ring-1 ring-red-500/30 bg-red-500/5' : ''}`}>
      <span className={`text-xs ${resourceColors[label] || 'text-gray-500'}`}>{label}:</span>
      <span className={`font-semibold text-xs ml-1 ${canAfford ? 'text-white' : 'text-cyber-red animate-pulse'}`}>
        {formatNumber(value)}
      </span>
    </div>
  );
}

export function BuildingCard({
  buildingType,
  currentLevel,
  effectiveLevel,
  cost,
  buildTime,
  isUpgrading,
  isQueued,
  queueCount,
  canBuild,
  disabledReason,
  missingReqs,
  allRequirements,
  resources,
  endTime,
  productionInfo,
  energyBalance,
  onBuild,
  onShowInfo,
  canDemolish,
  canAffordDemolishFxu,
  demolishRefund,
  onDemolish,
  isDemolishing,
  fxuDemolishFee,
  t,
}: BuildingCardProps) {
  const [showDemolishConfirm, setShowDemolishConfirm] = useState(false);
  const isMaxLevel = effectiveLevel >= buildingType.max_level;
  const hasImage = !!getBuildingImage(buildingType.code, buildingType.image_url);
  const isLocked = missingReqs && missingReqs.length > 0;

  return (
    <div
      data-tour={`building-${buildingType.code}`}
      className={`relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition-all hover:shadow-[0_0_0_2px_rgba(251,191,36,0.35),0_18px_48px_rgba(0,0,0,0.8)] ${isMaxLevel ? 'opacity-75' : ''} ${isUpgrading ? 'ring-2 ring-sky-400' : ''} ${isQueued ? 'ring-2 ring-sky-400/50' : ''}`}
    >
      <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
      <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
      <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
      <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />

      <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#2f2b25_0%,#1e1b16_45%,#0f0d0a_100%)] overflow-hidden">
      {/* Imagen/Header del edificio - clickeable para ver info */}
      <div className="relative mx-3 mt-2">
      <div className="mx-auto w-24 h-4 bg-gradient-to-b from-amber-300 to-amber-700 [clip-path:polygon(0_0,100%_0,50%_100%)]" />
      <button
        onClick={onShowInfo}
        className="relative w-full aspect-[2/1] bg-[radial-gradient(circle_at_50%_20%,#4a443a_0%,#241f17_60%,#120f0a_100%)] overflow-hidden group cursor-pointer rounded-b-xl border-x-[3px] border-b-[3px] border-amber-600/70"
      >
        {hasImage ? (
          <MediaDisplay
            src={getBuildingImage(buildingType.code, buildingType.image_url)!}
            alt={translateBuildingName(t, buildingType.code, buildingType.name)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BuildingIcon
              code={buildingType.code}
              imageUrl={getBuildingImage(buildingType.code, buildingType.image_url) ?? undefined}
              className="w-10 h-10 text-space-600 group-hover:text-cyber-blue transition-colors"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-space-900/90 via-transparent to-transparent" />

        {/* Badge de nivel */}
        <div className="absolute top-2 right-2 flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fde68a,#d97706)] text-stone-950 font-serif font-bold border border-amber-200 shadow-[0_3px_10px_rgba(0,0,0,0.6)]">
          <span className="text-sm">{t.buildings.tableLevel}{currentLevel}</span>
          {isQueued && queueCount && queueCount > 0 && (
            <span className="text-xs text-stone-700 ml-1">(+{queueCount})</span>
          )}
        </div>

        {/* Badge MAX */}
        {isMaxLevel && (
          <div className="absolute top-2 left-2 bg-emerald-500/20 backdrop-blur-sm px-2 py-1 rounded-full border border-emerald-500/50">
            <span className="text-xs text-emerald-300 font-semibold">MAX</span>
          </div>
        )}

        {/* Nombre del edificio */}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <div className="bg-gradient-to-b from-[#e8e2d5] to-[#c9c0ac] text-stone-900 text-center font-serif font-bold uppercase tracking-[0.15em] text-[11px] sm:text-sm px-2 py-1 rounded-sm shadow-[0_4px_14px_rgba(0,0,0,0.7)] border border-stone-400/70 truncate">
            {translateBuildingName(t, buildingType.code, buildingType.name)}
          </div>
        </div>
      </button>
      </div>

      {/* Contenido de la tarjeta */}
      <div className="p-2 sm:p-3 space-y-2">
        {/* Stats de produccion/energia/almacenamiento */}
        {(productionInfo.currentProduction !== undefined ||
          productionInfo.currentEnergy !== undefined ||
          productionInfo.currentStorage !== undefined) && (
          <div className="flex gap-1 text-center text-xs">
            {productionInfo.currentProduction !== undefined && (
              <div className="bg-black/25 border border-amber-800/30 rounded px-2 py-1 flex-1">
                <span className="text-gray-500">
                  <TrendingUp className="w-3 h-3 inline" />
                </span>
                <span className="text-white font-semibold ml-1">
                  {formatNumber(productionInfo.currentProduction)}
                </span>
              </div>
            )}
            {productionInfo.currentEnergy !== undefined && (
              <div className="bg-black/25 border border-amber-800/30 rounded px-2 py-1 flex-1">
                <span className="text-gray-500">
                  {productionInfo.isEnergyProducer ? (
                    <Sun className="w-3 h-3 inline" />
                  ) : (
                    <Zap className="w-3 h-3 inline" />
                  )}
                </span>
                <span
                  className={`font-semibold ml-1 ${
                    productionInfo.currentEnergy >= 0 ? 'text-cyber-green' : 'text-cyber-orange'
                  }`}
                >
                  {productionInfo.currentEnergy >= 0 ? '+' : ''}
                  {formatNumber(productionInfo.currentEnergy)}
                </span>
              </div>
            )}
            {productionInfo.currentDeutConsumption !== undefined && productionInfo.currentDeutConsumption > 0 && (
              <div className="bg-black/25 border border-amber-800/30 rounded px-2 py-1 flex-1">
                <span className="text-gray-500">
                  <Droplets className="w-3 h-3 inline" />
                </span>
                <span className="font-semibold ml-1 text-cyber-red">
                  -{formatNumber(productionInfo.currentDeutConsumption)}/h
                </span>
              </div>
            )}
            {productionInfo.currentStorage !== undefined && (
              <div className="bg-black/25 border border-amber-800/30 rounded px-2 py-1 flex-1">
                <span className="text-gray-500">
                  <Warehouse className="w-3 h-3 inline" />
                </span>
                <span className="text-white font-semibold ml-1">
                  {formatNumber(productionInfo.currentStorage)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Requisitos del edificio */}
        {allRequirements.length > 0 && (
          <div className="text-xs space-y-1 mb-2 p-2 bg-black/20 border border-amber-800/30 rounded-lg">
            <span className="text-gray-400 font-medium">{t.common.requirements}:</span>
            {allRequirements.map((req, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1 ${req.met ? 'text-cyber-green' : 'text-cyber-orange'}`}
              >
                <span className="font-bold">{req.met ? '✓' : '✗'}</span>
                <span>
                  {req.name} {t.buildings.tableLevel}{req.level}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Estado: Bloqueado, En construccion, o disponible para mejorar */}
        {isLocked ? (
          <div className="text-xs text-amber-400 flex items-center gap-1">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{t.common.lockedRequirements}</span>
          </div>
        ) : isUpgrading && endTime ? (
          <div className="bg-cyber-blue/10 border border-cyber-blue/30 px-2 py-1.5 rounded text-sm">
            <span className="text-gray-400">{t.buildings.tableLevel}{currentLevel + 1}: </span>
            <span className="font-orbitron text-cyber-blue">{formatTimeRemaining(endTime)}</span>
          </div>
        ) : !isMaxLevel ? (
          <>
            {/* Costos de recursos */}
            <div className="flex gap-1 text-xs">
              <CostItem label="M" value={cost.metal} available={resources?.metal || 0} />
              <CostItem label="C" value={cost.crystal} available={resources?.crystal || 0} />
              <CostItem label="D" value={cost.deuterium} available={resources?.deuterium || 0} />
            </div>

            {/* Impacto energético del upgrade */}
            {productionInfo.nextEnergy !== undefined && productionInfo.currentEnergy !== undefined && (() => {
              const energyChange = productionInfo.nextEnergy - productionInfo.currentEnergy;
              if (energyChange === 0) return null;
              const willCauseDeficit = energyBalance !== undefined && energyBalance >= 0 && energyBalance + energyChange < 0;
              const willWorsenDeficit = energyBalance !== undefined && energyBalance < 0 && energyChange < 0;
              const isPositiveChange = energyChange > 0;
              return (
                <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
                  willCauseDeficit ? 'bg-red-500/15 border border-red-500/30' :
                  willWorsenDeficit ? 'bg-orange-500/10 border border-orange-500/20' :
                  isPositiveChange ? 'bg-green-500/10 border border-green-500/20' :
                  'bg-black/25 border border-amber-800/30'
                }`}
                title={`${t.buildings.energyCurrent}: ${formatNumber(energyBalance ?? 0)} → ${t.buildings.energyAfter}: ${formatNumber((energyBalance ?? 0) + energyChange)}${willCauseDeficit ? ` ⚠ ${t.buildings.willEnterEnergyDeficit}` : ''}`}
                >
                  <Zap className={`w-3 h-3 ${
                    willCauseDeficit ? 'text-red-400' :
                    willWorsenDeficit ? 'text-cyber-orange' :
                    isPositiveChange ? 'text-cyber-green' :
                    'text-gray-400'
                  }`} />
                  <span className={`font-semibold ${
                    willCauseDeficit ? 'text-red-400' :
                    willWorsenDeficit ? 'text-cyber-orange' :
                    isPositiveChange ? 'text-cyber-green' :
                    'text-gray-400'
                  }`}>
                    {energyChange >= 0 ? '+' : ''}{formatNumber(energyChange)}
                  </span>
                  {energyBalance !== undefined && (
                    <span className={`text-[10px] ${
                      (energyBalance + energyChange) < 0 ? 'text-red-400' : 'text-gray-500'
                    }`}>
                      →{formatNumber(energyBalance + energyChange)}
                    </span>
                  )}
                  {willCauseDeficit && (
                    <span className="text-[10px] text-red-400 font-bold animate-pulse">⚠ {t.resources.deficit}</span>
                  )}
                </div>
              );
            })()}

            {/* Tiempo y boton de mejora */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-4 h-4" />
                {formatTime(buildTime)}
              </div>
              <div className="flex items-center gap-1.5">
                {canDemolish && (
                  <button
                    onClick={() => setShowDemolishConfirm(true)}
                    disabled={isDemolishing}
                    className="flex items-center gap-1 px-2 py-1.5 rounded font-semibold text-xs transition-all bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20"
                    title={t.common.demolish}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                )}
                {(() => {
                  const energyChange = (productionInfo.nextEnergy ?? 0) - (productionInfo.currentEnergy ?? 0);
                  const postBalance = (energyBalance ?? 0) + energyChange;
                  const upgradeWillDeficit = energyBalance !== undefined && energyChange < 0 && postBalance < 0 && energyBalance >= 0;
                  const alreadyDeficit = energyBalance !== undefined && energyBalance < 0;
                  const hasEnoughResources = resources ? resources.metal >= cost.metal && resources.crystal >= cost.crystal && resources.deuterium >= cost.deuterium : false;
                  const hasNoMissingReqs = !missingReqs || missingReqs.length === 0;
                  const allGood = canBuild && hasEnoughResources && hasNoMissingReqs && !upgradeWillDeficit;
                  const tooltipLines: string[] = [];
                  if (!canBuild) {
                    tooltipLines.push(`❌ ${t.buildings.cannotUpgradeAction}`);
                    if (disabledReason) tooltipLines.push(`   ${disabledReason}`);
                  } else if (allGood) {
                    tooltipLines.push(`✅ ${t.buildings.readyToUpgrade}`);
                  } else {
                    tooltipLines.push(`⚠ ${t.buildings.upgradeWithCaution}`);
                  }
                  if (!hasEnoughResources && resources) {
                    if (resources.metal < cost.metal) tooltipLines.push(`⛏ ${t.resources.metal}: ${t.buildings.missing} ${formatNumber(cost.metal - resources.metal)}`);
                    if (resources.crystal < cost.crystal) tooltipLines.push(`💎 ${t.resources.crystal}: ${t.buildings.missing} ${formatNumber(cost.crystal - resources.crystal)}`);
                    if (resources.deuterium < cost.deuterium) tooltipLines.push(`🧪 ${t.resources.deuterium}: ${t.buildings.missing} ${formatNumber(cost.deuterium - resources.deuterium)}`);
                  }
                  if (upgradeWillDeficit) {
                    tooltipLines.push(`⚡ ${t.buildings.energyDeficitWarning} ${formatNumber(energyBalance ?? 0)} → ${formatNumber(postBalance)}`);
                  } else if (alreadyDeficit && energyChange < 0) {
                    tooltipLines.push(`⚡ ${t.buildings.energyDeficitWorsen}: ${formatNumber(energyBalance ?? 0)} → ${formatNumber(postBalance)}`);
                  } else if (energyChange < 0 && postBalance >= 0) {
                    tooltipLines.push(`⚡ ${t.buildings.energyOk}: ${formatNumber(energyBalance ?? 0)} → ${formatNumber(postBalance)}`);
                  }
                  if (missingReqs && missingReqs.length > 0) {
                    tooltipLines.push(`🔒 ${t.common.requirements}: ${missingReqs.join(', ')}`);
                  }
                  const tooltip = tooltipLines.join('\n');
                  return (
                    <button
                      onClick={onBuild}
                      disabled={!canBuild}
                      className={`group/btn relative flex items-center gap-1 px-3 py-1.5 rounded font-semibold text-xs transition-all ${
                        !canBuild
                          ? 'bg-[#2a2014] text-amber-200/30 cursor-not-allowed border border-amber-800/40'
                          : upgradeWillDeficit
                            ? 'bg-gradient-to-b from-orange-400 to-orange-700 text-stone-950 font-bold cursor-pointer border border-orange-300/50 hover:from-orange-300 hover:to-orange-600'
                            : 'bg-gradient-to-b from-amber-300 via-amber-500 to-amber-800 text-stone-950 font-bold cursor-pointer hover:from-amber-200 hover:via-amber-400 hover:to-amber-700 shadow-[0_5px_16px_rgba(217,119,6,0.45)] hover:scale-105'
                      }`}
                      title={tooltip}
                    >
                      {!canBuild ? (
                        <ShieldAlert className="w-4 h-4" />
                      ) : allGood ? (
                        <CheckCircle className="w-4 h-4 group-hover/btn:animate-bounce" />
                      ) : upgradeWillDeficit ? (
                        <Zap className="w-4 h-4 animate-pulse" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                      {t.common.upgrade}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Mensaje de error si no puede construir */}
            {!canBuild && disabledReason && !isLocked && (
              <div className="flex items-start gap-1 text-xs text-amber-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{disabledReason}</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-gray-500 text-sm">MAX</span>
            {canDemolish && (
              <button
                onClick={() => setShowDemolishConfirm(true)}
                disabled={isDemolishing}
                className="flex items-center gap-1 px-2 py-1 rounded font-semibold text-xs transition-all bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20"
                title={t.common.demolish}
              >
                <ChevronDown className="w-3.5 h-3.5" />
                {t.common.demolish}
              </button>
            )}
          </div>
        )}
      </div>
      </div>

      {showDemolishConfirm && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowDemolishConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-space-800 border border-red-500/40 rounded-2xl overflow-hidden shadow-2xl shadow-red-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative p-5">
              <button
                onClick={() => setShowDemolishConfirm(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-space-700 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <ChevronDown className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-orbitron text-white text-base">{t.common.demolish}</h3>
                  <p className="text-sm text-gray-400">
                    {translateBuildingName(t, buildingType.code, buildingType.name)} {t.buildings.tableLevel}{currentLevel} → {currentLevel - 1}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                <p className="text-sm text-gray-300">{t.common.demolishConfirm}</p>

                {fxuDemolishFee && fxuDemolishFee > 0 ? (
                  <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20 flex items-center gap-2">
                    <img
                      src="https://photos.pinksale.finance/file/pinksale-logo-upload/1768281226806-7d493aae390e834e9654df6d97b11a99.jpg"
                      alt="TUNG"
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span className="text-xs text-red-300 font-semibold">Cost: {fxuDemolishFee.toLocaleString()} TUNG</span>
                  </div>
                ) : (
                  <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/20 flex items-center justify-center gap-2">
                    <span className="text-xs text-green-300 font-semibold">Gratis</span>
                  </div>
                )}

                <div className="bg-space-900/80 rounded-xl p-3 border border-space-700">
                  <p className="text-xs text-gray-400 mb-2 font-semibold">{t.common.demolishRefund}:</p>
                  <div className="flex gap-2 text-xs">
                    {demolishRefund.metal > 0 && (
                      <div className="bg-space-700/50 rounded px-2 py-1 flex-1">
                        <span className="text-gray-500">M:</span>
                        <span className="text-emerald-400 font-semibold ml-1">+{formatNumber(demolishRefund.metal)}</span>
                      </div>
                    )}
                    {demolishRefund.crystal > 0 && (
                      <div className="bg-space-700/50 rounded px-2 py-1 flex-1">
                        <span className="text-gray-500">C:</span>
                        <span className="text-emerald-400 font-semibold ml-1">+{formatNumber(demolishRefund.crystal)}</span>
                      </div>
                    )}
                    {demolishRefund.deuterium > 0 && (
                      <div className="bg-space-700/50 rounded px-2 py-1 flex-1">
                        <span className="text-gray-500">D:</span>
                        <span className="text-emerald-400 font-semibold ml-1">+{formatNumber(demolishRefund.deuterium)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDemolishConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-space-700 hover:bg-space-600 text-gray-300 font-semibold text-sm transition-all"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={() => {
                    setShowDemolishConfirm(false);
                    onDemolish();
                  }}
                  disabled={isDemolishing}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:text-red-300 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDemolishing ? t.common.loading : t.common.demolish}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
