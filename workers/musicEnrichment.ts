// INFO : workers/musicEnrichment.ts
// Extraction, normalisation et variantes pour l'enrichissement musique (ID3, filename, Spotify).

/** Normalise un texte pour la recherche (unicode, tirets, espaces, deux-points pleine chasse, tags techniques) */
export function normalizeMusicText(s: string): string {
    let t = s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[\uFF1A:]/g, ' - ')  // deux-points pleine chasse (：) et ASCII
        .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
        .replace(/[\s\u00A0]+/g, ' ')
        .trim();
    t = t.replace(/\s*[(\[]?(official\s*)?(video|audio|remaster|remastered|deluxe|edition|version|live|acoustic|instrumental)[)\]]?\s*$/gi, '').trim();
    return t;
}

/** Si le titre ID3 contient "Artist - Title" ou "Artist: Title", extrait artiste et titre */
export function parseArtistTitleFromId3Title(title: string): { artist?: string; title: string } {
    const normalized = title
        .replace(/\uFF1A/g, ' - ')
        .replace(/\s*:\s*/g, ' - ')
        .trim();
    const sep = /\s*[-–—]\s*/;
    const parts = normalized.split(sep);
    if (parts.length >= 2) {
        const first = parts[0].trim();
        const rest = parts.slice(1).join(' - ').trim();
        if (first.length >= 1 && rest.length >= 2) {
            return { artist: first, title: rest };
        }
    }
    return { title: normalized || title };
}

/** Retourne true si le titre ressemble à un titre propre (pas un filename complet) */
export function isCleanId3Title(title: string): boolean {
    if (!title || title.length < 2 || title.length > 80) return false;
    const lower = title.toLowerCase();
    if (lower.includes('(live') || lower.includes('(official') || lower.includes('[hd]') || lower.includes('official video') || lower.includes('official music')) return false;
    if (/\s*[-–—]\s*/.test(title)) return false;
    if (/^\s*[^:]+:\s+.+/.test(title)) return false;
    return true;
}

/** Alias courants : forme courte ou tronquée / VEVO / chaîne → nom canonique */
export const ARTIST_ALIASES: Record<string, string> = {
    'ac': 'AC/DC',
    'acdc': 'AC/DC',
    'rem': 'R.E.M.',
    'remhq': 'R.E.M.',
    'rem hq': 'R.E.M.',
    'u2': 'U2',
    'abba': 'ABBA',
    'eurythmics': 'Eurythmics',
    'dm': 'Depeche Mode',
    'depeche mode': 'Depeche Mode',
    'omd': 'Orchestral Manoeuvres in the Dark',
    'pet shop boys': 'Pet Shop Boys',
    'psb': 'Pet Shop Boys',
    'gotyemusic': 'Gotye',
    'gotye': 'Gotye',
    'thecallingvevo': 'The Calling',
    'the calling vevo': 'The Calling',
    'the calling': 'The Calling',
    '3doorsdown': '3 Doors Down',
    '3 doors down': '3 Doors Down',
};

export function cleanArtistName(artist: string): string[] {
    const raw = normalizeMusicText(artist);
    const variants: string[] = [];
    const seen = new Set<string>();
    const add = (v: string) => {
        const n = v.trim();
        if (n.length > 0 && !seen.has(n.toLowerCase())) {
            seen.add(n.toLowerCase());
            variants.push(n);
        }
    };
    const lower = raw.toLowerCase();
    for (const [alias, canonical] of Object.entries(ARTIST_ALIASES)) {
        if (lower === alias || lower === alias.replace(/\s/g, '')) {
            add(canonical);
            break;
        }
    }
    const withoutOfficial = raw
        .replace(/\s+Official\s*$/i, '')
        .replace(/^\s*Official\s+/i, '')
        .trim();
    if (withoutOfficial.length > 0) add(withoutOfficial);
    const withoutThe = raw.replace(/^\s*The\s+/i, '').trim();
    if (withoutThe.length > 0) add(withoutThe);
    if (raw.length > 0) add(raw);
    return Array.from(new Set(variants)).filter(v => v.length > 0);
}

/** Extrait artiste et titre depuis un filename (ex. "Artist - Title (Year).mp3") */
export function extractArtistTitleFromFilename(filename: string): { artist?: string; title?: string } {
    const name = filename.replace(/\.[^/.]+$/, '').trim();
    const sep = /\s*[-–—]\s*/;
    const parts = name.split(sep);
    if (parts.length >= 2) {
        const artist = normalizeMusicText(parts[0]);
        let title = parts.slice(1).join(' - ');
        title = title.replace(/\s*[(\[]\s*(19|20)\d{2}\s*[)\]]\s*$/, '').trim();
        title = normalizeMusicText(title);
        return { artist: artist || undefined, title: title || undefined };
    }
    return { title: normalizeMusicText(name) || undefined };
}

function cleanTitleFromFeaturing(title: string): string {
    const featPatterns = [
        /\s+(?:ft|feat|featuring)\.?\s+([^,]+?)(?:\s*[,\-]|$)/i,
        /\s+(?:ft|feat|featuring)\.?\s+([^,]+?)(?:\s*\(|$)/i,
        /\s+\(ft\.?\s+([^)]+)\)/i,
        /\s+\(feat\.?\s+([^)]+)\)/i,
        /\s+\(featuring\s+([^)]+)\)/i,
    ];
    let cleanedTitle = title;
    for (const pattern of featPatterns) {
        if (pattern.test(cleanedTitle)) {
            cleanedTitle = cleanedTitle.replace(pattern, '').trim();
        }
    }
    return cleanedTitle;
}

function cleanTitleForSearch(title: string): string {
    return title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function generateTitleVariants(title: string): string[] {
    const variants: string[] = [title];
    const cleaned = cleanTitleForSearch(title);
    const noYear = cleaned.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
    if (noYear.length >= 2) variants.push(noYear);
    const noLive = cleaned.replace(/\s+Live\b/i, '').replace(/\s+/g, ' ').trim();
    if (noLive.length >= 2) variants.push(noLive);
    const noQuotes = cleaned.replace(/["'`「」『』【】《》〈〉＂]/g, '').replace(/\s+/g, ' ').trim();
    if (noQuotes.length >= 2) variants.push(noQuotes);
    return Array.from(new Set(variants)).filter(v => v.length >= 2);
}

/** Variantes de titre pour la musique (monde entier) : sans année, parenthèses, feat, préfixe Artist, premiers mots, etc. */
export function generateMusicTitleVariants(title: string, _artist?: string): string[] {
    let base = cleanTitleFromFeaturing(title);
    const out = new Set<string>([base]);
    const add = (s: string) => { const t = s.trim(); if (t.length >= 2) out.add(t); };
    add(base);
    const parsed = parseArtistTitleFromId3Title(base);
    if (parsed.title && parsed.title !== base) add(parsed.title);
    const noYear = base.replace(/\s*[(\[]?\s*(19|20)\d{2}\s*[)\]]?\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (noYear.length >= 2) add(noYear);
    const noParens = base.replace(/\s*[(\[][^)]*[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (noParens.length >= 2) add(noParens);
    const noTags = base.replace(/\s*(remaster(ed)?|deluxe|edition|live|acoustic|instrumental)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    if (noTags.length >= 2) add(noTags);
    const words = base.split(/\s+/).filter(Boolean);
    if (words.length > 4) {
        const firstWords = words.slice(0, 5).join(' ');
        if (firstWords.length >= 2) add(firstWords);
        if (words.length > 6) add(words.slice(0, 3).join(' '));
    }
    for (const v of generateTitleVariants(base)) add(v);
    return Array.from(out).filter(v => v.length >= 2);
}

/** Similarité de chaînes (0–1) pour comparer artistes */
export function stringSimilarity(a: string, b: string): number {
    const x = a.toLowerCase().trim();
    const y = b.toLowerCase().trim();
    if (x === y) return 1;
    if (!x.length || !y.length) return 0;
    const longer = x.length >= y.length ? x : y;
    const shorter = x.length >= y.length ? y : x;
    if (longer.includes(shorter)) return shorter.length / longer.length;
    let matches = 0;
    const len = Math.min(x.length, y.length);
    for (let i = 0; i < len; i++) {
        if (x[i] === y[i]) matches++;
    }
    return (2 * matches) / (x.length + y.length);
}

/** Distance de Levenshtein (pour similarité titre plus stricte) */
function levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const row0 = new Array<number>(n + 1);
    const row1 = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) row0[j] = j;
    for (let i = 1; i <= m; i++) {
        row1[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            row1[j] = Math.min(row1[j - 1] + 1, row0[j] + 1, row0[j - 1] + cost);
        }
        for (let j = 0; j <= n; j++) row0[j] = row1[j];
    }
    return row1[n];
}

/** Similarité titre (0–1), normalisée et insensible aux petites différences (remaster, live, etc.) */
export function titleSimilarity(ourTitle: string, apiTitle: string): number {
    const a = normalizeMusicText(ourTitle).toLowerCase();
    const b = normalizeMusicText(apiTitle).toLowerCase();
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    const maxLen = Math.max(a.length, b.length);
    const dist = levenshteinDistance(a, b);
    return 1 - dist / maxLen;
}

/** Meilleure similarité entre notre chaîne et une liste (ex. artistes du track) */
export function bestSimilarity(our: string, candidates: string[], similarityFn: (a: string, b: string) => number): number {
    if (!our.trim() || !candidates.length) return 1;
    let best = 0;
    for (const c of candidates) {
        const s = similarityFn(our, c);
        if (s > best) best = s;
    }
    return best;
}

/** Seuils par défaut orientés priorité 1 : maximiser le taux de réussite (tous les titres doivent passer). */
export function getArtistSimilarityThreshold(env: { ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD?: string }): number {
    const v = env.ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD;
    if (v == null || v === '') return 0.5;
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

export function getTitleSimilarityThreshold(env: { ENRICHMENT_TITLE_SIMILARITY_THRESHOLD?: string }): number {
    const v = env.ENRICHMENT_TITLE_SIMILARITY_THRESHOLD;
    if (v == null || v === '') return 0.5;
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

/** Seuil minimal pour dernier recours (accepter un match très permissif si rien d'autre). */
export const MIN_TITLE_SIMILARITY_LAST_RESORT = 0.4;
export const MIN_ARTIST_SIMILARITY_LAST_RESORT = 0.35;

export interface AcceptMusicMatchOptions {
    ourArtist: string | undefined;
    ourTitle: string;
    trackTitle: string;
    trackArtists: string[];
    artistThreshold: number;
    titleThreshold: number;
    /** Rejeter si le track est "Live" et notre titre ne contient pas "live" */
    rejectLiveMismatch?: boolean;
}

/** Valide un match API (titre/artiste) pour éviter faux positifs */
export function acceptMusicMatch(options: AcceptMusicMatchOptions): { accept: boolean; reason?: string } {
    const {
        ourArtist,
        ourTitle,
        trackTitle,
        trackArtists,
        artistThreshold,
        titleThreshold,
        rejectLiveMismatch = false,
    } = options;

    const titleSim = titleSimilarity(ourTitle, trackTitle);
    if (titleSim < titleThreshold) {
        return { accept: false, reason: `similarité titre ${(titleSim * 100).toFixed(0)}% < ${(titleThreshold * 100).toFixed(0)}%` };
    }

    if (ourArtist && trackArtists.length > 0) {
        const artistSim = bestSimilarity(ourArtist, trackArtists, stringSimilarity);
        if (artistSim < artistThreshold) {
            return { accept: false, reason: `similarité artiste ${(artistSim * 100).toFixed(0)}% < ${(artistThreshold * 100).toFixed(0)}%` };
        }
    }

    if (rejectLiveMismatch) {
        const trackIsLive = /\blive\b/i.test(normalizeMusicText(trackTitle));
        const oursIsLive = /\blive\b/i.test(normalizeMusicText(ourTitle));
        if (trackIsLive !== oursIsLive) {
            return { accept: false, reason: 'mismatch Live (track vs notre titre)' };
        }
    }

    return { accept: true };
}
