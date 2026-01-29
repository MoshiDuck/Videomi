# Exemples d'Intégration des API de Métadonnées

Ce document fournit des exemples concrets d'utilisation des API de métadonnées dans différents contextes.

## Exemple 1 : Enrichissement lors de l'Upload

```typescript
// workers/upload.ts
import { createMetadataApiManagerFromEnv } from '@/utils/media/api';

app.post('/api/upload/complete', async (c) => {
    const { fileId, category, filename } = await c.req.json();
    
    // Créer le gestionnaire d'API
    const apiManager = createMetadataApiManagerFromEnv(c.env);
    
    // Extraire le titre depuis le nom de fichier
    const title = extractTitleFromFilename(filename);
    
    // Rechercher les métadonnées
    let metadata = null;
    
    if (category === 'videos') {
        // Recherche avec fallback automatique
        metadata = await apiManager.searchWithFallback('videos', title, {
            type: 'both' // Films et séries
        });
    } else if (category === 'musics') {
        // Pour la musique, extraire aussi l'artiste si possible
        const { title: trackTitle, artist } = extractMusicInfo(filename);
        metadata = await apiManager.searchWithFallback('musics', trackTitle, {
            artist: artist
        });
    }
    
    if (metadata) {
        // Sauvegarder les métadonnées dans la base de données
        await c.env.DATABASE.prepare(`
            UPDATE files 
            SET metadata = ? 
            WHERE file_id = ?
        `).bind(JSON.stringify(metadata), fileId).run();
    }
    
    return c.json({ success: true, metadata });
});
```

## Exemple 2 : Recherche Manuelle par l'Utilisateur

```typescript
// app/routes/match.tsx
import { useState } from 'react';
import { createMetadataApiManagerFromEnv } from '@/utils/media/api';

export default function MatchRoute() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MediaMatch[]>([]);
    const [loading, setLoading] = useState(false);
    
    const handleSearch = async () => {
        setLoading(true);
        try {
            // Récupérer les clés API depuis le serveur
            const config = await fetch('/api/config').then(r => r.json());
            
            // Créer le gestionnaire
            const apiManager = createMetadataApiManagerFromEnv(config);
            
            // Rechercher (exemple pour vidéos)
            const result = await apiManager.search('videos', query, {
                type: 'both'
            });
            
            setResults(result?.matches || []);
        } catch (error) {
            console.error('Erreur recherche:', error);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div>
            <input 
                value={query} 
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un film, série..."
            />
            <button onClick={handleSearch} disabled={loading}>
                {loading ? 'Recherche...' : 'Rechercher'}
            </button>
            
            <ul>
                {results.map((match) => (
                    <li key={match.id}>
                        <img src={match.thumbnail_url || ''} alt={match.title} />
                        <div>
                            <h3>{match.title}</h3>
                            {match.year && <p>Année: {match.year}</p>}
                            {match.description && <p>{match.description}</p>}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
```

## Exemple 3 : Endpoint API pour Recherche

```typescript
// workers/app.ts
import { createMetadataApiManagerFromEnv } from '@/utils/media/api';

app.get('/api/metadata/search', async (c) => {
    const category = c.req.query('category') as MediaCategory;
    const query = c.req.query('query');
    const type = c.req.query('type'); // 'movie', 'tv', 'both', etc.
    
    if (!category || !query) {
        return c.json({ error: 'Category and query required' }, 400);
    }
    
    const apiManager = createMetadataApiManagerFromEnv(c.env);
    
    try {
        const result = await apiManager.search(category, query, { type });
        return c.json(result);
    } catch (error) {
        console.error('Erreur recherche métadonnées:', error);
        return c.json({ error: 'Erreur lors de la recherche' }, 500);
    }
});

app.get('/api/metadata/details/:sourceId', async (c) => {
    const sourceId = c.req.param('sourceId');
    const source = c.req.query('source') as MetadataSource;
    const category = c.req.query('category') as MediaCategory;
    const type = c.req.query('type');
    
    if (!sourceId || !source || !category) {
        return c.json({ error: 'Missing required parameters' }, 400);
    }
    
    const apiManager = createMetadataApiManagerFromEnv(c.env);
    
    try {
        const details = await apiManager.getDetails(category, sourceId, source, { type });
        return c.json(details);
    } catch (error) {
        console.error('Erreur récupération détails:', error);
        return c.json({ error: 'Erreur lors de la récupération' }, 500);
    }
});
```

## Exemple 4 : Recherche de Sous-titres

```typescript
// workers/subtitles.ts
import { OpenSubtitlesApi } from '@/utils/media/api/subtitles';

app.post('/api/subtitles/search', async (c) => {
    const { fileHash, fileSize, imdbId, language } = await c.req.json();
    
    const opensubtitles = new OpenSubtitlesApi({
        enabled: !!c.env.OPENSUBTITLES_API_KEY,
        apiKey: c.env.OPENSUBTITLES_API_KEY,
        userAgent: 'Videomi/1.0',
        rateLimit: { maxRequests: 10, windowMs: 1000 }
    });
    
    if (!opensubtitles.isAvailable()) {
        return c.json({ error: 'OpenSubtitles non configuré' }, 400);
    }
    
    try {
        const result = await opensubtitles.search('', {
            fileHash,
            fileSize,
            imdbId,
            language: language || 'fr,en'
        });
        
        return c.json(result);
    } catch (error) {
        console.error('Erreur recherche sous-titres:', error);
        return c.json({ error: 'Erreur lors de la recherche' }, 500);
    }
});

app.post('/api/subtitles/download', async (c) => {
    const { subtitleId } = await c.req.json();
    
    const opensubtitles = new OpenSubtitlesApi({
        enabled: !!c.env.OPENSUBTITLES_API_KEY,
        apiKey: c.env.OPENSUBTITLES_API_KEY,
        userAgent: 'Videomi/1.0',
        rateLimit: { maxRequests: 10, windowMs: 1000 }
    });
    
    try {
        const downloadUrl = await opensubtitles.downloadSubtitle(subtitleId);
        if (downloadUrl) {
            return c.json({ downloadUrl });
        } else {
            return c.json({ error: 'Impossible de télécharger' }, 404);
        }
    } catch (error) {
        console.error('Erreur téléchargement sous-titre:', error);
        return c.json({ error: 'Erreur lors du téléchargement' }, 500);
    }
});
```

## Exemple 5 : Enrichissement Musique avec Fallback

```typescript
// workers/music-enrichment.ts
import { createMusicApis, MetadataApiFallback } from '@/utils/media/api';

async function enrichMusicMetadata(filename: string, env: Bindings) {
    const { title, artist } = extractMusicInfo(filename);
    
    // Créer les API musique
    const musicApis = createMusicApis({
        musicbrainz: {
            enabled: true,
            userAgent: 'Videomi/1.0 (https://videomi.uk)',
            rateLimit: { maxRequests: 1, windowMs: 1000 }
        },
        spotify: {
            enabled: !!env.SPOTIFY_CLIENT_ID && !!env.SPOTIFY_CLIENT_SECRET,
            clientId: env.SPOTIFY_CLIENT_ID,
            clientSecret: env.SPOTIFY_CLIENT_SECRET,
            rateLimit: { maxRequests: 10, windowMs: 1000 }
        },
        discogs: {
            enabled: true,
            token: env.DISCOGS_API_TOKEN,
            userAgent: 'Videomi/1.0 (https://videomi.uk)',
            rateLimit: { maxRequests: env.DISCOGS_API_TOKEN ? 60 : 25, windowMs: 60000 }
        }
    });
    
    // Créer le fallback
    const fallback = new MetadataApiFallback(musicApis);
    
    // Rechercher avec fallback automatique
    const result = await fallback.search(title, { artist });
    
    if (result && result.matches.length > 0) {
        const bestMatch = result.matches[0];
        
        // Récupérer les détails complets
        const details = await fallback.getDetails(
            bestMatch.source_id,
            bestMatch.source_api,
            {}
        );
        
        return details;
    }
    
    return null;
}
```

## Exemple 6 : Utilisation avec Images Fanart.tv

```typescript
// workers/images.ts
import { FanartTvApi } from '@/utils/media/api/images';

app.get('/api/images/movie/:tmdbId', async (c) => {
    const tmdbId = parseInt(c.req.param('tmdbId'));
    
    const fanart = new FanartTvApi({
        enabled: !!c.env.FANARTTV_API_KEY,
        apiKey: c.env.FANARTTV_API_KEY,
        rateLimit: { maxRequests: 10, windowMs: 1000 }
    });
    
    if (!fanart.isAvailable()) {
        return c.json({ error: 'Fanart.tv non configuré' }, 400);
    }
    
    try {
        const images = await fanart.getMovieImages(tmdbId);
        return c.json(images);
    } catch (error) {
        console.error('Erreur récupération images:', error);
        return c.json({ error: 'Erreur lors de la récupération' }, 500);
    }
});
```

## Exemple 7 : Recherche Anime avec AniList

```typescript
// workers/anime.ts
import { AniListApi } from '@/utils/media/api/anime-manga';

app.get('/api/anime/search', async (c) => {
    const query = c.req.query('query');
    const type = c.req.query('type') || 'both'; // 'ANIME', 'MANGA', 'both'
    
    const anilist = new AniListApi({
        enabled: true,
        rateLimit: { maxRequests: 90, windowMs: 60000 }
    });
    
    try {
        const result = await anilist.search(query, {
            type: type as 'ANIME' | 'MANGA' | 'both'
        });
        
        return c.json(result);
    } catch (error) {
        console.error('Erreur recherche anime:', error);
        return c.json({ error: 'Erreur lors de la recherche' }, 500);
    }
});
```

## Exemple 8 : Recherche Livres avec Google Books

```typescript
// workers/books.ts
import { GoogleBooksApi } from '@/utils/media/api/books';

app.get('/api/books/search', async (c) => {
    const query = c.req.query('query');
    const isbn = c.req.query('isbn');
    
    const googleBooks = new GoogleBooksApi({
        enabled: true,
        apiKey: c.env.GOOGLE_BOOKS_API_KEY,
        rateLimit: { maxRequests: 10, windowMs: 1000 }
    });
    
    try {
        const result = await googleBooks.search(query, { isbn });
        return c.json(result);
    } catch (error) {
        console.error('Erreur recherche livres:', error);
        return c.json({ error: 'Erreur lors de la recherche' }, 500);
    }
});
```

## Notes Importantes

1. **Rate Limiting** : Toutes les API gèrent automatiquement le rate limiting. Ne pas faire de boucles sans délai.

2. **Cache** : Les résultats sont mis en cache automatiquement pendant 7 jours. Pour forcer une nouvelle recherche, utilisez un paramètre unique dans la requête.

3. **Fallback** : Le système essaie automatiquement les API suivantes si la première ne trouve rien. Vous n'avez pas besoin de gérer cela manuellement.

4. **Erreurs** : Toujours gérer les erreurs avec try/catch. Les API peuvent échouer pour diverses raisons (rate limit, réseau, etc.).

5. **Configuration** : Vérifiez toujours que les clés API sont configurées avant d'utiliser une API (`api.isAvailable()`).
