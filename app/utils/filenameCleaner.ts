// INFO : app/utils/filenameCleaner.ts
/**
 * Liste des termes à supprimer des noms de fichiers
 * Format: regex insensible à la casse
 */
export const TERMS_TO_REMOVE = [
    // Qualités vidéo et encodeurs
    /\b(?:REPACK|PROPER|RERIP|REMASTERED|REMASTER|RETAIL|REMUX|UNTOUCHED|LiHDL|Slay3R|Light|HDLight|BATGirl|Amen|MuXoR|NIKOo|k7|bouba|lucky)\b/gi,

    // Sources
    /\b(?:WEBRIP|WEB-DL|WEB|HDTV|HDTVRIP|DVDRIP|DVDSCR|DVDR|BDSCR|BDRIP|BRRIP|BLURAY|BLU-RAY|BD25|BD50|PopHD)\b/gi,

    // Audio
    /\b(?:AAC2\.0|AAC|AC3|EAC3|DTS|DTS-HD|DTS-HD\.MA|DTS-X|ATMOS|TRUEHD|FLAC|MP3|5\.1|7\.1|2\.0|AD|6CH|AAC5\.1|DDP5\.1|TrueFrench)\b/gi,

    // Video
    /\b(?:x264|X264|x265|X265|HEVC|H\.264|H\.265|H264|H265|AVC|10BIT|8BIT|HDR|SDR|DV|DOLBY VISION|HDR10\+)\b/gi,

    // Release groups, trackers et uploaders
    /\b(?:AMZN|AMAZON|ATVP|ATV|DSNP|DSNY|DSNEY|HULU|MAX|NFLX|NF|HMAX|PLAYM|RED|STAN|WITH|FERVEX|ZiT|Zone80|FANSUB|FW|SUPPLY|GHT|FGT|PSA|RARBG|YTS|ETRG|BRISK|KINGS|CRiMSON|DIMENSION|EVO|NTb|TBS|CtrlHD|HiDt|DECENT|FiCO|HDC|HDMaN|HDTime|ION10|LEGi0N|MTeam|NTG|P2P|PF|QCF|RMTeam|SA89|SDI|TOWN|TRL|VietHD|W4F|WDL|XPRESS|DDR|EXTREME|ExYu|KLAXXON|MZABI|NAISU|NODLABS|SPARKS|TEPES|UTR|VC-1|VIDEOHOLE|VH|WILL1869)\b/gi,

    // Langues et sous-titres
    /\b(?:MULTI|DUAL|VFF|VFQ|VF2|VFI|VOSTFR|VOSTA|VOST|SUBFRENCH|SUBFORCED|SUBS|FRENCH|VOF|VO|TrueFrench|FR|EN|ENG|English|Spanish|ES|DE|GER|Italian|IT|Japanese|JP|RU|RUS|Russian|Arabic|AR|Chinese|CN|Korean|KR)\b/gi,

    // Autres
    /\b(?:EXTENDED|UNCUT|UNCENSORED|DIRECTOR\.CUT|THEATRICAL|LIMITED|READNFO|NFO|\+\+|FINAL|INTERNAL|SUBBED|DUBBED|HC|WORKPRINT|SCREENER|CAM|TS|TELESYNC|PDTV|DSR|TVRip|SATRip|DTH|IPTV|VHSRip|DVBRip|BDR|BD9|BD5|MicroHD|MinBD|MiniHD|HDTV2DVD|SDTV|DTV|HDCAM|PPVRip|PPV|R5|R6|RC|SCR|DVDMux|DVDFull|DVD9|DVD5|LDRip|LDTV|MDTV|IPTVRip|WebCap|WebRip|AMZNWEBDL|NFWEBDL|HMAXWEBDL|DSNPWEBDL|ATVPWEBDL|HuluWEBDL|CC|COLOR|BW|DOCU|DOCUMENTARY|ANIME|OVA|OAV|ONA|TV|MOVIE|FILM|SHOW|SERIES|MINISERIES|SPECIAL|BONUS|EXTRA|TRAILER|TEASER|PROMO|PREVIEW|RECAP|REVIEW|ANALYSIS|COMMENTARY|REACTION|REVIEW|REACTION)\b/gi,

    // Qualités et résolutions
    /\b(?:2160P|1080P|720P|480P|360P|4K|UHD|FHD|HQ|SD|HD|LD|HQ|LQ|MQ|ULQ|UHQ|HDRip|DVDRip|BDRip|BRRip|WEBRip|WEB-DLRip|HDTVRip|PDTVRip|DSRRip|TVRip|SATRip|VHSRip|CAMRip|TSRip|R5Rip|R6Rip|SCRRip|DVDR|DVDSCR|BDSCR|BRSCR|WEBCAP|AMZN|NF|DSNP|HMAX|ATVP|Hulu|iTunes|GooglePlay|GP|VUDU|Disney\+|DisneyPlus|AppleTV\+|AppleTV|HBO|HBOMax|MAX|Peacock|Paramount\+|ParamountPlus|Showtime|STARZ|Crunchyroll|Funimation|VRV|AmazonVideo|Netflix|Hulu|DisneyHotstar|Hotstar|ZEE5|Voot|SonyLIV|MXPlayer|ALTBalaji|ErosNow|JioCinema|TataSky|Airtel|DishTV|D2H|SunNXT|Hungama|BigFlix|Spuul|YuppTV|DittoTV|Hooq|Iflix|Viu|iflix|MolaTV|Catchplay|GagaOOLala|LineTV|Vidol|Viki|WeTV|TencentVideo|IQiyi|Youku|Tudou|Bilibili|AcFun|Niconico|AbemaTV|TVer|GYAO!|Paravi|U-NEXT|dTV|FOD|HuluJP|AmazonPrimeVideoJP|NetflixJP|Disney\+JP|TVerJP|NHK|TVAsahi|TBS|FujiTV|NTV|TVTokyo|WOWOW|BS|CS|CATV|SKYPerfecTV|J:COM|auひかりテレビ|NURO|So-net|BBTV|JCN|TEPCO|KDDI|SoftBank|Rakuten|Yahoo!|NTT|Docomo|K-Opticom|QTnet|IIJ|ASAHI|USEN|GyaO|DMM|R18|FANZA|mgstage|S-Cute|Caribbean|HEYZO|Tokyo-Hot|1pondo|10musume|RedHot|SOD|IDEAPOCKET|S1|MOODYZ|Attackers|Madonna|kawaii|PREMIUM|Million|kira☆kira|OPPAI|ECSTASY|DAHLIA|MAX-A|SILK LABO|BeFree|Nadeshiko|TMA|G-Area|Gachinco|Hakata|Honnaka|Hunter|Kiraku|K-Tribe|LaForet|M's|Machi|MAXING|Moumou|NEXT|Natural|NON|Only|Prestige|Real|SADISTIC|Seishun|Sexy|Shark|SOD|Tsubaki|U&K|Up's|Wanz|ZEN|ZUKKON|BAKKON|Chijo|Gachipin|Gachinco|Hamedori|HMP|Hontou|IEnergy|Jukujo|Karma|Kira☆ku|Kyoto|Lotus|MAGURO|MANIAC|MEGAMI|MILK|Miman|Mousou|Mywife|Nakadashi|Nanpa|NTR|Nyoshin|Oh!|One|Oppai|Pacopacomama|Paradise|Petal|PINK|Pistil|Queen|R18|Red|Rocket|S-Cute|Sagura|Seishun|Sexy|Shark|SILK|Sky|SOD|Soft|Sora|Style|Sukebei|Super|TMA|Tokyo|Tsubaki|U&K|Up's|V&R|Wanz|X|Yuu|ZEN|ZUKKON)\b/gi,
];

/**
 * Termes à remplacer par un espace
 */
export const TERMS_TO_REPLACE: Array<[RegExp, string]> = [
    [/\s*[\.\-_]\s*/g, '.'], // Remplacer les séparateurs multiples par un seul point
    [/\.{2,}/g, '.'], // Remplacer les points multiples par un seul
    [/\s{2,}/g, ' '], // Remplacer les espaces multiples par un seul
    [/\+\+/g, ''], // Supprimer "++" spécifiquement
    [/\bVO\b/gi, ''], // Version Originale
    [/\bVFF\b/gi, ''], // Version Française Francophone
    [/\bVFQ\b/gi, ''], // Version Française Québécoise
    [/\bVOF\b/gi, ''], // Version Originale Française
];

/**
 * Nettoyer un nom de fichier en supprimant les termes indésirables
 */
export function cleanFilename(filename: string): string {
    if (!filename) return '';

    let cleaned = filename;

    // Supprimer les termes indésirables
    TERMS_TO_REMOVE.forEach(regex => {
        cleaned = cleaned.replace(regex, '');
    });

    // Remplacer les termes
    TERMS_TO_REPLACE.forEach(([regex, replacement]) => {
        cleaned = cleaned.replace(regex, replacement);
    });

    // Nettoyer les caractères spéciaux en trop
    cleaned = cleaned
        .replace(/^[\.\s\-_]+|[\.\s\-_]+$/g, '') // Supprimer les séparateurs au début/fin
        .replace(/\[.*?\]/g, '') // Supprimer le contenu entre crochets
        .replace(/\(.*?\)/g, '') // Supprimer le contenu entre parenthèses
        .replace(/\{.*?\}/g, '') // Supprimer le contenu entre accolades
        .replace(/\s+\./g, '.') // Supprimer les espaces avant les points
        .replace(/\.\s+/g, '.') // Supprimer les espaces après les points
        .trim();

    // Gérer les numéros d'épisodes et de saisons (S01E01 devient S01E01)
    cleaned = cleaned.replace(/(\bS\d{1,2}E\d{1,2}\b)/gi, (match) => match.toUpperCase());

    // S'assurer que l'extension est conservée
    const parts = cleaned.split('.');
    if (parts.length > 1) {
        const extension = parts.pop(); // Garder la dernière partie comme extension
        const name = parts.join('.').replace(/\.+/g, '.'); // Nettoyer le nom
        cleaned = name ? `${name}.${extension}` : `.${extension}`;
    }

    // Final cleanup
    cleaned = cleaned
        .replace(/^[\.\s\-_]+|[\.\s\-_]+$/g, '') // Supprimer les séparateurs au début/fin à nouveau
        .replace(/\s{2,}/g, ' ') // Remplacer les espaces multiples
        .trim();

    return cleaned || filename;
}

/**
 * Version améliorée qui conserve certaines informations utiles
 */
export function cleanFilenameAdvanced(filename: string, options: {
    keepYear?: boolean;
    keepEpisodeInfo?: boolean;
    keepResolution?: boolean;
    keepLanguage?: boolean;
} = {}): string {
    const defaultOptions = {
        keepYear: true,
        keepEpisodeInfo: true,
        keepResolution: false,
        keepLanguage: false,
    };

    const opts = { ...defaultOptions, ...options };

    if (!filename) return '';

    let cleaned = filename;

    // Extraire l'année si on doit la conserver
    let year = '';
    if (opts.keepYear) {
        const yearMatch = cleaned.match(/(\b(19|20)\d{2}\b)/);
        if (yearMatch) {
            year = yearMatch[0];
        }
    }

    // Extraire les infos d'épisode si on doit les conserver
    let episodeInfo = '';
    if (opts.keepEpisodeInfo) {
        const episodeMatch = cleaned.match(/(\bS\d{1,2}E\d{1,2}\b)/gi);
        if (episodeMatch) {
            episodeInfo = episodeMatch[0].toUpperCase();
        }
    }

    // Extraire la résolution si on doit la conserver
    let resolution = '';
    if (opts.keepResolution) {
        const resolutionMatch = cleaned.match(/\b(2160P|1080P|720P|480P|4K|UHD|FHD|HD)\b/gi);
        if (resolutionMatch) {
            resolution = resolutionMatch[0].toUpperCase();
        }
    }

    // Extraire la langue si on doit la conserver
    let language = '';
    if (opts.keepLanguage) {
        const languageMatch = cleaned.match(/\b(FR|VF|VOSTFR|EN|ENG|VO|MULTI|DUAL)\b/gi);
        if (languageMatch) {
            language = languageMatch[0].toUpperCase();
        }
    }

    // Supprimer les termes indésirables
    TERMS_TO_REMOVE.forEach(regex => {
        cleaned = cleaned.replace(regex, '');
    });

    // Remplacer les termes
    TERMS_TO_REPLACE.forEach(([regex, replacement]) => {
        cleaned = cleaned.replace(regex, replacement);
    });

    // Nettoyer les caractères spéciaux en trop
    cleaned = cleaned
        .replace(/^[\.\s\-_]+|[\.\s\-_]+$/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\{.*?\}/g, '')
        .replace(/\s+\./g, '.')
        .replace(/\.\s+/g, '.')
        .trim();

    // S'assurer que l'extension est conservée
    const parts = cleaned.split('.');
    let extension = '';
    let name = '';

    if (parts.length > 1) {
        extension = parts.pop() || '';
        name = parts.join('.').replace(/\.+/g, '.');

        // Reconstruire avec les informations conservées
        const nameParts = [];

        // Ajouter le nom principal
        if (name) nameParts.push(name);

        // Ajouter l'année si présente
        if (year && !name.includes(year)) {
            nameParts.push(year);
        }

        // Ajouter les infos d'épisode si présentes
        if (episodeInfo && !name.includes(episodeInfo)) {
            nameParts.push(episodeInfo);
        }

        // Ajouter la résolution si présente
        if (resolution && !name.includes(resolution)) {
            nameParts.push(resolution);
        }

        // Ajouter la langue si présente
        if (language && !name.includes(language)) {
            nameParts.push(language);
        }

        cleaned = nameParts.join('.');
        cleaned = cleaned ? `${cleaned}.${extension}` : `.${extension}`;
    }

    // Final cleanup
    cleaned = cleaned
        .replace(/^[\.\s\-_]+|[\.\s\-_]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return cleaned || filename;
}

/**
 * Extraire le titre principal d'un nom de fichier
 */
export function extractMainTitle(filename: string): string {
    const cleaned = cleanFilenameAdvanced(filename, {
        keepYear: true,
        keepEpisodeInfo: true,
        keepLanguage: false
    });

    // Séparer par les points, tirets et underscores
    const parts = cleaned.split(/[\.\-_]/);

    // Retourner la première partie significative
    for (const part of parts) {
        if (part.trim().length > 3 && !/^\d+$/.test(part)) {
            return part.trim();
        }
    }

    return cleaned.split('.')[0] || filename;
}

/**
 * Vérifier si un nom de fichier est "sale" (contient des termes à nettoyer)
 */
export function isDirtyFilename(filename: string): boolean {
    return TERMS_TO_REMOVE.some(regex => regex.test(filename));
}

/**
 * Version spéciale pour les fichiers Streaming (conserve .m3u8, .mpd, .m4s)
 */
export function cleanStreamingFilename(filename: string): string {
    if (!filename) return '';

    // Pour les fichiers Streaming, on ne nettoie que le chemin, pas l'extension spécifique
    const lowerFilename = filename.toLowerCase();
    const isPlaylist = lowerFilename.endsWith('.m3u8');
    const isDashManifest = lowerFilename.endsWith('.mpd');
    const isSegment = lowerFilename.endsWith('.m4s');
    const isVTT = lowerFilename.endsWith('.vtt');

    if (isPlaylist || isDashManifest || isSegment || isVTT) {
        // Séparer le chemin du nom de fichier
        const pathParts = filename.split('/');
        const lastPart = pathParts.pop() || '';

        // Nettoyer seulement le nom de fichier, pas l'extension Streaming
        const cleanedName = cleanFilenameAdvanced(lastPart, {
            keepYear: true,
            keepEpisodeInfo: true,
            keepResolution: false,
        });

        // Reconstruire le chemin
        return [...pathParts, cleanedName].join('/');
    }

    // Pour les autres fichiers, nettoyer normalement
    return cleanFilenameAdvanced(filename, {
        keepYear: true,
        keepEpisodeInfo: true,
        keepResolution: false,
    });
}

/**
 * Fonction pour nettoyer uniquement les noms de dossiers dans un chemin
 * Conserve les noms exacts des fichiers Streaming
 */
export function cleanFolderPath(path: string, options: {
    keepSegmentNames?: boolean;
    keepPlaylistNames?: boolean;
} = {}): string {
    const defaultOptions = {
        keepSegmentNames: true,
        keepPlaylistNames: true,
    };

    const opts = { ...defaultOptions, ...options };

    if (!path) return '';

    // Séparer le chemin en parties
    const parts = path.split('/');
    const cleanedParts: string[] = [];

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        // Vérifier si c'est un fichier (a une extension)
        const hasExtension = part.includes('.');

        if (hasExtension) {
            // C'est un fichier
            const lowerPart = part.toLowerCase();
            const isSegment = lowerPart.endsWith('.m4s');
            const isPlaylist = lowerPart.endsWith('.m3u8') || lowerPart.endsWith('.mpd');

            if ((isSegment && opts.keepSegmentNames) || (isPlaylist && opts.keepPlaylistNames)) {
                // Conserver le nom exact pour les segments et playlists Streaming
                cleanedParts.push(part);
            } else {
                // Nettoyer les autres fichiers
                cleanedParts.push(cleanFilenameAdvanced(part, {
                    keepYear: true,
                    keepEpisodeInfo: true,
                    keepResolution: false,
                    keepLanguage: false,
                }));
            }
        } else {
            // C'est un dossier, nettoyer le nom
            cleanedParts.push(cleanFilenameAdvanced(part, {
                keepYear: false,
                keepEpisodeInfo: false,
                keepResolution: false,
                keepLanguage: false,
            }));
        }
    }

    // Rejoindre les parties nettoyées
    let cleanedPath = cleanedParts.join('/');

    // Nettoyer les doubles slashes
    cleanedPath = cleanedPath.replace(/\/+/g, '/');

    // Supprimer les slashes en début/fin
    cleanedPath = cleanedPath.replace(/^\//, '').replace(/\/$/, '');

    return cleanedPath;
}
