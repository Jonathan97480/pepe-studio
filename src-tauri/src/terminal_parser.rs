//! Parseurs purs pour les commandes terminal.
//! Aucune dépendance Tauri — facilement testables en isolation.

/// Marqueur injecté dans la sortie pour récupérer le cwd courant après chaque commande.
pub const CWD_MARKER: &str = "###PEPESTUDIO_CWD###";

/// Parse une chaîne de commande en (programme, args).
/// Gère les guillemets simples et doubles.
pub fn parse_command(cmd: &str) -> (String, Vec<String>) {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_double = false;
    let mut in_single = false;

    for ch in cmd.chars() {
        match ch {
            '"' if !in_single => in_double = !in_double,
            '\'' if !in_double => in_single = !in_single,
            ' ' | '\t' if !in_double && !in_single => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    if tokens.is_empty() {
        return (cmd.to_string(), vec![]);
    }
    let prog = tokens.remove(0);
    (prog, tokens)
}

/// Retourne un message d'erreur si la commande nécessite un terminal interactif (PTY).
/// Utilisé par `terminal_exec` pour bloquer les commandes inadaptées.
pub fn requires_interactive(cmd: &str) -> Option<&'static str> {
    let first = cmd
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();
    let bin = first.split(['/', '\\']).last().unwrap_or(&first);
    match bin {
        "ssh" | "telnet" | "ftp" | "sftp" => Some(
            "⚠️ Cette commande requiert un terminal interactif.\n\
             Utilise terminal_start_interactive (pas terminal_exec) pour SSH et autres sessions interactives.\n\
             L'utilisateur pourra saisir son mot de passe / ses commandes directement dans l'interface.",
        ),
        "top" | "htop" | "btop" => Some(
            "❌ Moniteurs interactifs non supportés. Utilisez Get-Process (PowerShell) ou ps aux.",
        ),
        "vim" | "vi" | "nano" | "emacs" | "less" | "more" => Some(
            "❌ Éditeurs/pagers interactifs non supportés. Utilisez l'outil 'files' pour lire/écrire des fichiers.",
        ),
        "python" | "python3" | "node" | "irb" | "php" | "lua" => {
            if cmd.trim().split_whitespace().nth(1).is_none() {
                Some(
                    "⚠️ REPL interactif — utilise terminal_start_interactive ou passe un fichier/-c en argument.",
                )
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Extrait le nouveau cwd du marqueur et retourne (sortie nettoyée, nouveau_cwd).
pub fn extract_cwd(raw: &str, fallback: &str) -> (String, String) {
    let mut new_cwd = fallback.to_string();
    let mut clean: Vec<&str> = Vec::new();
    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix(CWD_MARKER) {
            let c = rest.trim().to_string();
            if !c.is_empty() {
                new_cwd = c;
            }
        } else {
            clean.push(line);
        }
    }
    while clean.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        clean.pop();
    }
    let output = if clean.is_empty() {
        "(aucune sortie)".to_string()
    } else {
        clean.join("\n")
    };
    (output, new_cwd)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple() {
        let (prog, args) = parse_command("git commit -m \"hello world\"");
        assert_eq!(prog, "git");
        assert_eq!(args, vec!["commit", "-m", "hello world"]);
    }

    #[test]
    fn parse_empty() {
        let (prog, args) = parse_command("");
        assert_eq!(prog, "");
        assert!(args.is_empty());
    }

    #[test]
    fn extract_cwd_basic() {
        let raw = format!("output line\n{}E:/Projects/foo", CWD_MARKER);
        let (out, cwd) = extract_cwd(&raw, "/fallback");
        assert_eq!(out, "output line");
        assert_eq!(cwd, "E:/Projects/foo");
    }

    #[test]
    fn extract_cwd_fallback() {
        let (out, cwd) = extract_cwd("just output", "/fallback");
        assert_eq!(out, "just output");
        assert_eq!(cwd, "/fallback");
    }

    #[test]
    fn requires_interactive_ssh() {
        assert!(requires_interactive("ssh user@host").is_some());
    }

    #[test]
    fn requires_interactive_git() {
        assert!(requires_interactive("git push").is_none());
    }

    #[test]
    fn requires_interactive_python_repl() {
        assert!(requires_interactive("python").is_some());
        assert!(requires_interactive("python script.py").is_none());
    }
}
