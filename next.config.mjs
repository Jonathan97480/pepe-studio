const nextConfig = {
    reactStrictMode: true,
    // Désactiver le fichier trace (EPERM sur Windows quand verrouillé par un process précédent)
    outputFileTracing: false,
    // Tauri charge un bundle frontend statique local.
    // Ce mode exclut SSR et impose un routing compatible export.
    output: "export",
};

export default nextConfig;
