// INFO : app/components/PublicRoute.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/contexts/AuthContext';

interface PublicRouteProps {
    children: React.ReactNode;
}

const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
    const { isAuthenticated, loading, verifyToken } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [hasChecked, setHasChecked] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            if (hasChecked) return;

            const isValid = await verifyToken();
            if (isValid && !loading) {
                console.log('✅ Déjà authentifié, redirection vers /home');
                // Éviter la boucle
                if (location.pathname !== '/home') {
                    navigate('/home', {
                        replace: true,
                        state: { from: location.pathname }
                    });
                }
            }
            setHasChecked(true);
        };

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

    if (isAuthenticated && hasChecked) {
        return null;
    }

    return <>{children}</>;
};

export default PublicRoute;