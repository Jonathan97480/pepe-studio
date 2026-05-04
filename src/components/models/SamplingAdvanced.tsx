"use client";

import { parseSamplingJson } from "../../hooks/useModels";
import type { SamplingSettings } from "../../context/ModelSettingsContext";
import { NumberParam, SectionHeader, SliderParam } from "./primitives";

interface SamplingAdvancedProps {
    filePath: string;
    samplingJson: string;
    openSections: Record<string, boolean>;
    toggleSection: (key: string) => void;
    onUpdate: (json: string) => void;
}

export function SamplingAdvanced({
    filePath,
    samplingJson,
    openSections,
    toggleSection,
    onUpdate,
}: SamplingAdvancedProps) {
    const s = parseSamplingJson(samplingJson);
    const updS = (key: keyof SamplingSettings, val: number | string) => onUpdate(JSON.stringify({ ...s, [key]: val }));

    return (
        <>
            {/* Sampling */}
            <SectionHeader
                title="Sampling"
                open={!!openSections[`${filePath}_sampling`]}
                toggle={() => toggleSection(`${filePath}_sampling`)}
            />
            {openSections[`${filePath}_sampling`] && (
                <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                    <SliderParam
                        label="Top P"
                        tooltip="Nucleus sampling : ne garde que les tokens dont la probabilité cumulée atteint ce seuil. 1.0 = désactivé. Défaut : 0.95"
                        value={s.topP}
                        onChange={(v) => updS("topP", v)}
                        min={0}
                        max={1}
                        step={0.01}
                    />
                    <NumberParam
                        label="Top K"
                        tooltip="Limite aux K tokens les plus probables. 0 = désactivé. Défaut : 40"
                        value={s.topK}
                        onChange={(v) => updS("topK", v)}
                        min={0}
                        max={500}
                    />
                    <SliderParam
                        label="Min P"
                        tooltip="Filtre les tokens en dessous de min_p × prob du meilleur token. 0.0 = désactivé. Défaut : 0.05"
                        value={s.minP}
                        onChange={(v) => updS("minP", v)}
                        min={0}
                        max={1}
                        step={0.01}
                    />
                    <SliderParam
                        label="Typical P"
                        tooltip="Sélectionne les tokens proches de l'entropie attendue. 1.0 = désactivé. Défaut : 1.0"
                        value={s.typicalP}
                        onChange={(v) => updS("typicalP", v)}
                        min={0}
                        max={1}
                        step={0.01}
                    />
                    <NumberParam
                        label="Top N Sigma"
                        tooltip="Ne garde que les tokens à N sigmas au-dessus de la moyenne des logits. -1 = désactivé. Défaut : -1"
                        value={s.topNSigma}
                        onChange={(v) => updS("topNSigma", v)}
                        min={-1}
                        max={10}
                        step={0.1}
                    />
                </div>
            )}

            {/* Pénalités */}
            <SectionHeader
                title="Pénalités"
                open={!!openSections[`${filePath}_penalties`]}
                toggle={() => toggleSection(`${filePath}_penalties`)}
            />
            {openSections[`${filePath}_penalties`] && (
                <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                    <SliderParam
                        label="Repeat Penalty"
                        tooltip="Pénalise la répétition de tokens. 1.0 = désactivé. Défaut : 1.0"
                        value={s.repeatPenalty}
                        onChange={(v) => updS("repeatPenalty", v)}
                        min={1}
                        max={2}
                        step={0.01}
                    />
                    <SliderParam
                        label="Frequency Penalty"
                        tooltip="Pénalité proportionnelle au nombre d'occurrences. 0.0 = désactivé. Défaut : 0.0"
                        value={s.frequencyPenalty}
                        onChange={(v) => updS("frequencyPenalty", v)}
                        min={0}
                        max={2}
                        step={0.01}
                    />
                    <SliderParam
                        label="Presence Penalty"
                        tooltip="Pénalité fixe pour tout token déjà apparu. 0.0 = désactivé. Défaut : 0.0"
                        value={s.presencePenalty}
                        onChange={(v) => updS("presencePenalty", v)}
                        min={0}
                        max={2}
                        step={0.01}
                    />
                    <NumberParam
                        label="Penalty Last N"
                        tooltip="Fenêtre de tokens pour les pénalités. 0 = désactivé, -1 = contexte entier. Défaut : 64"
                        value={s.penaltyLastN}
                        onChange={(v) => updS("penaltyLastN", v)}
                        min={-1}
                        max={2048}
                    />
                </div>
            )}

            {/* Mirostat */}
            <SectionHeader
                title="Mirostat"
                open={!!openSections[`${filePath}_mirostat`]}
                toggle={() => toggleSection(`${filePath}_mirostat`)}
            />
            {openSections[`${filePath}_mirostat`] && (
                <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                    <div
                        className="flex flex-col gap-1"
                        title="Sampling adaptatif. 0 = désactivé, 1 = v1, 2 = v2. Défaut : 0"
                    >
                        <span className="text-xs text-slate-400">Mirostat Mode</span>
                        <select
                            value={s.mirostat}
                            onChange={(e) => updS("mirostat", Number(e.target.value))}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                        >
                            <option value={0}>0 — Désactivé</option>
                            <option value={1}>1 — Mirostat v1</option>
                            <option value={2}>2 — Mirostat v2</option>
                        </select>
                    </div>
                    <SliderParam
                        label="Mirostat Tau"
                        tooltip="Entropie cible. Bas = focalisé, haut = créatif. Défaut : 5.0"
                        value={s.mirostatTau}
                        onChange={(v) => updS("mirostatTau", v)}
                        min={0}
                        max={10}
                        step={0.1}
                        decimals={1}
                    />
                    <SliderParam
                        label="Mirostat Eta"
                        tooltip="Taux d'apprentissage. Défaut : 0.1"
                        value={s.mirostatEta}
                        onChange={(v) => updS("mirostatEta", v)}
                        min={0}
                        max={1}
                        step={0.01}
                    />
                </div>
            )}

            {/* Température Dynamique */}
            <SectionHeader
                title="Température Dynamique"
                open={!!openSections[`${filePath}_dynatemp`]}
                toggle={() => toggleSection(`${filePath}_dynatemp`)}
            />
            {openSections[`${filePath}_dynatemp`] && (
                <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                    <SliderParam
                        label="DynaTemp Range"
                        tooltip="Plage de variation de température. 0.0 = désactivé. Défaut : 0.0"
                        value={s.dynaTempRange}
                        onChange={(v) => updS("dynaTempRange", v)}
                        min={0}
                        max={2}
                        step={0.01}
                    />
                    <SliderParam
                        label="DynaTemp Exponent"
                        tooltip="Exposant de la courbe entropie vers température. 1.0 = linéaire. Défaut : 1.0"
                        value={s.dynaTempExponent}
                        onChange={(v) => updS("dynaTempExponent", v)}
                        min={0.1}
                        max={5}
                        step={0.1}
                        decimals={1}
                    />
                </div>
            )}

            {/* XTC */}
            <SectionHeader
                title="XTC (eXtreme Token Culling)"
                open={!!openSections[`${filePath}_xtc`]}
                toggle={() => toggleSection(`${filePath}_xtc`)}
            />
            {openSections[`${filePath}_xtc`] && (
                <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                    <SliderParam
                        label="XTC Probability"
                        tooltip="Probabilité d'activer le culling XTC. 0.0 = désactivé. Défaut : 0.0"
                        value={s.xtcProbability}
                        onChange={(v) => updS("xtcProbability", v)}
                        min={0}
                        max={1}
                        step={0.01}
                    />
                    <SliderParam
                        label="XTC Threshold"
                        tooltip="Seuil au-dessus duquel un token peut être retiré par XTC. Défaut : 0.1"
                        value={s.xtcThreshold}
                        onChange={(v) => updS("xtcThreshold", v)}
                        min={0}
                        max={1}
                        step={0.01}
                    />
                </div>
            )}

            {/* DRY */}
            <SectionHeader
                title="DRY (Don't Repeat Yourself)"
                open={!!openSections[`${filePath}_dry`]}
                toggle={() => toggleSection(`${filePath}_dry`)}
            />
            {openSections[`${filePath}_dry`] && (
                <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                    <SliderParam
                        label="DRY Multiplier"
                        tooltip="Multiplicateur de pénalité DRY. 0.0 = désactivé. Défaut : 0.0"
                        value={s.dryMultiplier}
                        onChange={(v) => updS("dryMultiplier", v)}
                        min={0}
                        max={5}
                        step={0.1}
                        decimals={1}
                    />
                    <SliderParam
                        label="DRY Base"
                        tooltip="Base de la fonction exponentielle de pénalité. Défaut : 1.75"
                        value={s.dryBase}
                        onChange={(v) => updS("dryBase", v)}
                        min={1}
                        max={4}
                        step={0.05}
                    />
                    <NumberParam
                        label="DRY Allowed Length"
                        tooltip="Longueur max de séquence autorisée avant pénalité. Défaut : 2"
                        value={s.dryAllowedLength}
                        onChange={(v) => updS("dryAllowedLength", v)}
                        min={0}
                        max={100}
                    />
                    <NumberParam
                        label="DRY Penalty Last N"
                        tooltip="Fenêtre de recherche des séquences. -1 = contexte entier. Défaut : -1"
                        value={s.dryPenaltyLastN}
                        onChange={(v) => updS("dryPenaltyLastN", v)}
                        min={-1}
                        max={4096}
                    />
                </div>
            )}
        </>
    );
}
