/**
 * Tests unitaires : extraction, normalisation, variantes et similarité pour enrichissement musique
 */
import { describe, it, expect } from 'vitest';
import {
    normalizeMusicText,
    extractArtistTitleFromFilename,
    generateMusicTitleVariants,
    parseArtistTitleFromId3Title,
    isCleanId3Title,
    stringSimilarity,
    titleSimilarity,
    bestSimilarity,
    cleanArtistName,
    getArtistSimilarityThreshold,
    getTitleSimilarityThreshold,
    acceptMusicMatch,
} from '../../workers/musicEnrichment.js';

describe('musicEnrichment', () => {
    describe('normalizeMusicText', () => {
        it('normalise les espaces et tirets', () => {
            expect(normalizeMusicText('  Artiste   –  Titre  ')).toBe('Artiste - Titre');
        });

        it('retire les tags techniques en fin (remaster, live, etc.)', () => {
            expect(normalizeMusicText('Song Name (Remaster)')).toBe('Song Name');
            expect(normalizeMusicText('Track Official Video')).toBe('Track');
        });

        it('gère les caractères unicode (NFC/NFD)', () => {
            const withAccent = 'Café';
            expect(normalizeMusicText(withAccent).length).toBeGreaterThan(0);
            expect(normalizeMusicText('Café')).toMatch(/Caf[eé]/);
        });
    });

    describe('extractArtistTitleFromFilename', () => {
        it('extrait artiste et titre depuis "Artist - Title.mp3"', () => {
            const r = extractArtistTitleFromFilename('AC/DC - Highway to Hell.mp3');
            expect(r.artist).toBeDefined();
            expect(r.title).toBeDefined();
            expect(r.artist).toContain('AC/DC');
            expect(r.title).toContain('Highway');
        });

        it('retire l’année entre parenthèses du titre', () => {
            const r = extractArtistTitleFromFilename('Artist - Title (2020).mp3');
            expect(r.title).not.toMatch(/2020/);
        });

        it('retourne uniquement le titre si pas de séparateur " - "', () => {
            const r = extractArtistTitleFromFilename('OnlyTitle.flac');
            expect(r.artist).toBeUndefined();
            expect(r.title).toBeDefined();
        });

        it('gère les tirets longs (–)', () => {
            const r = extractArtistTitleFromFilename('Artist – Title.m4a');
            expect(r.artist).toBeDefined();
            expect(r.title).toBeDefined();
        });
    });

    describe('generateMusicTitleVariants', () => {
        it('inclut le titre sans année et sans parenthèses', () => {
            const v = generateMusicTitleVariants('Song (2021)');
            expect(v.some((s) => !s.includes('2021'))).toBe(true);
            expect(v.some((s) => s.includes('Song'))).toBe(true);
        });

        it('inclut une variante sans feat', () => {
            const v = generateMusicTitleVariants('Title feat. Someone');
            expect(v.length).toBeGreaterThanOrEqual(1);
        });

        it('filtre les variantes trop courtes', () => {
            const v = generateMusicTitleVariants('Ab');
            expect(v.every((s) => s.length >= 2)).toBe(true);
        });
    });

    describe('stringSimilarity', () => {
        it('retourne 1 pour chaînes identiques', () => {
            expect(stringSimilarity('R.E.M.', 'R.E.M.')).toBe(1);
        });

        it('retourne 0 si une chaîne est vide', () => {
            expect(stringSimilarity('Artist', '')).toBe(0);
        });

        it('retourne une similarité élevée pour noms proches', () => {
            const s = stringSimilarity('AC/DC', 'AC DC');
            expect(s).toBeGreaterThan(0.5);
        });

        it('retourne une similarité faible pour artistes différents', () => {
            const s = stringSimilarity('R.E.M.', 'Metallica');
            expect(s).toBeLessThan(0.5);
        });
    });

    describe('cleanArtistName (alias)', () => {
        it('étend AC en AC/DC', () => {
            const v = cleanArtistName('AC');
            expect(v).toContain('AC/DC');
        });

        it('étend remhq en R.E.M.', () => {
            const v = cleanArtistName('remhq');
            expect(v).toContain('R.E.M.');
        });

        it('retire "Official" tout en gardant l’artiste', () => {
            const v = cleanArtistName('Artist Official');
            expect(v.some((s) => !s.includes('Official'))).toBe(true);
        });
    });

    describe('getArtistSimilarityThreshold', () => {
        it('retourne 0.6 par défaut si env vide', () => {
            expect(getArtistSimilarityThreshold({})).toBe(0.6);
            expect(getArtistSimilarityThreshold({ ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD: '' })).toBe(0.6);
        });

        it('utilise la valeur env si entre 0 et 1', () => {
            expect(getArtistSimilarityThreshold({ ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD: '0.8' })).toBe(0.8);
            expect(getArtistSimilarityThreshold({ ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD: '0' })).toBe(0);
            expect(getArtistSimilarityThreshold({ ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD: '1' })).toBe(1);
        });

        it('retourne 0.6 si valeur invalide', () => {
            expect(getArtistSimilarityThreshold({ ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD: '2' })).toBe(0.6);
            expect(getArtistSimilarityThreshold({ ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD: 'abc' })).toBe(0.6);
        });
    });

    describe('titleSimilarity', () => {
        it('retourne 1 pour titres identiques', () => {
            expect(titleSimilarity('Highway to Hell', 'Highway to Hell')).toBe(1);
        });

        it('retourne une similarité élevée pour titres proches', () => {
            const s = titleSimilarity('Highway to Hell', 'Highway To Hell');
            expect(s).toBeGreaterThanOrEqual(0.8);
        });

        it('retourne une similarité faible pour titres différents', () => {
            const s = titleSimilarity('Song A', 'Completely Different Song');
            expect(s).toBeLessThan(0.5);
        });
    });

    describe('bestSimilarity', () => {
        it('retourne 1 si our est vide ou candidates vide', () => {
            expect(bestSimilarity('', ['A', 'B'], stringSimilarity)).toBe(1);
            expect(bestSimilarity('Artist', [], stringSimilarity)).toBe(1);
        });

        it('retourne la meilleure similarité parmi les candidats', () => {
            const s = bestSimilarity('AC/DC', ['Metallica', 'AC/DC', 'U2'], stringSimilarity);
            expect(s).toBe(1);
        });
    });

    describe('acceptMusicMatch', () => {
        it('accepte si titre et artiste au-dessus des seuils', () => {
            const r = acceptMusicMatch({
                ourArtist: 'AC/DC',
                ourTitle: 'Highway to Hell',
                trackTitle: 'Highway to Hell',
                trackArtists: ['AC/DC'],
                artistThreshold: 0.6,
                titleThreshold: 0.75,
            });
            expect(r.accept).toBe(true);
        });

        it('refuse si similarité titre trop faible', () => {
            const r = acceptMusicMatch({
                ourArtist: undefined,
                ourTitle: 'Original Song',
                trackTitle: 'Completely Different',
                trackArtists: [],
                artistThreshold: 0.6,
                titleThreshold: 0.75,
            });
            expect(r.accept).toBe(false);
            expect(r.reason).toMatch(/titre/);
        });

        it('refuse si similarité artiste trop faible quand on a un artiste', () => {
            const r = acceptMusicMatch({
                ourArtist: 'AC/DC',
                ourTitle: 'Highway to Hell',
                trackTitle: 'Highway to Hell',
                trackArtists: ['Metallica'],
                artistThreshold: 0.6,
                titleThreshold: 0.75,
            });
            expect(r.accept).toBe(false);
            expect(r.reason).toMatch(/artiste/);
        });
    });

    describe('getTitleSimilarityThreshold', () => {
        it('retourne 0.75 par défaut', () => {
            expect(getTitleSimilarityThreshold({})).toBe(0.75);
        });

        it('utilise la valeur env entre 0 et 1', () => {
            expect(getTitleSimilarityThreshold({ ENRICHMENT_TITLE_SIMILARITY_THRESHOLD: '0.9' })).toBe(0.9);
        });
    });

    describe('parseArtistTitleFromId3Title', () => {
        it('extrait artiste et titre depuis "Artist - Title"', () => {
            const r = parseArtistTitleFromId3Title('Gotye - Somebody That I Used To Know');
            expect(r.artist).toBe('Gotye');
            expect(r.title).toBe('Somebody That I Used To Know');
        });

        it('extrait titre seul depuis "Artist: Title" (deux-points)', () => {
            const r = parseArtistTitleFromId3Title('Metallica: Enter Sandman');
            expect(r.artist).toBe('Metallica');
            expect(r.title).toBe('Enter Sandman');
        });

        it('retourne le titre inchangé si pas de séparateur', () => {
            const r = parseArtistTitleFromId3Title('Hotel California');
            expect(r.artist).toBeUndefined();
            expect(r.title).toBe('Hotel California');
        });
    });

    describe('isCleanId3Title', () => {
        it('retourne true pour un titre court sans tags', () => {
            expect(isCleanId3Title('Hotel California')).toBe(true);
            expect(isCleanId3Title('Encore')).toBe(true);
        });

        it('retourne false pour un titre avec "Artist - "', () => {
            expect(isCleanId3Title('Gotye - Somebody That I Used To Know')).toBe(false);
        });

        it('retourne false pour un titre avec "(Live" ou "Official Video"', () => {
            expect(isCleanId3Title('Song (Live 1977)')).toBe(false);
            expect(isCleanId3Title('Song Official Video')).toBe(false);
        });
    });

    describe('cleanArtistName (alias VEVO / chaînes)', () => {
        it('étend gotyemusic en Gotye', () => {
            const v = cleanArtistName('gotyemusic');
            expect(v).toContain('Gotye');
        });

        it('étend 3doorsdown en 3 Doors Down', () => {
            const v = cleanArtistName('3doorsdown');
            expect(v).toContain('3 Doors Down');
        });
    });
});
