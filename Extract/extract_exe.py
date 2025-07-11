import pefile

from Extract.extract_manager import manager


@manager.register_extractor(['.exe'])
def extract_exe(meta, file_path):
    try:
        pe = pefile.PE(file_path, fast_load=True)
        meta['pe'] = {
            'timestamp': pe.FILE_HEADER.TimeDateStamp,
            'sections': [
                {
                    'name': sec.Name.decode(errors='ignore').rstrip('\x00'),
                    'virtual_size': sec.Misc_VirtualSize,
                    'rva': sec.VirtualAddress
                } for sec in pe.sections
            ]
        }
    except Exception as e:
        meta['pe_error'] = str(e)