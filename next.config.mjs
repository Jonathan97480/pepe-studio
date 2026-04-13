const nextConfig = {
    reactStrictMode: true,
    // Désactiver le fichier trace (EPERM sur Windows quand verrouillé par un process précédent)
    outputFileTracing: false,
    // Export statique requis pour le bundle Tauri (.exe)
    output: "export",
};

export default nextConfig;
