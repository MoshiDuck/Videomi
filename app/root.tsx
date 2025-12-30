// INFO : app/root.tsx
import React from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
    return (
        <html lang="fr">
        <head>
            <Meta />
            <Links />
        </head>
        <body>
        <AuthProvider>
            <Outlet />
        </AuthProvider>
        <ScrollRestoration />
        <Scripts />
        </body>
        </html>
    );
}