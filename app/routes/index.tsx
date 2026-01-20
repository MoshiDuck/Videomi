// INFO : app/routes/index.tsx
import React from 'react';
import { Navigate } from 'react-router';

export default function IndexRoute() {
    // Rediriger vers /login comme page d'accueil par défaut
    return <Navigate to="/login" replace />;
}