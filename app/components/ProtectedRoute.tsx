// INFO : app/components/ProtectedRoute.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, loading, verifyToken } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [hasChecked, setHasChecked] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            // Éviter les vérifications multiples
            if (hasChecked) return;

            const isValid = await verifyToken();
            if (!isValid && !loading) {
                console.log('🔒 Non authentifié, redirection vers /login');
                // Éviter la boucle en vérifiant qu'on n'est pas déjà sur /login
                if (location.pathname !== '/login') {
                    navigate('/login', {
                        replace: true,
                        state: { from: location.pathname }
                    });
                }
            }
            setHasChecked(true);
        };

        // Attendre que le chargement initial soit terminé
        if (!loading) {
            checkAuth();
        }
    }, [verifyToken, loading, navigate, location, hasChecked]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
            }}>
                <div>Chargement...</div>
            </div>
        );
    }

    // Si non authentifié ET qu'on a fini de vérifier, retourner null (en attente de redirection)
    if (!isAuthenticated && hasChecked) {
        return null;
    }

    return <>{children}</>;
};

export default ProtectedRoute;