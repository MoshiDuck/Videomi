/**
 * Tests : types metadata (StandardMetadata, MediaMatch, mapping)
 */
import { describe, it, expect } from 'vitest';
import type {
    StandardMetadata,
    MediaMatch,
    MediaSearchResult,
    MetadataSource,
    FilmMetadata,
    MusicMetadata
} from '../../app/types/metadata.js';

describe('MediaMatch', () => {
    it('expose les champs requis pour un film', () => {
        const match: MediaMatch = {
            id: 'tmdb_movie_27205',
            source_api: 'tmdb',
            source_id: '27205',
            title: 'Inception',
            year: 2010,
            thumbnail_url: 'https://image.tmdb.org/t/p/w500/xxx.jpg',
            description: 'A thief who steals...',
            genres: ['Action', 'Sci-Fi']
        };
        expect(match.source_api).toBeDefined();
        expect(match.source_id).toBeDefined();
        expect(match.title).toBeDefined();
        expect(match.year).toBeDefined();
        expect(match.thumbnail_url).toBeDefined();
    });

    it('expose les champs requis pour la musique', () => {
        const match: MediaMatch = {
            id: 'musicbrainz_xxx',
            source_api: 'musicbrainz',
            source_id: 'xxx',
            title: 'Bohemian Rhapsody',
            year: 1975,
            thumbnail_url: null,
            artist: 'Queen',
            album: 'A Night at the Opera'
        };
        expect(match.artist).toBeDefined();
        expect(match.album).toBeDefined();
    });
});

describe('MediaSearchResult', () => {
    it('contient matches et source', () => {
        const result: MediaSearchResult = {
            matches: [],
            total: 0,
            source: 'tmdb'
        };
        expect(result.matches).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.source).toBe('tmdb');
    });
});

describe('StandardMetadata', () => {
    it('champs critiques présents', () => {
        const meta: StandardMetadata = {
            source_api: 'tmdb',
            source_id: '1',
            title: 'Test',
            year: 2020,
            description: null,
            thumbnail_url: null,
            backdrop_url: null,
            thumbnail_r2_path: null,
            genres: null
        };
        expect(meta.source_api).toBeDefined();
        expect(meta.source_id).toBeDefined();
        expect(meta.title).toBeDefined();
        expect(meta.year).toBeDefined();
        expect(meta.thumbnail_url).toBeDefined();
    });
});
