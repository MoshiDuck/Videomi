/**
 * Page 404 : route non trouvée.
 * Accessible via deep link, partageable, avec retour clair vers l'accueil.
 */
import React from 'react';
import { Link } from 'react-router';
import { darkTheme } from '~/utils/ui/theme';

export function meta() {
    return [
        { title: 'Page non trouvée | Videomi' },
        { name: 'robots', content: 'noindex' },
    ];
}

export default function NotFoundRoute() {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                backgroundColor: darkTheme.background.primary,
                color: darkTheme.text.primary,
                textAlign: 'center',
            }}
            role="main"
        >
            <h1
                style={{
                    fontSize: 'clamp(3rem, 10vw, 6rem)',
                    fontWeight: 700,
                    margin: 0,
                    color: darkTheme.text.secondary,
                }}
                aria-hidden="true"
            >
                404
            </h1>
            <p
                style={{
                    fontSize: '1.25rem',
                    color: darkTheme.text.secondary,
                    marginTop: 16,
                    marginBottom: 32,
                }}
            >
                Cette page n&apos;existe pas ou a été déplacée.
            </p>
            <Link
                to="/home"
                style={{
                    display: 'inline-block',
                    padding: '12px 24px',
                    backgroundColor: darkTheme.accent.blue,
                    color: '#fff',
                    borderRadius: darkTheme.radius.medium,
                    textDecoration: 'none',
                    fontWeight: 600,
                    transition: darkTheme.transition.normal,
                }}
            >
                Retour à l&apos;accueil
            </Link>
        </div>
    );
}
