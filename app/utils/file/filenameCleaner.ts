// INFO : app/utils/filenameCleaner.ts
// Utilitaire pour nettoyer et renommer les fichiers avant enregistrement

import englishWordsArray from 'an-array-of-english-words';

// Cache pour les dictionnaires (chargés une seule fois)
let englishWordsSet: Set<string> | null = null;
let frenchWords: Set<string> | null = null;
let dictionariesLoaded = false;

// Cache pour les vérifications de mots (évite de re-vérifier les mêmes mots)
const wordCheckCache = new Map<string, boolean>();

/**
 * Charge les dictionnaires anglais et français (lazy loading)
 */
async function loadDictionaries(): Promise<void> {
    if (dictionariesLoaded) return;

    try {
        // Transformer le tableau anglais en Set pour O(1) lookup
        if (Array.isArray(englishWordsArray)) {
            englishWordsSet = new Set(englishWordsArray.map(w => w.toLowerCase()));
        }

        // Liste étendue de mots français courants (pas d'espaces dans les entrées)
        const commonFrenchWords = [
            // Articles et déterminants
            'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du',
            // Conjonctions
            'et', 'ou', 'mais', 'donc', 'car', 'ni', 'or',
            // Prépositions
            'dans', 'sur', 'avec', 'pour', 'par', 'sans', 'sous', 'entre', 'vers', 'chez', 'pendant',
            // Mots courants (verbes, noms, adjectifs)
            'bonjour', 'merci', 'français', 'française', 'françaises',
            'amour', 'vie', 'jour', 'nuit', 'homme', 'femme', 'enfant', 'fille', 'garçon', 'personne',
            'maison', 'voiture', 'livre', 'film', 'musique', 'chanson', 'danse', 'histoire',
            'être', 'avoir', 'faire', 'aller', 'venir', 'voir', 'dire', 'savoir', 'pouvoir', 'vouloir',
            'grand', 'petit', 'beau', 'belle', 'bon', 'bonne', 'nouveau', 'nouvelle', 'vieux', 'vieille',
            'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
            'année', 'mois', 'semaine', 'jour', 'heure', 'minute', 'seconde', 'temps',
            // Mots supplémentaires pour les titres de films
            'avent', 'avant', 'apres', 'histoire', 'matin', 'soir',
            'noir', 'blanc', 'rouge', 'bleu', 'vert', 'jaune',
            'roi', 'reine', 'prince', 'princesse', 'dragon', 'monstre', 'hero'
        ];

        frenchWords = new Set(commonFrenchWords.map(w => w.toLowerCase()));
        dictionariesLoaded = true;
    } catch (error) {
        console.warn('⚠️ Erreur lors du chargement des dictionnaires:', error);
    }
}

/**
 * Expressions régulières pour détecter les patterns techniques
 */
const TECHNICAL_PATTERNS = [
    /\d{4}\.MULTi/i,
    /\.\d{4}\./,
    /\d{4}-\d{2}-\d{2}/,
    /\[.*?\]/g,
    /\(.*?\)/g,
    /-\w+-\w+$/i,
    /-\w+$/i,
];

/**
 * Vérifie si le mot ressemble à un mot humain (lettres, pas de chiffres)
 */
export function isWordLike(token: string): boolean {
    return /^[a-zA-ZÀ-ÿ]{2,}$/.test(token);
}

/**
 * Calcule le ratio voyelles / longueur du mot
 */
export function vowelRatio(word: string): number {
    const vowels = word.match(/[aeiouyàâäéèêëîïôöùûü]/gi) || [];
    return vowels.length / word.length;
}

/**
 * Vérifie si un mot a une capitalisation suspecte
 */
export function hasWeirdCapitalization(word: string): boolean {
    return word === word.toUpperCase() && word.length > 3;
}

/**
 * Vérifie si un mot est dans le dictionnaire (anglais ou français) - SYNCHRONE après chargement
 */
function isDictionaryWord(word: string): boolean {
    // Vérifier le cache d'abord
    if (wordCheckCache.has(word)) {
        return wordCheckCache.get(word)!;
    }

    if (!dictionariesLoaded) {
        // Si les dictionnaires ne sont pas encore chargés, retourner false
        // (sera appelé après loadDictionaries)
        return false;
    }

    const lowerWord = word.toLowerCase();
    let result = false;

    // Vérifier dans le dictionnaire anglais (O(1) avec Set)
    if (englishWordsSet && englishWordsSet.has(lowerWord)) {
        result = true;
    } else if (frenchWords && frenchWords.has(lowerWord)) {
        // Vérifier dans le dictionnaire français
        result = true;
    }

    // Mettre en cache
    wordCheckCache.set(word, result);
    return result;
}

/**
 * Vérifie plusieurs mots en parallèle et met à jour le cache
 */
async function checkMultipleWords(words: string[]): Promise<Map<string, boolean>> {
    // S'assurer que les dictionnaires sont chargés
    await loadDictionaries();

    // Créer un Set des mots uniques
    const uniqueWords = Array.from(new Set(words));
    
    // Vérifier tous les mots en parallèle (synchrones maintenant)
    const results = new Map<string, boolean>();
    for (const word of uniqueWords) {
        results.set(word, isDictionaryWord(word));
    }

    return results;
}

/**
 * Nettoie un nom de fichier en extrayant le titre principal
 * @param filename - Le nom de fichier original
 * @param category - La catégorie du fichier (videos, musics, etc.) pour déterminer l'API à utiliser
 * @returns Le nom de fichier nettoyé
 */
export async function cleanFilename(filename: string, category?: string): Promise<string> {
    if (!filename || filename.trim() === '') {
        return filename;
    }

    // Supprimer les préfixes macOS (._ au début)
    const cleanedInput = filename.replace(/^\._/, '');

    // Extraire l'extension
    const lastDotIndex = cleanedInput.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return cleanedInput;
    }

    const extension = cleanedInput.substring(lastDotIndex);
    let nameWithoutExt = cleanedInput.substring(0, lastDotIndex);

    // TRAITEMENT SPÉCIAL POUR LES MUSIQUES
    if (category === 'musics') {
        // Supprimer les numéros de piste au début (001 -, 040, etc.)
        nameWithoutExt = nameWithoutExt.replace(/^\d{3}\s*-\s*/i, ''); // "001 - " ou "040 "
        nameWithoutExt = nameWithoutExt.replace(/^\d{2,3}\s+/i, ''); // "040 " (sans tiret)
        nameWithoutExt = nameWithoutExt.trim();
        
        // Si le nom ne contient pas de tiret, c'est probablement juste un titre (ex: "006 - Time.mp3" devient "Time")
        if (!nameWithoutExt.includes('-') && !nameWithoutExt.includes('–')) {
            // Nettoyer le titre simple
            let title = nameWithoutExt
                .replace(/^["'`«»„‚""''‹›＂]/g, '') // Enlever guillemets au début
                .replace(/["'`«»„‚""''‹›＂]$/g, '') // Enlever guillemets à la fin
                .trim();
            
            // Enlever patterns d'album/live
            title = title.replace(/\s+(Remastered|Remaster|PULSE|Live|Official|Video|HD|Official Video|Music Video).*$/i, '').trim();
            title = title.replace(/\s+\(.*?\)$/g, '').trim(); // Enlever (Official Video), etc.
            title = title.replace(/\s+\[.*?\]$/g, '').trim();
            
            if (title.length >= 1) {
                return `${title}${extension}`;
            }
        }
        
        // Séparer artiste et titre (format "Artiste - Titre")
        // Gérer aussi les tirets cadratins et autres tirets Unicode
        const parts = nameWithoutExt.split(/\s*[-–—―]\s*/).map(p => p.trim()).filter(p => p.length > 0);
        
        if (parts.length >= 2) {
            // Prendre le titre (après le premier tiret)
            let title = parts.slice(1).join(' - ').trim();
            
            // Supprimer TOUS les types de guillemets (normaux et Unicode) au début/fin
            // Inclure les guillemets Unicode comme ＂ (U+FF02)
            title = title.replace(/^["'`«»„‚""''‹›＂＂''""]/g, '').trim(); // Début
            title = title.replace(/["'`«»„‚""''‹›＂＂''""]$/g, '').trim(); // Fin
            title = title.replace(/^["'`「」『』【】《》〈〉『』]/g, '').trim(); // Autres guillemets Unicode
            title = title.replace(/["'`「」『』【】《》〈〉『』]$/g, '').trim();
            
            // Supprimer les espaces multiples après suppression des guillemets
            title = title.replace(/\s+/g, ' ').trim();
            
            // Supprimer les informations d'album/live à la fin (ex: "PULSE Remastered", "Live At The Florida Theatre / 2015")
            // Patterns améliorés et plus exhaustifs
            const albumPatterns = [
                /\s+(Remastered|Remaster|Re-?master|Deluxe|Extended|Version|Mix|Edit|Edition)(\s+\d{4})?$/i,
                /\s+PULSE.*$/i, // Spécial pour Pink Floyd PULSE
                /\s+Live\s+At\s+.*$/i,
                /\s+Live\s+.*\s+\/\s+\d{4}$/i,
                /\s+Live\s+.*$/i, // Plus général pour "Live"
                /\s+\/\s+\d{4}$/, // " / 2015"
                /\s+\(Live.*?\)$/i,
                /\s+\(.*?Live.*?\)$/i, // (Official Video), (Live 1977), etc.
                /\s+\[.*?Live.*?\]$/i,
                /\s+\(Official.*?\)$/i, // (Official Video), (Official Music Video)
                /\s+\(.*?Video.*?\)$/i, // (Official Video), (Music Video)
                /\s+\[.*?\]$/i, // [Album Name], [HD], etc.
                /\s+\(.*?\)$/i, // (Album Name), (HD), etc.
                /\s+HD$/i,
                /\s+Official\s+Video$/i,
                /\s+Music\s+Video$/i,
                /\s+AI\s+enhanced.*$/i, // "AI enhanced Music Video"
                /\s+performed\s+by.*$/i, // "performed by Brit Floyd"
                /\s+#.*$/i, // "#PinkFloyd #otd"
                /\s+⧸.*$/i, // "⧸" (U+29F8) utilisé comme séparateur
            ];
            
            for (const pattern of albumPatterns) {
                title = title.replace(pattern, '').trim();
            }
            
            // Supprimer les années isolées à la fin (4 chiffres >= 1900)
            title = title.replace(/\s+\b(19|20)\d{2}\b$/i, '').trim();
            
            // Supprimer les caractères spéciaux Unicode qui peuvent rester
            title = title.replace(/[⧸｜]/g, ' ').trim(); // Remplace ⧸ et ｜ par des espaces
            
            // Supprimer les chiffres isolés qui ne font pas partie du titre
            // (garder les chiffres qui sont dans des mots comme "Part2", "21", "1984" si ce sont des titres connus)
            // Mais enlever les numéros de version isolés comme "2", "3", "V2", etc.
            title = title.replace(/\s+\b\d{1,2}\b(\s|$)/g, ' ').trim(); // Enlever les chiffres isolés de 1-2 chiffres
            title = title.replace(/\s+\bV\d+\b/i, '').trim(); // Enlever "V2", "V3", etc.
            title = title.replace(/\s+\bPart\s+\d+\b/i, ' Part').trim(); // Simplifier "Part 2" en "Part"
            
            // Supprimer les caractères spéciaux sauf les espaces, lettres, chiffres et quelques caractères utiles
            // Garder les caractères qui peuvent être dans un titre (espaces, tirets, apostrophes pour contractions)
            title = title.replace(/[^\w\s\-'àáâäèéêëìíîïòóôöùúûüýÿñçÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÝŸÑÇ]/g, ' ').trim();
            
            // Supprimer les espaces multiples et les espaces avant/après les tirets
            title = title.replace(/\s+/g, ' ').trim();
            title = title.replace(/\s*-\s*/g, ' ').trim(); // Remplacer les tirets par des espaces
            
            // Nettoyer une dernière fois les espaces multiples
            title = title.replace(/\s+/g, ' ').trim();
            
            // Si le titre n'est pas vide, le retourner
            if (title.length > 0) {
                return `${title}${extension}`;
            }
        }
        
        // Si on n'a pas pu extraire un titre valide, garder le nom original nettoyé (sans numéro de piste)
        // Nettoyer juste les numéros de piste et retourner le reste
        const fallbackName = nameWithoutExt.replace(/^\d{2,3}\s*-\s*/, '').replace(/^\d{2,3}\s+/, '').trim();
        if (fallbackName.length > 0) {
            return `${fallbackName}${extension}`;
        }
    }

    // Si le nom commence par une année (4 chiffres >= 1900), extraire l'année
    const yearMatch = nameWithoutExt.match(/^(\d{4})(\..*)?$/);
    if (yearMatch && yearMatch[1] && parseInt(yearMatch[1]) >= 1900) {
        return `${yearMatch[1]}${extension}`;
    }

    // Supprimer les patterns techniques (parenthèses, crochets, etc.)
    for (const pattern of TECHNICAL_PATTERNS) {
        nameWithoutExt = nameWithoutExt.replace(pattern, ' ');
    }

    // Supprimer les années (4 chiffres >= 1900) isolées
    let cleaned = nameWithoutExt;
    cleaned = cleaned.replace(/[\s\.\-](\d{4})[\s\.\-]/g, (match, year) => {
        if (parseInt(year) >= 1900) return ' ';
        return match;
    });
    cleaned = cleaned.replace(/^(\d{4})[\s\.\-]/g, (match, year) => {
        if (parseInt(year) >= 1900) return '';
        return match;
    });
    cleaned = cleaned.replace(/[\s\.\-](\d{4})$/g, (match, year) => {
        if (parseInt(year) >= 1900) return '';
        return match;
    });

    // Nettoyer les multiples espaces, points et tirets
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\.+/g, '.');
    cleaned = cleaned.replace(/[-_]+/g, ' ');

    // Supprimer les points en début et fin
    cleaned = cleaned.replace(/^\.+|\.+$/g, '');

    // Remplacer tous les points restants par des espaces (sauf dans les nombres)
    cleaned = cleaned.replace(/\.(?!\d)/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Si après nettoyage il ne reste rien, essayer d'extraire le début
    if (!cleaned || cleaned.trim() === '') {
        const parts = nameWithoutExt.split(/[.\-_]/).filter(p => p && p.length > 0);
        if (parts.length > 0) {
            cleaned = parts.slice(0, 2).join(' ');
        } else {
            return cleaned + extension;
        }
    }

    // Extraire les tokens (mots séparés par espaces, points, tirets)
    const allTokens = cleaned.split(/[\s._-]+/).filter(t => t && t.length > 0);
    
    // Charger les dictionnaires
    await loadDictionaries();

    // Vérifier tous les tokens uniques en une seule fois (batch)
    const tokenCheckResults = await checkMultipleWords(allTokens);
    
    // STRATÉGIE : Le vrai nom du fichier est TOUJOURS au début
    // On commence par les premiers tokens et on élimine progressivement les tokens techniques de la fin
    
    // Identifier les tokens techniques (mots en majuscules, acronymes, etc.)
    const isTechnicalToken = (token: string, index: number): boolean => {
        // Tokens courts en majuscules sont souvent techniques (WEB, DL, AC3, etc.)
        if (token.length <= 5 && token === token.toUpperCase() && token.length > 1) {
            return true;
        }
        
        // Tokens qui sont des acronymes connus
        const technicalPatterns = [
            /^\d+p$/i,           // 1080p, 720p
            /^\d+[kmg]b$/i,      // 10GB, 5MB
            /^(MULTi|VF2|VOSTFR|FANSUB|WEBRip|BDRip|BluRay|DVDRip|HDRip|WEB-DL|WEB|H265|HEVC|H264|X264|X265|AAC|AC3|EAC3|DTS|MP3|PROPER|REPACK|RERIP|CUSTOM|DC|LiHDL|TyHD|RARBG|YIFY|HDR|SDR|DV|AMZN|NF|DSNP|HMAX|PSA|HDLight|Light|WiTH|AD|EN|FR|VO)$/i,
            /^[A-Z]{2,5}$/,      // Acronymes de 2-5 lettres en majuscules
            /^[a-z]{1,2}[A-Z]/,  // Mot comme "x264", "mHD"
        ];
        
        for (const pattern of technicalPatterns) {
            if (pattern.test(token)) {
                return true;
            }
        }
        
        // Tokens en fin de liste sont plus susceptibles d'être techniques
        // Si on est dans les 3 derniers tokens et que c'est un mot court en majuscules
        if (index >= allTokens.length - 3 && token.length <= 4 && token === token.toUpperCase()) {
            return true;
        }
        
        return false;
    };
    
    // Trouver la meilleure séquence en partant du début
    let bestTitle: string[] = [];
    let maxScore = 0;
    
    // On teste des séquences qui commencent TOUJOURS au début (start = 0)
    // et on prend les premiers N tokens en éliminant les techniques à la fin
    for (let length = 1; length <= Math.min(8, allTokens.length); length++) {
        const candidate = allTokens.slice(0, length);
        
        // Éliminer les tokens techniques à la fin de cette séquence
        let trimmedCandidate = [...candidate];
        while (trimmedCandidate.length > 0 && isTechnicalToken(trimmedCandidate[trimmedCandidate.length - 1], trimmedCandidate.length - 1)) {
            trimmedCandidate.pop();
        }
        
        // Si après élimination il ne reste rien, passer au suivant
        if (trimmedCandidate.length === 0) {
            continue;
        }
        
        // Calculer un score pour cette séquence (en partant du début)
        let score = 0;
        let wordCount = 0;
        
        for (let i = 0; i < trimmedCandidate.length; i++) {
            const token = trimmedCandidate[i];
            
            // Ignorer les nombres purs (sauf s'ils sont courts et pourraient être des titres)
            if (/^\d+$/.test(token)) {
                const num = parseInt(token);
                // Garder les nombres < 100 qui pourraient être des titres (13 Hours, 28 Years)
                if (num < 100) {
                    score += 1;
                    wordCount++;
                }
                continue;
            }
            
            if (isWordLike(token)) {
                wordCount++;
                
                // Bonus pour les mots lisibles
                if (vowelRatio(token) >= 0.3) score += 2;
                if (!hasWeirdCapitalization(token)) score += 1;
                if (token.length >= 3 && token.length <= 15) score += 1;
                
                // Vérifier dans le dictionnaire (utilise le cache maintenant)
                const isInDict = tokenCheckResults.get(token) ?? false;
                if (isInDict) score += 2;
                
                // Bonus pour les articles au début
                const lowerToken = token.toLowerCase();
                if ((lowerToken === 'the' || lowerToken === 'a' || lowerToken === 'an') && i === 0) {
                    score += 1;
                }
            }
        }
        
        // Score par mot moyen
        let avgScore = wordCount > 0 ? score / wordCount : 0;
        
        // Bonus pour les séquences qui commencent au début (stratégie principale)
        if (trimmedCandidate.length >= 2) {
            avgScore *= 1.2; // 20% de bonus pour les séquences multi-mots depuis le début
        }
        
        // Pour les titres monosyllabiques (1 mot), exiger un score plus élevé
        if (trimmedCandidate.length === 1 && wordCount === 1) {
            // Exiger un score minimum de 5 pour un titre à un seul mot
            if (score < 5) {
                continue; // Ignorer ce candidat
            }
            // Bonus pour les titres à un mot qui sont dans le dictionnaire
            if (tokenCheckResults.get(trimmedCandidate[0])) {
                avgScore *= 1.5; // Multiplier le score pour le rendre plus attractif
            }
        }
        
        // Préférer les séquences avec un bon score qui commencent au début
        if (wordCount >= 1 && (avgScore > maxScore || (avgScore === maxScore && trimmedCandidate.length > bestTitle.length))) {
            maxScore = avgScore;
            bestTitle = trimmedCandidate;
        }
    }
    
    // Si on n'a pas trouvé de bon titre, prendre les premiers tokens significatifs (pas techniques)
    if (bestTitle.length === 0) {
        // Prendre les premiers tokens qui ne sont pas techniques
        const meaningfulTokens: string[] = [];
        for (let i = 0; i < Math.min(6, allTokens.length); i++) {
            const token = allTokens[i];
            if (isTechnicalToken(token, i)) {
                break; // Arrêter dès qu'on trouve un token technique
            }
            
            if (/^\d+$/.test(token)) {
                const num = parseInt(token);
                if (num < 100) { // Garder les nombres courts
                    meaningfulTokens.push(token);
                }
            } else if (isWordLike(token) && !hasWeirdCapitalization(token)) {
                meaningfulTokens.push(token);
            } else if (isWordLike(token)) {
                meaningfulTokens.push(token); // Même avec majuscules suspectes, on garde si c'est au début
            }
        }
        
        bestTitle = meaningfulTokens.length > 0 ? meaningfulTokens : allTokens.slice(0, 3);
    }
    
    cleaned = bestTitle.join(' ');

    // Nettoyer une dernière fois
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Limiter la longueur à 100 caractères
    if (cleaned.length > 100) {
        cleaned = cleaned.substring(0, 100).trim();
    }

    // Si après tout ça le nom est vide, utiliser une partie du nom original
    if (!cleaned || cleaned.length === 0) {
        const parts = nameWithoutExt.split(/[.\-_]/).filter(p => p && p.length > 0);
        cleaned = parts.slice(0, 2).join(' ') || nameWithoutExt.substring(0, 50);
    }

    // TODO: Intégrer TMDb/TVDb/MusicBrainz ici selon la catégorie
    // Pour l'instant, retourner le nom nettoyé
    return `${cleaned}${extension}`;
}
