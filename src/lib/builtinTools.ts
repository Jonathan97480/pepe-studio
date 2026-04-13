export type BuiltinTool = {
    id: string;
    label: string;
    icon: string;
    description: string;
};

export const BUILTIN_TOOLS: BuiltinTool[] = [
    { id: "terminal",   label: "Terminal PowerShell",    icon: "🖥",  description: "Exécuter des commandes PowerShell (cmd ponctuel, terminaux persistants)" },
    { id: "skills",     label: "Gestion des Skills",     icon: "🧩", description: "Créer et exécuter des skills PS1, Python, Node.js, HTTP, composite" },
    { id: "http",       label: "Appels HTTP / REST",     icon: "🌐", description: "Requêtes HTTP directes (GET, POST, PUT, DELETE, PATCH)" },
    { id: "search_web", label: "Recherche Web",          icon: "🔍", description: "Chercher des infos en temps réel (DuckDuckGo, Brave, Serper, Tavily)" },
    { id: "scrape_url", label: "Web Scraping",           icon: "📄", description: "Extraire le contenu d'une page web (statique ou JavaScript)" },
    { id: "files",      label: "Fichiers disque",        icon: "📁", description: "Lire, écrire et patcher des fichiers sur le disque" },
    { id: "images",     label: "Gestion d'images",       icon: "🖼", description: "Sauvegarder et télécharger des images (data URL / URL HTTP)" },
    { id: "browser",    label: "Navigateur intégré",     icon: "🌍", description: "Ouvrir des pages web, démarrer un serveur de développement local, capturer les erreurs JS" },
    { id: "context7",   label: "Documentation Context7", icon: "📚", description: "Documentation officielle à jour pour 86 000+ bibliothèques" },
    { id: "mcp",        label: "Serveurs MCP",           icon: "⚙",  description: "Créer et utiliser des serveurs MCP Node.js pour des outils personnalisés" },
    { id: "memory",     label: "Mémoire conversations",  icon: "💾", description: "Chercher dans l'historique des conversations passées" },
    { id: "planning",   label: "Planification (PLAN.md)","icon": "📋", description: "Créer et maintenir un plan de tâches autonome (PLAN.md)" },
    { id: "profile",    label: "Profil utilisateur",     icon: "👤", description: "Mémoriser silencieusement les infos personnelles de l'utilisateur" },
    { id: "python",     label: "Projets Python",         icon: "🐍", description: "Guide pour créer des projets Python avec environnement virtuel (venv)" },
];

const BUILTIN_STORAGE_KEY = "customapp_builtin_disabled";

export function loadBuiltinDisabled(): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(BUILTIN_STORAGE_KEY);
        if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set();
}

export function saveBuiltinDisabled(disabled: Set<string>): void {
    try {
        localStorage.setItem(BUILTIN_STORAGE_KEY, JSON.stringify([...disabled]));
    } catch { /* ignore */ }
}
