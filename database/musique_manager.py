import os

from config.config import MUSIQUES_DB_PATH
from database.musiques import obtenir_musiques
from test_py.navigateur.cache import SortCache, SearchCache


class MusiqueManager:
    def __init__(self, music_info, thumbnail_manager, thumbnail_dir):
        print("[INIT] Initialisation du MusicManager")
        self.music_info = music_info
        self.thumbnail_manager = thumbnail_manager
        self.thumbnail_dir = thumbnail_dir
        self.sort_cache = SortCache()
        self.search_cache = SearchCache()

    def load_music_info(self):
        import sqlite3
        try:
            conn = sqlite3.connect(MUSIQUES_DB_PATH)
            c = conn.cursor()
            c.execute("SELECT chemin, titre, artiste, album, duree FROM music_info")
            rows = c.fetchall()
            self.music_info = {}
            for row in rows:
                chemin, titre, artiste, album, duree = row
                self.music_info[chemin] = {
                    'chemin': chemin,
                    'titre': titre,
                    'artiste': artiste,
                    'album': album,
                    'duree': duree
                }
            conn.close()
        except Exception as e:
            print(f"[LOAD_MUSIC_INFO] Erreur : {e}")
            self.music_info = {}
        return self.music_info

    def save_music_info(self):
        import sqlite3
        conn = sqlite3.connect(MUSIQUES_DB_PATH)
        c = conn.cursor()
        for chemin, info in self.music_info.items():
            titre = info.get('titre', os.path.splitext(os.path.basename(chemin))[0])
            artiste = info.get('artiste', 'Inconnu')
            album = info.get('album', 'Inconnu')
            duree = info.get('duree', 0)
            print(f"[DEBUG] INSERT chemin={chemin} titre={titre}")
            c.execute("""
                INSERT OR REPLACE INTO music_info
                (chemin, titre, artiste, album, duree)
                VALUES (?, ?, ?, ?, ?)
            """, (chemin, titre, artiste, album, duree))
        conn.commit()
        conn.close()
        print("[DEBUG] commit et close effectués pour musique")

    def charger_musiques(self):
        musiques, new_info = obtenir_musiques(self.music_info)
        for music in musiques:
            titre_nettoye = self.thumbnail_manager.sanitize_title(music['titre'])
            dossier_music = os.path.join(self.thumbnail_dir, titre_nettoye)
            if not os.path.exists(dossier_music):
                self.thumbnail_manager.check_and_queue_thumbnail(
                    music['chemin'], music['titre']
                )

        if new_info:
            print("[CHARGER_MUSIQUES] Nouvelles infos détectées, mise à jour du cache")
            self.music_info.update(new_info)
            self.save_music_info()
            self.sort_cache.clear()
            self.search_cache.clear()

        return musiques

    def filter_musics(self, musiques, search_text):
        search_text = search_text.lower()
        if search_text:
            filtered = self.search_cache.object(search_text)
            if filtered is None:
                filtered = [music for music in musiques if search_text in music['titre'].lower()]
                self.search_cache.insert(search_text, filtered)
            else:
                print("[FILTER_MUSICS] Cache utilisé")
        else:
            print("[FILTER_MUSICS] Texte vide, retour de la liste complète")
            filtered = musiques
            self.search_cache.clear()
        return filtered

    def sort_musics(self, musiques, key, ascending=True):
        cache_key = (key, ascending)
        sorted_musics = self.sort_cache.object(cache_key)
        if sorted_musics is None:
            print("[SORT_MUSICS] Cache manquant, tri en cours")
            sorted_musics = sorted(musiques, key=lambda x: x.get(key, ''), reverse=not ascending)
            self.sort_cache.insert(cache_key, sorted_musics)
        else:
            print("[SORT_MUSICS] Cache utilisé")
        return sorted_musics

    @staticmethod
    def advanced_filter(musiques, artiste=None, album=None, max_duree=None, texte_recherche=None):
        max_duree_sec = max_duree * 60 if max_duree is not None else None  # en secondes
        result = []
        for m in musiques:
            if max_duree_sec is not None and m.get('duree', 0) > max_duree_sec:
                continue
            if artiste and m.get('artiste', '').lower() != artiste.lower():
                continue
            if album and m.get('album', '').lower() != album.lower():
                continue
            if texte_recherche and texte_recherche.lower() not in m.get('titre', '').lower():
                continue
            result.append(m)
        return result