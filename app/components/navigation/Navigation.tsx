// INFO : app/components/Navigation.tsx
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { User } from '~/types/auth';
import { darkTheme } from '~/utils/ui/theme';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { useLanguage } from '~/contexts/LanguageContext';
import { LanguageSelector } from '~/components/ui/LanguageSelector';

interface NavigationProps {
    user: User;
    onLogout: () => void;
}

export function Navigation({ user, onLogout }: NavigationProps) {
    const location = useLocation();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const { t } = useLanguage();

    const isActive = (path: string) => location.pathname === path;

    return (
        <nav style={{
            backgroundColor: darkTheme.background.nav,
            padding: '16px 0',
            marginBottom: '30px',
            boxShadow: darkTheme.shadow.small
        }}>
            <div style={{
                maxWidth: 1200,
                margin: '0 auto',
                padding: '0 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                    <Link
                        to="/home"
                        style={{
                            color: darkTheme.text.primary,
                            textDecoration: 'none',
                            fontSize: '22px',
                            fontWeight: '700',
                            letterSpacing: '-0.5px',
                            transition: darkTheme.transition.normal
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '0.8';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                        }}
                    >
                        Videomi
                    </Link>

                    <div style={{ display: 'flex', gap: '20px' }}>
                        <Link
                            to="/home"
                            aria-current={isActive('/home') ? 'page' : undefined}
                            style={{
                                color: isActive('/home') ? darkTheme.accent.blue : darkTheme.text.secondary,
                                textDecoration: 'none',
                                padding: '10px 16px',
                                borderRadius: darkTheme.radius.medium,
                                backgroundColor: isActive('/home') ? darkTheme.surface.info : 'transparent',
                                transition: darkTheme.transition.normal,
                                fontWeight: isActive('/home') ? '600' : '500',
                                fontSize: '15px'
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive('/home')) {
                                    e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                                    e.currentTarget.style.color = darkTheme.text.primary;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive('/home')) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = darkTheme.text.secondary;
                                }
                            }}
                        >
                            {t('nav.home')}
                        </Link>

                        <Link
                            to="/upload"
                            aria-current={isActive('/upload') ? 'page' : undefined}
                            style={{
                                color: isActive('/upload') ? darkTheme.accent.blue : darkTheme.text.secondary,
                                textDecoration: 'none',
                                padding: '10px 16px',
                                borderRadius: darkTheme.radius.medium,
                                backgroundColor: isActive('/upload') ? darkTheme.surface.info : 'transparent',
                                transition: darkTheme.transition.normal,
                                fontWeight: isActive('/upload') ? '600' : '500',
                                fontSize: '15px'
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive('/upload')) {
                                    e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                                    e.currentTarget.style.color = darkTheme.text.primary;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive('/upload')) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = darkTheme.text.secondary;
                                }
                            }}
                        >
                            {t('nav.upload')}
                        </Link>

                        <Link
                            to="/films"
                            aria-current={isActive('/films') || isActive('/series') || isActive('/musics') || isActive('/images') || isActive('/documents') || isActive('/archives') || isActive('/executables') || isActive('/others') ? 'page' : undefined}
                            style={{
                                color: isActive('/films') || isActive('/series') || isActive('/musics') || isActive('/images') || isActive('/documents') || isActive('/archives') || isActive('/executables') || isActive('/others') ? darkTheme.accent.blue : darkTheme.text.secondary,
                                textDecoration: 'none',
                                padding: '10px 16px',
                                borderRadius: darkTheme.radius.medium,
                                backgroundColor: isActive('/films') || isActive('/series') || isActive('/musics') || isActive('/images') || isActive('/documents') || isActive('/archives') || isActive('/executables') || isActive('/others') ? darkTheme.surface.info : 'transparent',
                                transition: darkTheme.transition.normal,
                                fontWeight: isActive('/films') || isActive('/series') || isActive('/musics') || isActive('/images') || isActive('/documents') || isActive('/archives') || isActive('/executables') || isActive('/others') ? '600' : '500',
                                fontSize: '15px'
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive('/films') && !isActive('/series') && !isActive('/musics') && !isActive('/images') && !isActive('/documents') && !isActive('/archives') && !isActive('/executables') && !isActive('/others')) {
                                    e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                                    e.currentTarget.style.color = darkTheme.text.primary;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive('/films') && !isActive('/series') && !isActive('/musics') && !isActive('/images') && !isActive('/documents') && !isActive('/archives') && !isActive('/executables') && !isActive('/others')) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = darkTheme.text.secondary;
                                }
                            }}
                        >
                            {t('nav.files')}
                        </Link>

                        <Link
                            to="/profile"
                            aria-current={isActive('/profile') ? 'page' : undefined}
                            style={{
                                color: isActive('/profile') ? darkTheme.accent.blue : darkTheme.text.secondary,
                                textDecoration: 'none',
                                padding: '10px 16px',
                                borderRadius: darkTheme.radius.medium,
                                backgroundColor: isActive('/profile') ? darkTheme.surface.info : 'transparent',
                                transition: darkTheme.transition.normal,
                                fontWeight: isActive('/profile') ? '600' : '500',
                                fontSize: '15px'
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive('/profile')) {
                                    e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                                    e.currentTarget.style.color = darkTheme.text.primary;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive('/profile')) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = darkTheme.text.secondary;
                                }
                            }}
                        >
                            {t('nav.profile')}
                        </Link>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <LanguageSelector compact={true} />
                    
                    {user.picture && (
                        <img
                            src={user.picture}
                            alt="avatar"
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                border: `2px solid ${darkTheme.accent.blue}`
                            }}
                        />
                    )}

                    <button
                        onClick={() => setShowLogoutConfirm(true)}
                        style={{
                            backgroundColor: 'transparent',
                            color: darkTheme.accent.red,
                            border: `1px solid ${darkTheme.accent.red}`,
                            padding: '8px 16px',
                            borderRadius: darkTheme.radius.medium,
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            transition: darkTheme.transition.normal
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = darkTheme.accent.red;
                            e.currentTarget.style.color = darkTheme.text.primary;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = darkTheme.accent.red;
                        }}
                    >
                        {t('nav.logout')}
                    </button>
                </div>
            </div>

            <ConfirmDialog
                isOpen={showLogoutConfirm}
                title={t('dialogs.logoutTitle')}
                message={t('dialogs.logoutMessage')}
                confirmText={t('nav.logout')}
                cancelText={t('common.cancel')}
                confirmColor={darkTheme.accent.red}
                onConfirm={() => {
                    setShowLogoutConfirm(false);
                    onLogout();
                }}
                onCancel={() => setShowLogoutConfirm(false)}
            />
        </nav>
    );
}