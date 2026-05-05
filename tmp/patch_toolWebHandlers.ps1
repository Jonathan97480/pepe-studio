$file = "e:\CustomApp\src\lib\toolWebHandlers.ts"
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)
$total = $lines.Length
Write-Host "Total: $total lignes"

# Bloc SD à remplacer : lignes 100-381 (0-indexed 99..380)
# La ligne 0-indexed 99 commence par "const DEFAULT_IMAGE_NEGATIVE_PROMPT"
# La ligne 0-indexed 381 est avant "function formatExternalBrowserFiles"

# Vérification
Write-Host "Ligne 99: $($lines[99])"
Write-Host "Ligne 381: $($lines[381])"
Write-Host "Ligne 382: $($lines[382])"

# Lignes avant le bloc SD (0..98) = lignes 1..99 du fichier
$before = $lines[0..98]

# Lignes après le bloc SD (353..) = à partir de "function formatExternalBrowserFiles"
$after = $lines[353..($total - 1)]

Write-Host "before=$($before.Length) after=$($after.Length)"

# Nouveau bloc : import depuis sdPromptUtils + wrapper getStringToolValue local
$replacement = @(
    "import {",
    "    DEFAULT_IMAGE_NEGATIVE_PROMPT,",
    "    addTokensIfMissing,",
    "    enhancePrompt,",
    "    extractAspectRatioFromPrompt,",
    "    getPresetConfig,",
    "    isLikelyFrench,",
    "    resolvePreset,",
    "    type ImagePreset,",
    "} from `"./sdPromptUtils`";",
    ""
)

$newLines = $before + $replacement + $after
[System.IO.File]::WriteAllLines($file, $newLines, [System.Text.Encoding]::UTF8)

$finalCount = (Get-Content $file).Count
Write-Host "Nouveau total: $finalCount lignes (was $total, reduction: $($total - $finalCount))"
