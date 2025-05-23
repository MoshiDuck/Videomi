import os
import subprocess
import tempfile
import tkinter as tk
import time
from tkinter import filedialog, simpledialog, messagebox
import vlc
import json
import logging

from config.config import FFPROBE_PATH, FFMPEG_PATH

# Configuration logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def get_video_path():
    root = tk.Tk(); root.withdraw()
    fp = filedialog.askopenfilename(
        title="Sélectionnez une vidéo",
        filetypes=[("Vidéos","*.mp4 *.mkv *.avi *.mov *.flv")]
    )
    if not fp:
        raise ValueError("Aucun fichier sélectionné")
    return fp

def get_subtitle_streams(video_path):
    cmd = [
        FFPROBE_PATH, "-v", "error",
        "-show_entries", "stream=index,codec_type,codec_name:stream_tags=language",
        "-select_streams", "s", "-of", "json", video_path
    ]
    try:
        out = subprocess.check_output(cmd, text=True)
    except subprocess.CalledProcessError as e:
        logging.error("Erreur lors de l'exécution de ffprobe: %s", e)
        raise

    data = json.loads(out)
    subs = []
    for st in data.get("streams", []):
        if st.get("codec_type")=="subtitle":
            subs.append({
                "index": st["index"],
                "codec": st.get("codec_name"),
                "language": st.get("tags",{}).get("language","inconnu")
            })
    if not subs:
        raise ValueError("Aucun sous‑titre trouvé")
    return subs

def extract_srt(video_path, stream_index, out_srt):
    cmd = [
        FFMPEG_PATH, "-y",
        "-i", video_path,
        "-map", f"0:{stream_index}",
        "-c:s", "srt",
        out_srt
    ]
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        logging.error("Erreur lors de l'extraction des sous-titres: %s", e)
        raise

def format_ass_time(sec_float):
    h = int(sec_float//3600)
    m = int((sec_float%3600)//60)
    s = int(sec_float%60)
    cs = int((sec_float - int(sec_float)) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def parse_srt_time(ts):
    h,m,rest = ts.strip().split(":")
    s,ms = rest.split(",")
    return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000

def srt_to_ass(srt_path, style):
    ass_lines = []
    with open(srt_path, encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f]

    i = 0
    while i < len(lines):
        line = lines[i]
        if "-->" in line:
            start_ts, end_ts = [x.strip() for x in line.split("-->")]
            start_s = parse_srt_time(start_ts)
            end_s   = parse_srt_time(end_ts)
            a_start = format_ass_time(start_s)
            a_end   = format_ass_time(end_s)
            txt_buf = []
            j = i + 1
            while j < len(lines) and lines[j].strip() != "" and not lines[j].isdigit():
                txt_buf.append(lines[j].strip())
                j += 1
            txt = r"\N".join(txt_buf)
            ass_lines.append(
                f"Dialogue: 0,{a_start},{a_end},{style},,0,0,0,,{txt}"
            )
            i = j
        else:
            i += 1

    return "\n".join(ass_lines)

def create_ass_header():
    return (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        "PlayResX: 384\n"
        "PlayResY: 288\n\n"
        "[V4+ Styles]\n"
        "Style: TopSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,0\n"
        "Style: BottomSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,8,10,10,10,0\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

def main():
    try:
        video = get_video_path()
        subs = get_subtitle_streams(video)
        if len(subs) < 2:
            messagebox.showerror("Erreur", "Moins de deux sous-titres trouvés dans la vidéo.")
            return

        root = tk.Tk(); root.withdraw()
        options = [f"{i}: {s['language']} • {s['codec']}" for i, s in enumerate(subs)]
        choice1 = simpledialog.askinteger("Choix sous-titre 1", "\n".join(options) + "\n\nChoisissez le premier sous-titre (numéro):")
        choice2 = simpledialog.askinteger("Choix sous-titre 2", "\n".join(options) + "\n\nChoisissez le deuxième sous-titre (numéro):")

        if choice1 is None or choice2 is None:
            return

        with tempfile.TemporaryDirectory() as td:
            s1 = os.path.join(td, "one.srt")
            s2 = os.path.join(td, "two.srt")
            extract_srt(video, subs[choice1]["index"], s1)
            extract_srt(video, subs[choice2]["index"], s2)

            merged = os.path.join(td, "merged.ass")
            with open(merged, "w", encoding="utf-8") as f:
                f.write(create_ass_header())
                f.write(srt_to_ass(s1, "TopSub"))
                f.write("\n")
                f.write(srt_to_ass(s2, "BottomSub"))

            vlc_args = [f"--sub-file={merged}", "--file-caching=3000",
                        "--network-caching=3000", "--avcodec-hw=none",
                        "--aout=directsound", "--audio-time-stretch"]
            inst   = vlc.Instance(vlc_args)
            player = inst.media_player_new()
            media  = inst.media_new(video)
            player.set_media(media)
            player.play()
            time.sleep(1)

            print("\nContrôles: [+ms/-ms] décalage | [r] reset | [q] quit")
            while True:
                cmd = input("> ").strip().lower()
                if cmd == "q":
                    break
                if cmd == "r":
                    player.video_set_spu_delay(0)
                elif cmd.startswith(("+","-")):
                    try:
                        delta = int(cmd) * 1000
                        cur   = player.video_get_spu_delay()
                        player.video_set_spu_delay(cur + delta)
                    except ValueError:
                        print("Ex : +100 ou -250")
                print(f"Délai actuel: {player.video_get_spu_delay()/1000:.0f} ms")

            player.stop()

    except Exception as e:
        logging.error("Une erreur est survenue : %s", e)
        messagebox.showerror("Erreur", str(e))

if __name__=="__main__":
    main()
