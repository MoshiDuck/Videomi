// INFO : app/components/AuthGuard.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';

interface AuthGuardProps {
    children: React.ReactNode;
    requireAuth?: boolean;
    redirectTo?: string;
}

export function AuthGuard({
                              children,
                              requireAuth = true,
                              redirectTo = '/login'
                          }: AuthGuardProps) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <LoadingSpinner />;
    }

    // Si l'authentification est requise mais l'utilisateur n'est pas connecté
    if (requireAuth && !user) {
        return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }

    // Si l'authentification n'est pas requise mais l'utilisateur est connecté
    if (!requireAuth && user) {
        return <Navigate to="/home" replace />;
    }

    return <>{children}</>;
}