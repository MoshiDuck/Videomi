from PIL import Image

from Extract.extract_manager import manager


@manager.register_extractor(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.svg', '.webp', '.heic'])
def extract_image(meta, file_path):
    try:
        with Image.open(file_path) as img:
            meta['image'] = {
                'format': img.format,
                'mode': img.mode,
                'size': img.size,
            }
            exif = img.getexif()
            if exif:
                meta['image']['exif'] = {k: exif[k] for k in exif}
    except Exception as e:
        meta['image_error'] = str(e)