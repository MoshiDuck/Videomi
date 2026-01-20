// INFO : app/routes/videosRedirect.tsx
// Redirection de /videos vers /films

import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function VideosRedirect() {
    const navigate = useNavigate();
    
    useEffect(() => {
        navigate('/films', { replace: true });
    }, [navigate]);
    
    return null;
}
