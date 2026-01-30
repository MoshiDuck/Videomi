/**
 * Layout principal authentifié : shell commun à toutes les pages app (home, upload, films, etc.).
 * - AuthGuard : redirection vers /login si non connecté
 * - Navigation : barre de navigation avec prefetch
 * - Indicateur de chargement global pendant les navigations
 * - Transition de page : le main disparaît pendant le chargement (opacity 0), puis la nouvelle page apparaît en fondu (évite de voir deux pages en même temps)
 * - Focus a11y : après navigation, focus sur #main-content
 * - ErrorBoundary pour les erreurs dans les routes enfants
 */
import React, { useEffect, useRef } from 'react';
import { Outlet, useNavigation, useLocation, useRouteError } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { Navigation } from '~/components/navigation/Navigation';
import { PageTransition } from '~/components/navigation/PageTransition';
import { AppLayoutLoadingBar } from '~/components/navigation/AppLayoutLoadingBar';
import { darkTheme } from '~/utils/ui/theme';

export default function AppLayout() {
    const { user, logout } = useAuth();
    const navigation = useNavigation();
    const location = useLocation();
    const mainRef = useRef<HTMLElement>(null);
    const isNavigating = navigation.state === 'loading';

    // Focus sur le contenu principal après chaque navigation (a11y : clavier / lecteur d'écran)
    useEffect(() => {
        if (navigation.state === 'idle' && mainRef.current) {
            mainRef.current.focus({ preventScroll: true });
        }
    }, [location.pathname, location.search, navigation.state]);

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                <AppLayoutLoadingBar visible={isNavigating} />
                <Navigation user={user!} onLogout={logout} />
                <main
                    ref={mainRef}
                    tabIndex={-1}
                    style={{
                        maxWidth: 1200,
                        margin: '0 auto',
                        padding: '0 20px 40px',
                        fontFamily: 'system-ui, sans-serif',
                        outline: 'none',
                        opacity: isNavigating ? 0 : 1,
                        transition: 'opacity 0.12s ease-out',
                        pointerEvents: isNavigating ? 'none' : 'auto',
                    }}
                    role="main"
                    id="main-content"
                >
                    <PageTransition key={location.pathname}>
                        <Outlet />
                    </PageTransition>
                </main>
            </div>
        </AuthGuard>
    );
}

/**
 * ErrorBoundary au niveau du layout app : erreurs API, loaders, etc.
 * Affiche un message lisible et un lien pour réessayer / retour.
 */
export function ErrorBoundary() {
    const error = useRouteError() as Error | { status?: number; statusText?: string; data?: unknown } | undefined;
    const message =
        error instanceof Error
            ? error.message
            : error && typeof error === 'object' && 'statusText' in error
              ? (error.statusText as string) || `Erreur ${error.status ?? 500}`
              : 'Erreur inconnue';

    return (
        <div
            style={{
                padding: 40,
                textAlign: 'center',
                color: darkTheme.text.primary,
            }}
            role="alert"
        >
            <h2 style={{ marginBottom: 16 }}>Une erreur est survenue</h2>
            <p style={{ color: darkTheme.text.secondary, marginBottom: 24 }}>{message}</p>
            <a
                href="/home"
                style={{
                    color: darkTheme.accent.blue,
                    textDecoration: 'underline',
                }}
            >
                Retour à l&apos;accueil
            </a>
        </div>
    );
}
