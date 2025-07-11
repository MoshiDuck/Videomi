import docx

from Extract.extract_manager import manager

@manager.register_extractor(['.docx'])
def extract_docx(meta, file_path):
    try:
        doc = docx.Document(file_path)
        props = doc.core_properties
        meta['docx'] = {
            'author': props.author,
            'title': props.title,
            'created': props.created,
            'modified': props.modified,
        }
    except Exception as e:
        meta['docx_error'] = str(e)