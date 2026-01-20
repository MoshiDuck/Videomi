import { spawnSync } from "child_process";

const YTDLP_PATHS = [
  "/opt/homebrew/bin/yt-dlp", // Homebrew Apple Silicon
  "/usr/local/bin/yt-dlp",    // Homebrew Intel
  "yt-dlp"                     // fallback PATH
];

let found = false;

for (const path of YTDLP_PATHS) {
  const result = spawnSync(path, ["--version"], { encoding: "utf-8" });
  if (result.status === 0) {
    console.log("✅ yt-dlp trouvé à :", path, "version :", result.stdout.trim());
    found = true;
    break;
  } else {
    console.log("❌ Pas trouvé :", path);
  }
}

if (!found) {
  console.error("❌ yt-dlp introuvable. Vérifie l'installation avec `brew install yt-dlp`");
}

