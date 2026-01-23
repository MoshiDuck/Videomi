// INFO : app/routes.ts
// Dans React Router v7, toutes les routes sont automatiquement lazy-loaded
// Il suffit de spécifier le chemin du fichier route et React Router s'occupe du code splitting
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/index.tsx"),  // Redirige vers /splash
    route("splash", "routes/splash.tsx"),  // Écran de démarrage
    route("login", "routes/login.tsx"),  // Page de connexion
    route("home", "routes/home.tsx"),  // Page d'accueil
    
    // Routes automatiquement lazy-loaded (code splitting automatique)
    route("profile", "routes/profile.tsx"),
    route("upload", "routes/upload.tsx"),
    route("musics", "routes/musics.tsx"),
    route("films", "routes/films.tsx"),  // Films uniquement
    route("series", "routes/series.tsx"),  // Séries uniquement
    route("videos", "routes/videosRedirect.tsx"),  // Redirige vers /films
    route("images", "routes/images.tsx"),
    route("documents", "routes/documents.tsx"),
    route("archives", "routes/archives.tsx"),
    route("executables", "routes/executables.tsx"),
    route("others", "routes/others.tsx"),
    route("reader/:category/:fileId", "routes/reader.tsx"),
    route("match/:category/:fileId", "routes/match.tsx"),
    route("info/:category/:fileId", "routes/info.tsx")
] satisfies RouteConfig;