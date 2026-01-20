// INFO : electron/types.ts
export interface ElectronAPI {
    isElectron: boolean;
    openAuthWindow: (url: string) => Promise<void>;
    closeAuthWindow: () => Promise<void>;
    sendOAuthToken: (token: string) => void;
    onOAuthToken: (callback: (token: string) => void) => () => void;
    onOAuthCancelled: (callback: () => void) => () => void;
    openExternal: (url: string) => Promise<void>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}