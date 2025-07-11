from PyPDF2 import PdfReader

from Extract.extract_manager import manager

@manager.register_extractor(['.pdf'])
def extract_pdf(meta, file_path):
    try:
        reader = PdfReader(file_path)
        info = reader.metadata
        meta['pdf'] = {k[1:]: v for k, v in info.items()}
        meta['pdf']['n_pages'] = len(reader.pages)
    except Exception as e:
        meta['pdf_error'] = str(e)