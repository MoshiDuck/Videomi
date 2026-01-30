/**
 * Configuration centralisée des routes (React Router v7).
 * - Layouts : _public (splash, login) et _app (toutes les pages authentifiées).
 * - Code splitting automatique par route (lazy loading).
 * - Route splat "*" en dernier pour la page 404.
 */
import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
    index("routes/index.tsx"),

    layout("routes/_public.tsx", [
        route("splash", "routes/splash.tsx"),
        route("login", "routes/login.tsx"),
    ]),

    layout("routes/_app.tsx", [
        route("home", "routes/home.tsx"),
        route("profile", "routes/profile.tsx"),
        route("upload", "routes/upload.tsx"),
        route("musics", "routes/musics.tsx"),
        route("films", "routes/films.tsx"),
        route("series", "routes/series.tsx"),
        route("videos", "routes/videosRedirect.tsx"),
        route("images", "routes/images.tsx"),
        route("documents", "routes/documents.tsx"),
        route("archives", "routes/archives.tsx"),
        route("executables", "routes/executables.tsx"),
        route("others", "routes/others.tsx"),
        route("reader/:category/:fileId", "routes/reader.tsx"),
        route("match/:category/:fileId", "routes/match.tsx"),
        route("info/:category/:fileId", "routes/info.tsx"),
    ]),

    route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
