// INFO : app/routes/index.tsx
import React from 'react';
import { Navigate } from 'react-router';

export default function IndexRoute() {
    // Rediriger vers /splash comme page d'accueil par défaut
    return <Navigate to="/splash" replace />;
}