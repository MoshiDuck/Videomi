#py1FichierClient.py
import os
import requests
from json.decoder import JSONDecodeError
import re
import logging

from pyOneFichierClient.OneFichierAPI.exceptions import NotAuthorized, FichierSyntaxError, FichierResponseNotOk, \
    InsufficientInfoError
from pyOneFichierClient.OneFichierAPI.objects import FichierFolder

logger = logging.getLogger(__name__)
s = requests.Session()


# ~ s.verify = False


class FichierClient(object):

    def __init__(self, api_key=None, be_nice=False):
        if api_key:
            self.auth = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
            self.auth_nc = {'Authorization': f'Bearer {api_key}'}
            self.authed = True
        else:
            self.authed = False
            self.auth = {'Content-Type': 'application/json'}
        self.be_nice = be_nice

    def _raise_unauthorized(self):
        raise NotAuthorized(
            'You are using a very limited version of the API, and the feature you are trying to use requires an api_key.')

    def api_call(self, url, json=None, method='POST'):
        if method == 'POST':
            r = s.post(url, json=json, headers=self.auth)
        elif method == 'GET':
            r = s.get(url, headers=self.auth)
        else:
            raise FichierSyntaxError(f'Method {method} not available/implemented')
        if r.ok:
            try:
                o = r.json()
            except JSONDecodeError:
                raise FichierResponseNotOk(f'1fichier returned malformed json')
            if 'status' in o:
                if o['status'] == 'OK':
                    return r.json()
                else:
                    message = r.json()['message']
                    raise FichierResponseNotOk(f'Response from 1fichier: {message!r}')
            else:
                return o

        else:
            raise FichierResponseNotOk(f'HTTP Response code from 1fichier: {r.status_code} {r.reason}')

    def resolve_path(self, path):
        # ~ print(f'Resolving {path!r}...')
        if not path.startswith('/'):
            raise FichierSyntaxError('Paths must start from root, aka start with a forward slash ("/")')
        folder_paths = path.split('/')
        del folder_paths[0]
        folder = self.get_folder()
        for idx, folder_path in enumerate(folder_paths):
            if idx + 1 < len(folder_paths):
                folder = folder.subfolders.get_subfolder(folder_path, only_subfolders=True)
            else:
                folder = folder.subfolders.get_subfolder(folder_path)

        return folder

    def download_file(self, url: str, local_path: str,
                      inline=False, cdn=True, restrict_ip=True,
                      timeout=300, progress_callback=None) -> bool:
        if not re.match(r'https?://1fichier\.com/\?[A-Za-z0-9_-]{10,}', url):
            logging.warning(f"URL invalide: {url}")
            return False

        # Créer le dossier parent si nécessaire
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        # Obtenir le lien direct
        try:
            direct_url = self.get_download_link(
                url,
                inline=inline,
                cdn=cdn,
                restrict_ip=restrict_ip
            )
        except Exception as e:
            logging.error(f"Erreur obtention lien direct: {e}")
            return False

        # Headers pour la reprise
        headers = {}
        file_size = 0
        if os.path.exists(local_path):
            file_size = os.path.getsize(local_path)
            headers = {'Range': f'bytes={file_size}-'}

        try:
            with requests.get(direct_url, headers=headers, stream=True, timeout=timeout) as r:
                r.raise_for_status()

                # Vérifier si le serveur supporte la reprise
                if headers and r.status_code != 206:
                    logging.warning("Le serveur ne supporte pas la reprise, téléchargement depuis le début")
                    os.remove(local_path)
                    return self.download_file(url, local_path, inline, cdn, restrict_ip, timeout, progress_callback)

                # Obtenir la taille totale du fichier
                total_size = 0
                if 'Content-Length' in r.headers:
                    total_size = int(r.headers['Content-Length'])
                elif 'Content-Range' in r.headers:
                    # Format: bytes 0-999/1000
                    content_range = r.headers['Content-Range']
                    total_size = int(content_range.split('/')[-1])

                # Si reprise, ajouter la taille déjà téléchargée
                if file_size > 0 and total_size > 0:
                    total_size += file_size

                mode = 'ab' if headers else 'wb'
                downloaded = file_size
                with open(local_path, mode) as f:
                    for chunk in r.iter_content(chunk_size=8192 * 1024):  # 8MB chunks
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if progress_callback and total_size > 0:
                                percentage = int((downloaded / total_size) * 100)
                                progress_callback(percentage)

                return True

        except requests.exceptions.RequestException as e:
            logging.error(f"Erreur téléchargement: {e}")
            return False

    def list_remote_uploads(self, only_data=False):
        o = self.api_call('https://api.1fichier.com/v1/remote/ls.cgi')
        if o is not None:
            if only_data:
                return o['data']
            else:
                return o
        else:
            return None

    def remote_upload_info(self, id=None, only_data=False):
        if not self.authed:
            self._raise_unauthorized()
        if id is None:
            raise InsufficientInfoError('We need an id of an exisiting remote upload via "id" param')
        o = self.api_call('https://api.1fichier.com/v1/remote/info.cgi', json={'id': id})
        if o is not None:
            if only_data:
                return o['result']
            else:
                return o
        else:
            return None

    def remote_upload_create(self, urls=None, headers=None):
        if not self.authed:
            self._raise_unauthorized()
        if urls is None:
            raise InsufficientInfoError('We need a list of urls to upload via "urls" param')

        upload_info = {'urls': urls}
        if headers:
            upload_info.update({'headers': headers})
        o = self.api_call('https://api.1fichier.com/v1/remote/request.cgi', json=upload_info)
        if o is not None:
            # ~ if only_data:
            # ~ return o['result']
            # ~ else:
            return o
        else:
            return None

    def create_folder(self, folder_name, parent_folder_id=0):
        return self.api_call(
            "https://api.1fichier.com/v1/folder/mkdir.cgi",
            json={"folder_id": parent_folder_id, "name": folder_name}
        )

    def get_folders(self, id=0):
        if not self.authed:
            self._raise_unauthorized()
        url = "https://api.1fichier.com/v1/folder/ls.cgi"
        params = {'folder_id': id}
        try:
            # on force POST pour tester
            r = s.post(url, json=params, headers=self.auth)
            r.raise_for_status()
            o = r.json()
            if o.get('status') == 'OK':
                return o
            else:
                raise FichierResponseNotOk(o.get('message'))
        except requests.HTTPError:
            print("Erreur HTTP", r.status_code, r.reason)
            print("Corps de la réponse :", r.text)
            raise

    def _get_files(self, id=0):
        if not self.authed:
            self._raise_unauthorized()

        params = {'folder_id': id}
        o = self.api_call('https://api.1fichier.com/v1/file/ls.cgi', json=params)

        return o

    def get_files_in_folder(self, folder_id):
        files = set()
        offset = 0
        limit = 100
        while True:
            try:
                resp = self.api_call(
                    "https://api.1fichier.com/v1/file/ls.cgi",
                    json={"folder_id": folder_id, "offset": offset, "limit": limit}
                )
                batch = resp.get("files", [])
                if not batch:
                    break
                for f in batch:
                    name_clean = f["name"].strip().lower()
                    files.add(name_clean)
                if len(batch) < limit:
                    break
                offset += limit
            except Exception as e:
                print(f"❌ Erreur récupération fichiers dossier {folder_id} : {e}")
                break
        return files

    def get_folder(self, id=0, only_subfolders=False):
        o = self.get_folders(id)

        if not only_subfolders:
            o.update(self._get_files(id))

        return FichierFolder(self, o)

    def get_download_link(self, url, inline=False, cdn=False, restrict_ip=False, passw=None,
                          no_ssl=False, folder_id=None, filename=None, sharing_user=None):
        if not self.authed:
            self._raise_unauthorized()
        if restrict_ip:
            if not cdn:
                if self.be_nice:
                    cdn = True
                else:
                    raise FichierSyntaxError('Restricting IPs is only for CDN links')
        params = {
            'url': url,
            'inline': int(inline),
            'cdn': int(cdn),
            'restrict_ip': int(restrict_ip),
            'no_ssl': int(no_ssl),
        }
        if passw:
            params['pass'] = passw
        if folder_id is not None:
            if filename is None:
                raise FichierSyntaxError('Also need a filename to go along with that')
            params.update({'folder_id': folder_id, 'filename': filename})
            if folder_id == 0:
                if sharing_user is None:
                    raise FichierSyntaxError('sharing_user not specified but required')
                params.update({'sharing_user': sharing_user})
        # ~ print(params)
        o = self.api_call('https://api.1fichier.com/v1/download/get_token.cgi', json=params)
        return o['url']

    def upload_file(self, file_path):
        o = self.api_call('https://api.1fichier.com/v1/upload/get_upload_server.cgi', method='GET')
        up_srv = o['url']
        id = o['id']

        multiple_files = [('file[]', ('TESTFILE.dat', open('TESTFILE.dat', 'rb'), 'application/octet-stream'))]

        up_u = f'https://{up_srv}/upload.cgi?id={id}'
        if self.authed is True:
            r = s.post(up_u, files=multiple_files, headers=self.auth_nc, allow_redirects=False)
        else:
            r = s.post(up_u, files=multiple_files, allow_redirects=False)
        if not 'Location' in r.headers:
            raise FichierResponseNotOk('Missing Locatiion header in response')
        loc = r.headers['Location']

        r = s.get(f'https://{up_srv}{loc}')

        x = re.search('<td class="normal"><a href="(.+)"', r.text)
        if x:
            return x.group(1)
        else:
            raise FichierResponseNotOk('Missing download link')

    def get_file_info(self, url, passw=None, folder_id=None, filename=None, sharing_user=None):
        if not self.authed:
            self._raise_unauthorized()
        params = {
            'url': url
        }
        if passw:
            params['pass'] = passw
        if folder_id is not None:
            if filename is None:
                raise FichierSyntaxError('Also need a filename to go along with that')
            params.update({'folder_id': folder_id, 'filename': filename})
            if folder_id == 0:
                if sharing_user is None:
                    raise FichierSyntaxError('sharing_user not specified but required')
                params.update({'sharing_user': sharing_user})

        o = self.api_call('https://api.1fichier.com/v1/file/info.cgi', json=params)
        return o

    def virus_scan(self, url):
        if not self.authed:
            self._raise_unauthorized()
        params = {
            'url': url
        }

        o = self.api_call('https://api.1fichier.com/v1/file/scan.cgi', json=params)
        return o

    def remove_file(self, urls, codes=None):
        if not self.authed:
            self._raise_unauthorized()
        if codes:
            try:
                params = {
                    'files': [{'url': urls[i], 'code': codes[i]} for i in range(len(urls))]
                }
            except IndexError:
                raise FichierSyntaxError('If codes specified, it must be at least the length of the url list')
        else:
            params = {
                'files': [{'url': i} for i in urls]
            }

        o = self.api_call('https://api.1fichier.com/v1/file/rm.cgi', json=params)
        return {'status': o['status'], 'removed': o['removed']}

    def move_file(self, urls, destination_folder=None, destination_user='', rename=''):

        if not destination_folder and destination_user:
            raise FichierSyntaxError('If destination_folder unspecified or 0, destination_user must be specified')

        if rename and len(urls) > 1:
            raise FichierSyntaxError('Cannot rename multiple urls at once')

        params = {
            'urls': urls
        }

        if destination_folder:
            params.update({'destination_folder_id': destination_folder})
        else:
            params.update({'destination_folder_id': 0, 'destination_user': destination_user})

        if rename:
            params.update({'rename': rename})

        o = self.api_call('https://api.1fichier.com/v1/file/mv.cgi', json=params)
        return {'status': o['status'], 'moved': o['moved']}

    def copy_file(self, urls, destination_folder=None, destination_user='', rename='', passw=''):

        if not destination_folder and destination_user:
            raise FichierSyntaxError('If destination_folder unspecified or 0, destination_user must be specified')

        if rename and len(urls) > 1:
            raise FichierSyntaxError('Cannot rename multiple urls at once')

        params = {
            'urls': urls
        }

        if destination_folder:
            params.update({'folder_id': destination_folder})
        else:
            params.update({'folder_id': 0, 'sharing_user': destination_user})

        if rename:
            params.update({'rename': rename})

        if passw:
            params.update({"pass": passw})

        o = self.api_call('https://api.1fichier.com/v1/file/cp.cgi', json=params)
        return {'status': o['status'], 'copied': o['copied']}


