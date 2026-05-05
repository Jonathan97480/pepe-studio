$file = "e:\CustomApp\src\hooks\useToolCalling.ts"
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)
$total = $lines.Length

# Lignes AVANT le bloc de parsing JSON (0-indexed 0..251)
$before = $lines[0..251]
# Lignes APRES le bloc (0-indexed 362..)
$after = $lines[362..($total - 1)]

# Nouveau bloc de remplacement
$replacement = @(
    "                        const { parsed, error: parseError } = parseToolBlock(toolMatch[1]);",
    "                        if (parseError !== null || parsed === null) {",
    "                            jsonParseErrorCountRef.current += 1;",
    "                            const attempt = jsonParseErrorCountRef.current;",
    "                            const config: Partial<LlamaLaunchConfig> = {",
    "                                modelPath,",
    "                                temperature,",
    "                                contextWindow,",
    "                                turboQuant,",
    "                                sampling,",
    "                                thinkingEnabled,",
    "                                systemPrompt: machineContext",
    '                                    ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")',
    "                                    : systemPrompt,",
    "                            };",
    "                            setToolRunning(true);",
    "                            const errMsg = buildToolParseError(toolMatch[1], parseError, attempt);",
    "                            if (attempt > 2) jsonParseErrorCountRef.current = 0;",
    "                            sendPrompt(errMsg, config).finally(() => setToolRunning(false));",
    "                            return;",
    "                        }",
    "                        jsonParseErrorCountRef.current = 0;"
)

$newLines = $before + $replacement + $after
[System.IO.File]::WriteAllLines($file, $newLines, [System.Text.Encoding]::UTF8)

$finalCount = (Get-Content $file).Count
Write-Host "Succes: $finalCount lignes (attendu ~968)"
