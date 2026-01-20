// INFO : app/components/UserProfile.tsx
import React from 'react';
import type { User } from '~/types/auth';

interface UserProfileProps {
    user: User;
    onLogout: () => void;
}

export function UserProfile({ user, onLogout }: UserProfileProps) {
    return (
        <div style={{
            backgroundColor: '#f8f9fa',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
            marginBottom: '20px',
            maxWidth: '300px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                {user.picture && (
                    <img
                        src={user.picture}
                        alt="avatar"
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            marginRight: '12px',
                            border: '2px solid #4285f4'
                        }}
                    />
                )}
                <div>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '16px' }}>
                        {user.name || 'Utilisateur'}
                    </p>
                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                        {user.email}
                    </p>
                </div>
            </div>

            <div style={{
                fontSize: '13px',
                color: '#555',
                marginBottom: '16px',
                backgroundColor: 'white',
                padding: '10px',
                borderRadius: '6px'
            }}>
                <p style={{ margin: '4px 0' }}>
                    <strong>ID:</strong> <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>{user.id}</code>
                </p>
                {user.email_verified !== undefined && (
                    <p style={{ margin: '4px 0' }}>
                        <strong>Email vérifié:</strong> {user.email_verified ? '✅ Oui' : '❌ Non'}
                    </p>
                )}
            </div>

            <button
                onClick={onLogout}
                style={{
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    width: '100%',
                    transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d32f2f'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f44336'}
            >
                Se déconnecter
            </button>
        </div>
    );
}