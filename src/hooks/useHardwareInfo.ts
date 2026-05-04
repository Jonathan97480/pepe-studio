import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

export interface HardwareInfo {
    total_ram_gb: number;
    cpu_threads: number;
    gpu_name: string;
    gpu_vram_gb: number;
    has_dedicated_gpu: boolean;
}

/** Formatte la chaîne GPU pour l'affichage dans le contexte système. */
export function formatGpuString(hw: HardwareInfo): string {
    return hw.has_dedicated_gpu
        ? `${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go VRAM)`
        : "GPU intégré / non détecté";
}

/**
 * Hook léger d'accès aux informations matérielles via Tauri.
 * Expose un cache d'état et une fonction de récupération.
 */
export function useHardwareInfo() {
    const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);

    const fetchHardwareInfo = useCallback(async (): Promise<HardwareInfo> => {
        const hw = await invoke<HardwareInfo>("get_hardware_info");
        setHardwareInfo(hw);
        return hw;
    }, []);

    return { hardwareInfo, fetchHardwareInfo };
}
