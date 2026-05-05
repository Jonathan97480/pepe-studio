$file = "e:\CustomApp\src\lib\toolWebHandlers.ts"
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)
$total = $lines.Length

# Supprimer le bloc import misplacé (0-indexed 98..109 = lignes 99-110)
# Il est: ligne vide (98) + import { (99) + ...8 lignes... + } from sdPromptUtils (108) + ligne vide (109)
Write-Host "L98: '$($lines[98])'"
Write-Host "L99: '$($lines[99])'"
Write-Host "L109: '$($lines[109])'"
Write-Host "L110: '$($lines[110])'"

# Bloc misplacé: 0-indexed 98..109
$blockStart = 98
$blockEnd = 109

$importBlock = @(
    "import {",
    "    DEFAULT_IMAGE_NEGATIVE_PROMPT,",
    "    addTokensIfMissing,",
    "    enhancePrompt,",
    "    extractAspectRatioFromPrompt,",
    "    getPresetConfig,",
    "    isLikelyFrench,",
    "    resolvePreset,",
    "    type ImagePreset,",
    "} from `"./sdPromptUtils`";"
)

# Trouver la position d'insertion : après le dernier import de la liste d'imports du début
# On cherche la ligne "import type { LlamaLaunchConfig }" qui est la dernière
$insertAfter = -1
for ($i = 0; $i -lt 15; $i++) {
    if ($lines[$i] -match 'LlamaLaunchConfig') { $insertAfter = $i; break }
}
Write-Host "Insert after 0-indexed: $insertAfter (line $($insertAfter+1))"

# Construire le fichier sans le bloc misplacé
$withoutBlock = $lines[0..($blockStart - 1)] + $lines[($blockEnd + 1)..($total - 1)]

# Insérer le bloc au bon endroit
$newFile = $withoutBlock[0..$insertAfter] + @("") + $importBlock + $withoutBlock[($insertAfter + 1)..($withoutBlock.Length - 1)]

[System.IO.File]::WriteAllLines($file, $newFile, [System.Text.Encoding]::UTF8)
Write-Host "Done: $((Get-Content $file).Count) lignes"
