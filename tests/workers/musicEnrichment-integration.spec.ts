/**
 * Tests d'intégration (mock) : chaîne d'enrichissement musique
 * Vérifie que les helpers et la logique de validation sont cohérents avec les APIs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    normalizeMusicText,
    extractArtistTitleFromFilename,
    generateMusicTitleVariants,
    cleanArtistName,
    acceptMusicMatch,
    getArtistSimilarityThreshold,
    getTitleSimilarityThreshold,
} from '../../workers/musicEnrichment.js';

describe('Music enrichment - intégration (mock)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('chaîne ID3 → filename → variantes produit des candidats exploitables', () => {
        const filename = 'AC-DC - Highway to Hell (1979).mp3';
        const fromFile = extractArtistTitleFromFilename(filename);
        expect(fromFile.artist).toBeDefined();
        expect(fromFile.title).toBeDefined();
        const artistVariants = fromFile.artist ? cleanArtistName(fromFile.artist) : [];
        const titleVariants = fromFile.title ? generateMusicTitleVariants(fromFile.title, fromFile.artist) : [];
        expect(artistVariants.length).toBeGreaterThan(0);
        expect(titleVariants.length).toBeGreaterThan(0);
        expect(artistVariants.some((a) => a.includes('AC/DC') || a.includes('AC'))).toBe(true);
        expect(titleVariants.some((t) => t.toLowerCase().includes('highway'))).toBe(true);
    });

    it('acceptMusicMatch accepte un vrai match Spotify-like', () => {
        const env = {};
        const artistTh = getArtistSimilarityThreshold(env);
        const titleTh = getTitleSimilarityThreshold(env);
        const r = acceptMusicMatch({
            ourArtist: 'AC/DC',
            ourTitle: 'Highway to Hell',
            trackTitle: 'Highway to Hell',
            trackArtists: ['AC/DC'],
            artistThreshold: artistTh,
            titleThreshold: titleTh,
        });
        expect(r.accept).toBe(true);
    });

    it('acceptMusicMatch refuse un faux positif (autre artiste)', () => {
        const r = acceptMusicMatch({
            ourArtist: 'R.E.M.',
            ourTitle: 'Losing My Religion',
            trackTitle: 'Losing My Religion',
            trackArtists: ['Taylor Swift'],
            artistThreshold: 0.6,
            titleThreshold: 0.75,
        });
        expect(r.accept).toBe(false);
    });

    it('normalisation + variantes couvrent reprises et remasters', () => {
        const t2 = normalizeMusicText('Song Official Video');
        expect(t2).not.toMatch(/Official Video/);
        const variants = generateMusicTitleVariants('Song feat. Artist (2021)', undefined);
        expect(variants.some((v) => v.length >= 2)).toBe(true);
        expect(variants.some((v) => !v.includes('feat'))).toBe(true);
    });
});
