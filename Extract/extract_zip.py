import zipfile

from Extract.extract_manager import manager


@manager.register_extractor(['.rar', '.zip', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tar.gz', '.tar.bz2', '.tar.xz'])
def extract_archive(meta, file_path):
    try:
        with zipfile.ZipFile(file_path, 'r') as z:
            meta['.rar', '.zip', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tar.gz', '.tar.bz2', '.tar.xz'] = [
                {'name': info.filename,
                 'size': info.file_size,
                 'compress_size': info.compress_size}
                for info in z.infolist()
            ]
    except Exception as e:
        meta['zip_error'] = str(e)