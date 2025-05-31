import os
from operator import itemgetter

from config.config import VIDEOS_DB_PATH
from database.videos import obtenir_videos
from test_py.navigateur.cache import SortCache, SearchCache

class VideoManager:
    def __init__(self, video_info, thumbnail_manager, thumbnail_dir):
        print("[INIT] Initialisation du VideoManager")
        self.video_info = video_info
        self.thumbnail_manager = thumbnail_manager
        self.thumbnail_dir = thumbnail_dir
        self.sort_cache = SortCache()
        self.search_cache = SearchCache()

    def load_video_info(self):
        import sqlite3
        try:
            conn = sqlite3.connect(VIDEOS_DB_PATH)
            c = conn.cursor()

            # Création de la table si elle n'existe pas
            c.execute("""
                CREATE TABLE IF NOT EXISTS video_info (
                    chemin              TEXT PRIMARY KEY,
                    nom                 TEXT,
                    duree               REAL,
                    audio_langues       TEXT,
                    sous_titres_langues TEXT
                )
            """)
            conn.commit()

            c.execute("SELECT chemin, nom, duree, audio_langues, sous_titres_langues FROM video_info")
            rows = c.fetchall()
            self.video_info = {}
            for row in rows:
                chemin, nom, duree, audio_langues, sous_titres_langues = row
                self.video_info[chemin] = {
                    'chemin': chemin,
                    'nom': nom,
                    'duree': duree,
                    'audio_langues': audio_langues.split(',') if audio_langues else [],
                    'sous_titres_langues': sous_titres_langues.split(',') if sous_titres_langues else []
                }
            conn.close()
        except Exception as e:
            print(f"[LOAD_VIDEO_INFO] Erreur : {e}")
            self.video_info = {}
        return self.video_info

    def save_video_info(self):
        import sqlite3
        conn = sqlite3.connect(VIDEOS_DB_PATH)
        c = conn.cursor()

        # Création de la table si elle n'existe pas
        c.execute("""
            CREATE TABLE IF NOT EXISTS video_info (
                chemin              TEXT PRIMARY KEY,
                nom                 TEXT,
                duree               REAL,
                audio_langues       TEXT,
                sous_titres_langues TEXT
            )
        """)
        conn.commit()

        for chemin, info in self.video_info.items():
            nom = info.get('nom', os.path.splitext(os.path.basename(chemin))[0])
            duree = info.get('duree', 0)
            audio_str = ','.join(info.get('audio_langues', []))
            subs_str = ','.join(info.get('sous_titres_langues', []))
            print(f"[DEBUG] INSERT chemin={chemin} nom={nom}")
            c.execute("""
                INSERT OR REPLACE INTO video_info
                (chemin, nom, duree, audio_langues, sous_titres_langues)
                VALUES (?, ?, ?, ?, ?)
            """, (chemin, nom, duree, audio_str, subs_str))
        conn.commit()
        conn.close()
        print("[DEBUG] commit et close effectués")

    def charger_videos(self):
        videos, new_info = obtenir_videos(self.video_info)
        for video in videos:
            titre_nettoye = self.thumbnail_manager.sanitize_title(video['nom'])
            dossier_video = os.path.join(self.thumbnail_dir, titre_nettoye)
            if not os.path.exists(dossier_video):
                self.thumbnail_manager.check_and_queue_thumbnail(
                    video['chemin'], video['nom']
                )

        if new_info:
            print("[CHARGER_VIDEOS] Nouvelles infos détectées, mise à jour du cache")
            self.video_info.update(new_info)
            self.save_video_info()
            self.sort_cache.clear()
            self.search_cache.clear()

        return videos

    def filter_videos(self, videos, search_text):
        search_text = search_text.lower()
        if search_text:
            filtered = self.search_cache.object(search_text)
            if filtered is None:
                filtered = [video for video in videos if search_text in video['nom'].lower()]
                self.search_cache.insert(search_text, filtered)
            else:
                print("[FILTER_VIDEOS] Cache utilisé")
        else:
            print("[FILTER_VIDEOS] Texte vide, retour de la liste complète")
            filtered = videos
            self.search_cache.clear()
        return filtered

    def sort_videos(self, videos, key, ascending=True):
        cache_key = (key, ascending)
        sorted_videos = self.sort_cache.object(cache_key)
        if sorted_videos is None:
            print("[SORT_VIDEOS] Cache manquant, tri en cours")
            sorted_videos = sorted(videos, key=itemgetter(key), reverse=not ascending)
            self.sort_cache.insert(cache_key, sorted_videos)
        else:
            print("[SORT_VIDEOS] Cache utilisé")
        return sorted_videos

        # ==== database/video_manager.py ====

    @staticmethod
    def advanced_filter(videos, texte_recherche=None, max_duree=None, audio=None, st=None):
        """
        Filtre la liste de vidéos selon :
         - texte_recherche : sous‐chaîne à chercher dans 'nom'
         - max_duree       : durée MAXIMALE en secondes
         - audio           : liste de langues audio normalisées (fra, eng, spa)
         - st              : liste de langues sous‐titre normalisées
        """
        result = []
        for v in videos:
            # 1) Filtre par durée
            if max_duree is not None and v.get('duree', 0) > max_duree:
                continue

            # 2) Filtre audio
            if audio is not None:
                video_langs = [lang.lower() for lang in (v.get('audio_langues') or [])]
                if not any(lang in video_langs for lang in audio):
                    continue

            # 3) Filtre sous-titres
            if st is not None:
                st_langs = [lang.lower() for lang in (v.get('sous_titres_langues') or [])]
                if not any(lang in st_langs for lang in st):
                    continue

            # 4) Filtre texte
            if texte_recherche and texte_recherche.lower() not in v.get('nom', '').lower():
                continue

            result.append(v)

        return result