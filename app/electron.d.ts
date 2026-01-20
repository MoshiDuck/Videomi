// INFO : app/electron.d.ts
export {};

declare global {
    interface Window {
        electronAPI?: {
            isElectron: boolean;
            openAuthWindow?: (url: string) => Promise<void>;
            closeAuthWindow?: () => Promise<void>;
            onOAuthToken?: (callback: (token: string) => void) => (() => void) | undefined;
            onOAuthCancelled?: (callback: () => void) => (() => void) | undefined;
            sendOAuthToken?: (token: string) => void;
            openExternal?: (url: string) => Promise<void>;
        };
    }
}