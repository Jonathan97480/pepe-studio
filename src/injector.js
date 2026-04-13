// Script d'injection de Header et Footer (Robust DOM Manipulation)

const headerHTML = `
    <header class="app-header">
        <div class="header-content">
            <h1 class="logo">Pépé Studio</h1>
            <nav>
                <a href="index.html" class="nav-link active">Accueil</a>
                <a href="pages/projects.html" class="nav-link">Projets</a>
                <a href="pages/services.html" class="nav-link">Services</a>
                <a href="pages/contact.html" class="nav-link">Contact</a>
            </nav>
        </div>
    </header>
`;

const footerHTML = `
    <footer class="app-footer">
        <p>&copy; 2026 Pépé Studio. Développé par un Agent IA local.</p>
    </footer>
`;

function injectElements() {
    // --- 1. Injection du Header (Méthode DOM pour robustesse) ---
    const headerDiv = document.createElement('header');
    headerDiv.className = 'app-header';
    headerDiv.innerHTML = `
        <div class="header-content">
            <h1 class="logo">Pépé Studio</h1>
            <nav>
                <a href="index.html" class="nav-link">Accueil</a>
                <a href="pages/projects.html" class="nav-link">Projets</a>
                <a href="pages/services.html" class="nav-link">Services</a>
                <a href="pages/contact.html" class="nav-link">Contact</a>
            </nav>
        </div>
    </header>`;
    
    // S'assurer que l'élément est bien ajouté au corps du document
    document.body.prepend(headerDiv);

    // --- 2. Injection du Footer ---
    const footerDiv = document.createElement('footer');
    footerDiv.className = 'app-footer';
    footerDiv.innerHTML = `<p>&copy; 2026 Pépé Studio. Développé par un Agent IA local.</p>`;
    document.body.appendChild(footerDiv);
}

// Exécution lors du chargement complet du DOM
document.addEventListener('DOMContentLoaded', injectElements);

// NOTE: Si cette méthode échoue encore, c'est que le code de la page hôte écrase le body.
// Dans ce cas, nous devrons utiliser un script d'injection JS plus invasif.
