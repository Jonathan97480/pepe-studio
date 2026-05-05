$filePath = "e:\CustomApp\src\hooks\useLlama.ts"
$lines = [System.IO.File]::ReadAllLines($filePath, [System.Text.Encoding]::UTF8)

# Supprimer les lignes 126-186 (index 125-185) = les 3 useCallback
# Remplacer par un commentaire
$before = $lines[0..124]
$comment = "    // normalizeVisibleAssistantText, isCorruptedThinkingChunk, detectRepetitionLoop"
$comment2 = "    // sont des fonctions pures importees depuis src/lib/streamUtils.ts"
$after = $lines[186..($lines.Length - 1)]

$newLines = $before + $comment + $comment2 + $after
[System.IO.File]::WriteAllLines($filePath, $newLines, [System.Text.Encoding]::UTF8)
Write-Host "Suppression des useCallback OK. Lignes totales: $($newLines.Length)"
