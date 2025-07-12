#onefichier_service.py
from json import JSONDecodeError
from typing import List, Union

import yaml
from pyOneFichierClient.OneFichierAPI.exceptions import NotAuthorized, FichierSyntaxError, FichierResponseNotOk
from pyOneFichierClient.OneFichierAPI.py1FichierClient import s


class FichierClient:
    def __init__(self, be_nice=False):
        with open("Config/config.yaml", "r") as f:
            config = yaml.safe_load(f)
        self.auth = {'Content-Type': 'application/json'}
        self.auth_nc = {}
        self.authed = False
        self.api_key = config['onefichier']['api_key']
        if self.api_key:
            self.auth['Authorization'] = f'Bearer {self.api_key}'
            self.auth_nc = {'Authorization': f'Bearer {self.api_key}'}
            self.authed = True
        self.be_nice = be_nice
        
    def get_download_link(self, url, inline = False, cdn = False, restrict_ip = False, passw = None, 
        no_ssl = False, folder_id = None, filename = None, sharing_user = None):
        if not self.authed:
            self._raise_unauthorized()
        if restrict_ip:
            if not cdn:
                if self.be_nice:
                    cdn = True
                else:
                    raise FichierSyntaxError('Restricting IPs is only for CDN links')
        params = {
            'url' : url,
            'inline' : int(inline),
            'cdn' : int(cdn),
            'restrict_ip':  int(restrict_ip),
            'no_ssl' : int(no_ssl),
        }
        if passw:
            params['pass'] = passw
        if folder_id is not None:
            if filename is None:
                raise FichierSyntaxError('Also need a filename to go along with that')
            params.update({'folder_id' : folder_id, 'filename' : filename})
            if folder_id == 0:
                if sharing_user is None:
                    raise FichierSyntaxError('sharing_user not specified but required')
                params.update({'sharing_user' : sharing_user})
        #~ print(params)
        o = self.api_call('https://api.1fichier.com/v1/download/get_token.cgi', json = params)
        return o['url']
    def _raise_unauthorized(self):
        raise NotAuthorized("Cette fonctionnalité nécessite une clé API.")

    def api_call(self, url, json_data=None, method='POST'):
        if method == 'POST':
            r = s.post(url, json=json_data, headers=self.auth)
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

    def get_folders(self, folder_id: int = 0):
        return self.api_call(
            "https://api.1fichier.com/v1/folder/ls.cgi",
            json_data={"folder_id": folder_id}
        )

    def remove_file(self, urls: List[str], codes: List[Union[str, None]] = None) -> dict:
        if not self.authed:
            self._raise_unauthorized()

        # Construire le payload attendu par l'API
        if codes:
            if len(codes) < len(urls):
                raise FichierSyntaxError('If codes specified, it must be at least the length of the url list')
            files_payload = [
                {'url': urls[i], 'code': codes[i]}
                for i in range(len(urls))
                if urls[i]
            ]
        else:
            files_payload = [{'url': u} for u in urls if u]

        params = {'files': files_payload}

        o = self.api_call(
            'https://api.1fichier.com/v1/file/rm.cgi',
            json_data=params,
            method='POST'
        )

        return {
            'status': o.get('status'),
            'removed': o.get('removed', 0)
        }

    def get_folder_id_map(self, parent_id=0, recursive=True):
        folders = self.get_folders(parent_id).get("sub_folders", [])
        id_map = {folder["name"].lower(): folder["id"] for folder in folders}
        if recursive:
            for folder in folders:
                sub_map = self.get_folder_id_map(folder["id"], recursive=True)
                id_map.update(sub_map)
        return id_map

    def create_folder(self, folder_name, parent_folder_id=0):
        return self.api_call("https://api.1fichier.com/v1/folder/mkdir.cgi",
                             json_data={"folder_id": parent_folder_id, "name": folder_name})

    def move_file(self, urls, destination_folder=None):
        if not destination_folder:
            raise FichierSyntaxError("ID de dossier de destination requis.")
        return self.api_call("https://api.1fichier.com/v1/file/mv.cgi",
                             json_data={"urls": urls, "destination_folder_id": destination_folder})