/**
 * Layout public (sans auth) : splash, login.
 * Aucune barre de navigation, juste le contenu des routes enfants.
 */
import React from 'react';
import { Outlet } from 'react-router';

export default function PublicLayout() {
    return <Outlet />;
}
