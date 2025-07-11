from Extract.extract_manager import manager


@manager.register_extractor([])
def extract_generic(meta, file_path):
    meta['note'] = 'Aucun extracteur dédié pour cette extension.'
    if file_path:
        print(file_path)