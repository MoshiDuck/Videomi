import tarfile

from Extract.extract_manager import manager

@manager.register_extractor(['.tar', '.tgz', '.tar.gz'])
def extract_tar_meta(meta, file_path):
    try:
        with tarfile.open(file_path, 'r:*') as t:
            meta['tar'] = [
                {'name': m.name, 'size': m.size, 'type': m.type}
                for m in t.getmembers()
            ]
    except Exception as e:
        meta['tar_error'] = str(e)