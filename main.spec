# -*- mode: python ; coding: utf-8 -*-
import sys
from PyInstaller.utils.hooks import collect_submodules

# Chemin de ton projet
project_path = r"C:\Users\Gabriel\PycharmProjects\Videomi"

# Modules internes et PyQt6
hidden_modules = collect_submodules('ui') + collect_submodules('player') + \
                 collect_submodules('db') + collect_submodules('server') + \
                 collect_submodules('utils')

# Chemin vers la DLL Python 3.13
python_dll_path = r"C:\Users\Gabriel\AppData\Local\Programs\Python\Python313\python313.dll"

# Analyse
a = Analysis(
    ['main.py'],
    pathex=[project_path],
    binaries=[
        (r'C:\Program Files\Python313\python313.dll', '.'),
        (r'Ressource\Win\ffmpeg\bin\ffmpeg.exe', 'ffmpeg'),
        (r'Ressource\Win\ffmpeg\bin\ffprobe.exe', 'ffmpeg'),
        (r'Ressource\Win\mpv\mpv.exe', 'mpv'),
        (r'Ressource\MacOs\ffmpeg\ffmpeg', 'ffmpeg_mac'),
        (r'Ressource\MacOs\ffmpeg\ffprobe', 'ffmpeg_mac'),
        (r'Ressource\MacOs\mpv.app\Contents\MacOS\mpv', 'mpv_mac')
    ],
    datas=[
        (r'Config\config.json', 'Config'),
        (r'Config\config.yaml', 'Config'),
        (r'Config\style.qss', 'Config'),
        (r'Config\user_token.json', 'Config')
    ],
    hiddenimports=hidden_modules,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

# PyZ
pyz = PYZ(a.pure)

# EXE en mode onefile
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=False,  # IMPORTANT pour onefile
    name='Videomi',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # GUI sans console
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# Pour onefile, pas besoin de COLLECT
