// INFO : electron/ffmpeg.ts
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, sleep, waitForFileStable, getVideoDuration, estimateTotalSegments } from './utils.js';
import { uploadToWorker } from './upload.js';
import { SubtitleInfo, UploadQueueItem } from './types.js';

const execAsync = promisify(exec);

// Exporter getVideoDuration pour qu'il soit accessible depuis main.ts
export { getVideoDuration };

// ============================================================================
// FONCTION D'EXTRACTION DE SOUS-TITRES
// ============================================================================
export async function extractSubtitles(filePath: string, outputDir: string): Promise<SubtitleInfo[]> {
    console.log(`🎬 Début extraction sous-titres: ${filePath}`);
    const extractedSubtitles: SubtitleInfo[] = [];
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath).toLowerCase();
    const isMkv = ext === '.mkv';

    console.log(`🔍 Recherche de sous-titres pour: ${path.basename(filePath)} (${isMkv ? 'MKV' : 'autre format'})`);

    try {
        console.log(`📝 Étape 1: Détection ffprobe...`);
        const probeCommand = `ffprobe -v quiet -print_format json -show_streams -select_streams s "${filePath}"`;
        console.log(`🔧 Commande: ${probeCommand}`);
        const { stdout } = await execAsync(probeCommand, { maxBuffer: 1024 * 1024 * 10 });
        const probeResult = JSON.parse(stdout);

        const subtitleStreams = probeResult.streams || [];
        console.log(`📝 ${subtitleStreams.length} flux de sous-titres détectés par ffprobe`);

        for (let i = 0; i < subtitleStreams.length; i++) {
            const stream = subtitleStreams[i];
            const streamIndex = stream.index || i;
            const language = stream.tags?.language || stream.tags?.LANGUAGE || 'und';
            const codecName = stream.codec_name || 'unknown';
            const codecLong = stream.codec_long_name || codecName;

            console.log(`  - Flux ${streamIndex}: lang="${language}", codec="${codecName}" (${codecLong})`);

            const baseName = `subtitle_${language}_${streamIndex}`;
            let subtitlePath: string | null = null;
            let extracted = false;

            try {
                subtitlePath = path.join(outputDir, `${baseName}.vtt`);
                const extractCommand = `ffmpeg -y -i "${filePath}" -map 0:${streamIndex} -c:s webvtt "${subtitlePath}"`;
                console.log(`🔧 Commande ffmpeg: ${extractCommand}`);
                await execAsync(extractCommand, { maxBuffer: 1024 * 1024 * 10 });

                if (fs.existsSync(subtitlePath) && fs.statSync(subtitlePath).size > 0) {
                    extractedSubtitles.push({
                        language,
                        path: subtitlePath,
                        format: 'vtt',
                        codec: codecName
                    });
                    console.log(`  ✅ Extraite en VTT: ${path.basename(subtitlePath)}`);
                    extracted = true;
                } else {
                    console.log(`  ⚠️ Fichier VTT vide ou non créé: ${subtitlePath}`);
                }
            } catch (ffmpegError: unknown) {
                console.log(`  ⚠️ ffmpeg échoué pour flux ${streamIndex}: ${getErrorMessage(ffmpegError)}`);
            }

            if (!extracted && isMkv) {
                console.log(`  📋 MKV - possible extraction avec mkvextract`);
            }
        }
    } catch (probeError: unknown) {
        console.log(`⚠️ ffprobe échoué: ${getErrorMessage(probeError)}`);
    }

    // Extraction MKV avec mkvextract (si disponible)
    if (isMkv && extractedSubtitles.length === 0) {
        try {
            console.log(`📝 Étape 2: Tentative avec mkvextract (MKVToolNix)...`);
            await execAsync('mkvextract --version');
            console.log(`  ✅ mkvextract disponible`);

            try {
                const { stdout } = await execAsync(`mkvmerge -J "${filePath}"`, { maxBuffer: 1024 * 1024 * 10 });
                const info = JSON.parse(stdout);
                const tracks = info.tracks || [];
                console.log(`  📊 ${tracks.length} pistes trouvées dans MKV`);
                for (const track of tracks) {
                    if (track.type === 'subtitles') {
                        const trackId = track.id;
                        const codec = track.codec || 'sub';
                        const tempSrt = path.join(outputDir, `mkv_track_${trackId}.srt`);
                        const finalVtt = path.join(outputDir, `subtitle_mkv_${trackId}.vtt`);
                        console.log(`  🛠️ Extraction piste ${trackId} (${codec})...`);
                        try {
                            await execAsync(`mkvextract tracks "${filePath}" ${trackId}:"${tempSrt}"`, { maxBuffer: 1024 * 1024 * 10 });
                            if (fs.existsSync(tempSrt)) {
                                console.log(`  📄 Fichier SRT créé: ${tempSrt} (${fs.statSync(tempSrt).size} bytes)`);
                                await execAsync(`ffmpeg -y -i "${tempSrt}" -c:s webvtt "${finalVtt}"`, { maxBuffer: 1024 * 1024 * 10 });
                                if (fs.existsSync(finalVtt) && fs.statSync(finalVtt).size > 0) {
                                    extractedSubtitles.push({
                                        language: 'und',
                                        path: finalVtt,
                                        format: 'vtt',
                                        codec: codec
                                    });
                                    fs.unlinkSync(tempSrt);
                                    console.log(`  ✅ Piste MKV ${trackId} extraite: ${path.basename(finalVtt)}`);
                                } else {
                                    console.log(`  ⚠️ Conversion VTT échouée pour piste ${trackId}`);
                                }
                            }
                        } catch (e: any) {
                            console.log(`  ⚠️ Erreur extraction piste MKV ${trackId}: ${getErrorMessage(e)}`);
                        }
                    }
                }
            } catch (mkvError: any) {
                console.log(`  ⚠️ mkvmerge non disponible ou a échoué: ${getErrorMessage(mkvError)}`);
                console.log(`  🔄 Fallback: extraction brute des pistes 2-10`);
                for (let trackNum = 2; trackNum <= 10; trackNum++) {
                    const tempSrt = path.join(outputDir, `mkv_track_${trackNum}.srt`);
                    const finalVtt = path.join(outputDir, `subtitle_mkv_${trackNum}.vtt`);
                    try {
                        console.log(`  🛠️ Tentative extraction piste ${trackNum}...`);
                        await execAsync(`mkvextract tracks "${filePath}" ${trackNum}:"${tempSrt}"`, { maxBuffer: 1024 * 1024 * 10 });
                        if (fs.existsSync(tempSrt) && fs.statSync(tempSrt).size > 0) {
                            await execAsync(`ffmpeg -y -i "${tempSrt}" -c:s webvtt "${finalVtt}"`, { maxBuffer: 1024 * 1024 * 10 });
                            if (fs.existsSync(finalVtt) && fs.statSync(finalVtt).size > 0) {
                                extractedSubtitles.push({
                                    language: 'und',
                                    path: finalVtt,
                                    format: 'vtt',
                                    codec: 'mkv_extract'
                                });
                                fs.unlinkSync(tempSrt);
                                console.log(`  ✅ Piste MKV ${trackNum} extraite: ${path.basename(finalVtt)}`);
                            }
                        }
                    } catch (trackError: any) {
                        console.log(`  ⏭️ Pas de piste ${trackNum} ou erreur: ${getErrorMessage(trackError).substring(0, 100)}`);
                    }
                }
            }
        } catch (mkvToolError: any) {
            console.log(`  ⚠️ mkvextract non disponible: ${getErrorMessage(mkvToolError)}`);
        }
    }

    // Recherche de fichiers externes
    if (extractedSubtitles.length === 0) {
        console.log(`📝 Étape 3: Recherche de sous-titres externes...`);

        const videoDir = path.dirname(filePath);
        const baseName = path.basename(filePath, path.extname(filePath));

        const subExtensions = ['.srt', '.vtt', '.ass', '.ssa', '.sub', '.txt'];
        const filesInDir = fs.readdirSync(videoDir);
        console.log(`  📂 Contenu du dossier: ${filesInDir.length} fichiers`);
        const matchingSubs = filesInDir.filter(file => {
            const fileLower = file.toLowerCase();
            const fileBase = path.basename(file, path.extname(file)).toLowerCase();
            const ext = path.extname(file).toLowerCase();

            const baseMatch = fileBase === baseName.toLowerCase();
            const partialMatch = fileBase.startsWith(baseName.toLowerCase()) ||
                baseName.toLowerCase().startsWith(fileBase);

            const isMatch = (baseMatch || partialMatch) && subExtensions.includes(ext);
            if (isMatch) {
                console.log(`  🔍 Fichier sous-titre trouvé: ${file}`);
            }
            return isMatch;
        });

        console.log(`  📂 ${matchingSubs.length} fichiers externes trouvés:`, matchingSubs);

        for (const subFile of matchingSubs) {
            const subPath = path.join(videoDir, subFile);
            const subExt = path.extname(subFile).toLowerCase();
            const subName = path.basename(subFile, subExt);

            try {
                console.log(`  🛠️ Traitement de ${subFile}...`);
                const finalVtt = path.join(outputDir, `external_${subName}.vtt`);

                if (subExt === '.vtt') {
                    fs.copyFileSync(subPath, finalVtt);
                    console.log(`  📋 VTT copié directement`);
                } else if (subExt === '.srt' || subExt === '.ass' || subExt === '.ssa') {
                    const convertCommand = `ffmpeg -y -i "${subPath}" -c:s webvtt "${finalVtt}"`;
                    console.log(`  🔧 Commande de conversion: ${convertCommand}`);
                    await execAsync(convertCommand, { maxBuffer: 1024 * 1024 * 5 });
                }

                if (fs.existsSync(finalVtt) && fs.statSync(finalVtt).size > 0) {
                    let language = 'und';
                    const langMatch = subName.match(/\.(eng|fre|fra|fr|en|es|de|it|ja|ko|zh|ru|ar|pt|nl|pl|tr)(\.|$)/i);
                    if (langMatch) {
                        language = langMatch[1].toLowerCase();
                        if (language === 'fra') language = 'fre';
                        if (language === 'en') language = 'eng';
                    }

                    extractedSubtitles.push({
                        language,
                        path: finalVtt,
                        format: 'vtt',
                        codec: 'external'
                    });
                    console.log(`  ✅ Externe converti: ${path.basename(subFile)} -> ${path.basename(finalVtt)} (${language})`);
                } else {
                    console.log(`  ⚠️ Échec conversion pour ${subFile}`);
                }
            } catch (externalError: any) {
                console.log(`  ⚠️ Erreur traitement externe ${subFile}: ${getErrorMessage(externalError)}`);
            }
        }
    }

    // Dernière tentative - extraction forcée
    if (extractedSubtitles.length === 0) {
        console.log(`📝 Étape 4: Dernière tentative d'extraction...`);

        try {
            const forcedCommand = `ffmpeg -y -i "${filePath}" -map 0:s -c:s webvtt "${outputDir}/forced_subtitle_%d.vtt"`;
            console.log(`🔧 Commande forcée: ${forcedCommand}`);
            await execAsync(forcedCommand, { maxBuffer: 1024 * 1024 * 10 });

            const forcedFiles = fs.readdirSync(outputDir)
                .filter(f => f.startsWith('forced_subtitle_') && f.endsWith('.vtt'))
                .sort();

            console.log(`  📄 ${forcedFiles.length} fichiers forcés générés`);
            for (const forcedFile of forcedFiles) {
                const forcedPath = path.join(outputDir, forcedFile);
                if (fs.existsSync(forcedPath) && fs.statSync(forcedPath).size > 0) {
                    extractedSubtitles.push({
                        language: 'und',
                        path: forcedPath,
                        format: 'vtt',
                        codec: 'forced'
                    });
                    console.log(`  ✅ Forcée: ${forcedFile}`);
                }
            }
        } catch (forcedError: any) {
            console.log(`  ⚠️ Extraction forcée échouée: ${getErrorMessage(forcedError)}`);
        }
    }

    console.log(`📊 RÉSUMÉ: ${extractedSubtitles.length} sous-titre(s) extrait(s) au total`);
    if (extractedSubtitles.length === 0) {
        console.log(`⚠️ ATTENTION: Aucun sous-titre trouvé.`);
    } else {
        extractedSubtitles.forEach((sub, idx) => {
            console.log(`  ${idx + 1}. ${sub.language} - ${path.basename(sub.path)} (${sub.codec})`);
        });
    }

    return extractedSubtitles;
}

// ============================================================================
// FONCTIONS POUR UPLOAD CONCURRENT
// ============================================================================

// Fonction dynamique pour obtenir le UID (évite les imports circulaires)
function dynamicGetUID(): string | null {
    try {
        const { getUID } = require('./auth.js');
        return getUID();
    } catch (error) {
        console.warn('⚠️ Impossible de récupérer UID:', error);
        return null;
    }
}

// Pool d'upload concurrent
export class ConcurrentUploadPool {
    private queue: UploadQueueItem[] = [];
    private pendingUploads = new Set<Promise<any>>();
    private isClosed = false;
    private concurrency: number;
    private uploadedCount = 0;
    private totalSegments = 0;
    private segmentsAdded = 0;
    private onProgress?: (progress: number, current: number, total: number) => void;

    constructor(concurrency = 6, onProgress?: (progress: number, current: number, total: number) => void) {
        this.concurrency = concurrency;
        this.onProgress = onProgress;
    }

    addFile(filePath: string, folder: string, isSegment = false, uid?: string) {
        if (this.isClosed) {
            throw new Error("Pool fermé, impossible d'ajouter des fichiers");
        }

        // Utiliser le UID fourni ou récupérer dynamiquement
        const userUid = uid || dynamicGetUID();
        if (!userUid) {
            throw new Error('UID utilisateur non disponible');
        }

        // Transformer le dossier pour inclure le UID
        let finalFolder = folder;
        if (folder) {
            const parts = folder.split('/');
            if (parts[0] === 'videos' && parts.length >= 2) {
                const sha256 = parts[1];
                finalFolder = `${userUid}/videos/${sha256}`;
            } else {
                finalFolder = `${userUid}/${folder}`;
            }
        }

        const queueItem: UploadQueueItem = {
            filePath,
            folder: finalFolder,
            isSegment,
            uid: userUid
        };

        this.queue.push(queueItem);
        if (isSegment) {
            this.segmentsAdded++;
        }
        this.processQueue();
    }

    setTotalSegments(total: number) {
        console.log(`📊 Définition du nombre total de segments: ${total}`);
        this.totalSegments = total;
    }

    private async processQueue() {
        while (this.queue.length > 0 && this.pendingUploads.size < this.concurrency) {
            const item = this.queue.shift();
            if (!item) continue;

            const uploadPromise = this.uploadFile(item.filePath, item.folder, item.isSegment);
            this.pendingUploads.add(uploadPromise);

            uploadPromise.finally(() => {
                this.pendingUploads.delete(uploadPromise);
                this.processQueue();
            });
        }
    }

    private async uploadFile(filePath: string, folder: string, isSegment: boolean) {
        const fileName = path.basename(filePath);
        console.log(`📤 Upload concurrent: ${fileName} (segment: ${isSegment})`);

        try {
            const isStable = await waitForFileStable(filePath, 100, 100);
            if (!isStable) {
                console.warn(`⚠️ Fichier non stabilisé, tentative upload quand même: ${fileName}`);
            }

            const segmentNumber = isSegment ? this.uploadedCount + 1 : undefined;
            const totalSegments = isSegment ? Math.max(this.totalSegments, this.segmentsAdded) : undefined;

            const res = await uploadToWorker(filePath, {
                key: fileName,
                folder,
                isSegment,
                segmentNumber,
                totalSegments,
                cacheControl: isSegment ? 'public, max-age=31536000, immutable' : 'no-cache'
            });

            if (isSegment) {
                this.uploadedCount++;
                const total = Math.max(this.totalSegments, this.segmentsAdded, this.uploadedCount);
                const progress = total > 0 ? (this.uploadedCount / total) * 100 : 0;
                this.onProgress?.(progress, this.uploadedCount, total);
            }

            return res;
        } catch (error) {
            console.error(`❌ Erreur upload concurrent ${fileName}:`, getErrorMessage(error));
            throw error;
        }
    }

    async waitForCompletion() {
        while (this.queue.length > 0 || this.pendingUploads.size > 0) {
            console.log(`⏳ Attente uploads: queue=${this.queue.length}, pending=${this.pendingUploads.size}`);
            if (this.pendingUploads.size > 0) {
                await Promise.all(Array.from(this.pendingUploads));
            }
            await sleep(100);
        }
        console.log(`✅ Tous les uploads concurrents terminés`);
    }

    close() {
        this.isClosed = true;
    }

    getUploadedCount(): number {
        return this.uploadedCount;
    }
}

// Fonction principale pour conversion avec upload concurrent
export async function runFfmpegWithConcurrentUpload(
    filePath: string,
    outputPath: string,
    r2Folder: string,
    onProgress: (stage: string, progress: number, details?: any) => void,
    segmentTime: number = 6
): Promise<{
    m3u8Path: string;
    mpdPath: string;
    m4sFiles: string[];
    subtitles: SubtitleInfo[];
}> {
    console.log(`🎬 Début conversion avec upload concurrent (segments de ${segmentTime}s)`);

    const videoDuration = await getVideoDuration(filePath);
    const estimatedTotalSegments = Math.max(1, Math.ceil(videoDuration / segmentTime));

    console.log(`⏱️ Durée vidéo: ${videoDuration}s, estimation segments: ${estimatedTotalSegments} (${segmentTime}s par segment)`);

    let conversionProgress = 0;
    let uploadedSegments = 0;
    let totalSegmentsGenerated = 0;

    const uploadPool = new ConcurrentUploadPool(6, (progress, current, total) => {
        uploadedSegments = current;
        totalSegmentsGenerated = Math.max(total, estimatedTotalSegments, current);

        const estimatedSegmentsConverted = Math.max(1, Math.floor((conversionProgress / 100) * estimatedTotalSegments));
        const uploadProgressPct = Math.min(100, (current / Math.max(1, estimatedSegmentsConverted)) * 100);
        const safeUploadProgress = Math.min(uploadProgressPct, conversionProgress);
        const overallProgress = (conversionProgress * 0.7) + (safeUploadProgress * 0.3);

        onProgress('conversion_and_upload', overallProgress, {
            conversionProgress,
            uploadProgress: safeUploadProgress,
            uploadedSegments: current,
            totalSegments: totalSegmentsGenerated,
            estimatedTotalSegments: estimatedTotalSegments
        });
    });

    uploadPool.setTotalSegments(estimatedTotalSegments);

    console.log(`🔍 Extraction des sous-titres...`);
    const subtitles = await extractSubtitles(filePath, outputPath);
    console.log(`📝 ${subtitles.length} sous-titres extraits en VTT`);

    const args = [
        '-y',
        '-i', filePath,
        '-map', '0:v:0', '-map', '0:a:0',
        '-c:a', 'aac', '-b:a', '128k',
        '-filter:v:0', 'scale=1920:-2', '-c:v:0', 'libx264', '-b:v:0', '3000k', '-maxrate:v:0', '3300k', '-bufsize:v:0', '6000k',
        '-filter:v:1', 'scale=1280:-2', '-c:v:1', 'libx264', '-b:v:1', '1500k', '-maxrate:v:1', '1650k', '-bufsize:v:1', '3000k',
        '-filter:v:2', 'scale=854:-2', '-c:v:2', 'libx264', '-b:v:2', '800k', '-maxrate:v:2', '880k', '-bufsize:v:2', '1600k',
        '-use_timeline', '1',
        '-use_template', '1',
        '-seg_duration', String(segmentTime),
        '-init_seg_name', 'init-stream$RepresentationID$.m4s',
        '-media_seg_name', 'chunk-stream$RepresentationID$-$Number%05d$.m4s',
        '-adaptation_sets', 'id=0,streams=v id=1,streams=a',
        '-hls_playlist', '1',
        '-f', 'dash',
        path.join(outputPath, 'manifest.mpd')
    ];

    console.log(`🔧 Arguments ffmpeg:`, args);

    const detectedSegments = new Set<string>();
    let stopWatching: (() => void) | null = null;

    const watchForNewFiles = () => {
        console.log(`👀 Surveillance des nouveaux fichiers dans: ${outputPath}`);
        let lastFiles = new Set(fs.readdirSync(outputPath));

        const interval = setInterval(() => {
            try {
                const currentFiles = new Set(fs.readdirSync(outputPath));
                const newFiles = Array.from(currentFiles).filter(f => !lastFiles.has(f));

                for (const file of newFiles) {
                    const filePathFull = path.join(outputPath, file);
                    const stats = fs.statSync(filePathFull);

                    if (file.endsWith('.m4s')) {
                        if (!detectedSegments.has(file)) {
                            detectedSegments.add(file);
                            console.log(`🔍 Nouveau segment détecté: ${file} (${stats.size} bytes)`);
                            uploadPool.addFile(filePathFull, r2Folder, true);
                        }
                    }
                }

                lastFiles = currentFiles;
            } catch (error) {
                console.warn(`⚠️ Erreur surveillance fichiers: ${getErrorMessage(error)}`);
            }
        }, 500);

        stopWatching = () => {
            console.log(`🛑 Arrêt surveillance fichiers`);
            clearInterval(interval);
        };

        return stopWatching;
    };

    stopWatching = watchForNewFiles();

    try {
        await new Promise<void>((resolve, reject) => {
            console.log(`🚀 Lancement de ffmpeg...`);
            const ff = spawn('ffmpeg', args, { cwd: outputPath, stdio: ['ignore', 'pipe', 'pipe'] });

            ff.stderr.setEncoding('utf8');
            ff.stderr.on('data', (chunk: string) => {
                const data = chunk.toString();

                const timeMatch = data.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                if (timeMatch) {
                    const timeStr = timeMatch[1];
                    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
                    const currentTime = hours * 3600 + minutes * 60 + seconds;

                    if (videoDuration > 0) {
                        conversionProgress = Math.min((currentTime / videoDuration) * 100, 99);

                        const estimatedSegmentsConverted = Math.max(1, Math.floor((conversionProgress / 100) * estimatedTotalSegments));
                        const uploadProgressPct = Math.min(100, (uploadedSegments / Math.max(1, estimatedSegmentsConverted)) * 100);
                        const safeUploadProgress = Math.min(uploadProgressPct, conversionProgress);
                        const overallProgress = (conversionProgress * 0.7) + (safeUploadProgress * 0.3);

                        onProgress('conversion_and_upload', overallProgress, {
                            conversionProgress,
                            uploadProgress: safeUploadProgress,
                            uploadedSegments,
                            totalSegments: totalSegmentsGenerated,
                            estimatedTotalSegments: estimatedTotalSegments
                        });
                    }
                }

                const segmentMatch = data.match(/Writing segment (\d+) to '(.+\.m4s)'/);
                if (segmentMatch) {
                    const segmentFile = segmentMatch[2];
                    const segmentPath = path.join(outputPath, path.basename(segmentFile));
                    if (fs.existsSync(segmentPath) && !detectedSegments.has(path.basename(segmentFile))) {
                        console.log(`📝 Segment détecté via stderr: ${segmentFile}`);
                        detectedSegments.add(path.basename(segmentFile));
                        uploadPool.addFile(segmentPath, r2Folder, true);
                    }
                }
            });

            ff.on('error', (err: Error) => {
                console.error(`❌ Erreur ffmpeg:`, getErrorMessage(err));
                if (stopWatching) stopWatching();
                uploadPool.close();
                reject(err);
            });

            ff.on('close', (code: number, signal: NodeJS.Signals | null) => {
                console.log(`🔚 ffmpeg terminé - code: ${code}, signal: ${signal}`);
                if (code === 0) {
                    conversionProgress = 100;
                    const finalUploadedSegments = uploadPool.getUploadedCount();
                    const finalUploadProgress = Math.min(100, (finalUploadedSegments / Math.max(1, totalSegmentsGenerated)) * 100);

                    onProgress('conversion_and_upload', 85, {
                        conversionProgress: 100,
                        uploadProgress: finalUploadProgress,
                        uploadedSegments: finalUploadedSegments,
                        totalSegments: totalSegmentsGenerated,
                        estimatedTotalSegments: estimatedTotalSegments
                    });
                    resolve();
                } else {
                    if (stopWatching) stopWatching();
                    uploadPool.close();
                    reject(new Error(`ffmpeg exited with code ${code} (signal ${signal})`));
                }
            });
        });

        console.log(`⏳ Attente fin des uploads concurrents...`);
        await uploadPool.waitForCompletion();

    } finally {
        if (stopWatching) {
            stopWatching();
        }
        uploadPool.close();
    }

    const generatedFiles = fs.readdirSync(outputPath);
    const m4sFiles = generatedFiles
        .filter(file => file.endsWith('.m4s'))
        .sort()
        .map(file => path.join(outputPath, file));

    console.log(`📄 Total segments générés: ${m4sFiles.length}`);

    const mpdPath = path.join(outputPath, 'manifest.mpd');
    let m3u8Path = path.join(outputPath, 'manifest.m3u8');

    if (!fs.existsSync(m3u8Path)) {
        const alt = generatedFiles.find(f => f.endsWith('.m3u8'));
        if (alt) {
            m3u8Path = path.join(outputPath, alt);
        } else if (m4sFiles.length > 0) {
            m3u8Path = path.join(outputPath, 'master.m3u8');
            let m3u8Content = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:${segmentTime}
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MAP:URI="init-stream0.m4s"
`;
            for (const seg of m4sFiles.filter(f => path.basename(f).includes('chunk-stream')).map(s => path.basename(s))) {
                m3u8Content += `#EXTINF:${segmentTime}.000000,
${seg}
`;
            }
            m3u8Content += '#EXT-X-ENDLIST';
            fs.writeFileSync(m3u8Path, m3u8Content);
            console.log(`✅ .m3u8 généré: ${m3u8Path}`);
        } else {
            m3u8Path = '';
        }
    }

    return {
        m3u8Path,
        mpdPath: fs.existsSync(mpdPath) ? mpdPath : '',
        m4sFiles,
        subtitles
    };
}

// Créer le fichier metadata.json
export function createMetadataFile(
    outputPath: string,
    sha256: string,
    originalName: string,
    sizeBytes: number,
    durationSeconds: number
): string {
    const metadata = {
        originalName,
        size_bytes: sizeBytes,
        duration_seconds: durationSeconds,
        sha256,
        createdAt: new Date().toISOString()
    };

    const metadataPath = path.join(outputPath, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`📝 metadata.json créé: ${metadataPath}`);

    return metadataPath;
}