from pathlib import Path

class SousTitreConverter:
    ASS_RES_X = 384
    ASS_RES_Y = 288

    ASS_HEADER = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {ASS_RES_X}\n"
        f"PlayResY: {ASS_RES_Y}\n\n"
        "[V4+ Styles]\n"
        "Style: TopSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
        "0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,0\n"
        "Style: BottomSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
        "0,0,0,0,100,100,0,0,1,2,0,8,10,10,10,0\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    @staticmethod
    def parse_srt_time(timestamp: str) -> float:
        """Convertit un timestamp SRT (HH:MM:SS,ms) en secondes (float)."""
        h, m, rest = timestamp.strip().split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    @staticmethod
    def format_ass_time(seconds: float) -> str:
        """Convertit des secondes (float) en format ASS (H:MM:SS.CC)."""
        total_cs = int(round(seconds * 100))
        h = total_cs // 360_000
        m = (total_cs % 360_000) // 6000
        s = (total_cs % 6000) // 100
        cs = total_cs % 100
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    def srt_to_ass_lines(self, srt_path: Path, style_name: str = "BottomSub") -> list[str]:
        """
        Convertit un fichier .srt en lignes ASS (liste de strings, pas encore de header).
        """
        ass_lines = []
        with srt_path.open(encoding="utf-8") as f:
            raw_lines = [line.strip() for line in f if line.strip()]

        idx = 0
        while idx < len(raw_lines):
            if "-->" in raw_lines[idx]:
                start_ts, end_ts = map(str.strip, raw_lines[idx].split("-->"))
                a_start = self.format_ass_time(self.parse_srt_time(start_ts))
                a_end = self.format_ass_time(self.parse_srt_time(end_ts))
                idx += 1
                text_lines = []
                while idx < len(raw_lines) and "-->" not in raw_lines[idx] and not raw_lines[idx].isdigit():
                    text_lines.append(raw_lines[idx])
                    idx += 1
                dialogue = (
                    f"Dialogue: 0,{a_start},{a_end},{style_name},,0,0,0,,"
                    f"{'\\N'.join(text_lines)}"
                )
                ass_lines.append(dialogue)
            else:
                idx += 1
        return ass_lines

    def convert_to_ass(self, srt_path: Path, output_path: Path, style_name: str = "BottomSub") -> None:
        """
        Convertit un SRT en fichier ASS complet (avec header) et l'écrit à output_path.
        """
        ass_lines = self.srt_to_ass_lines(srt_path, style_name)
        with output_path.open("w", encoding="utf-8") as f:
            f.write(self.ASS_HEADER)
            f.write("\n".join(ass_lines))
