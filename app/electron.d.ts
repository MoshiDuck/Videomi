// INFO : app/electron.d.ts
export interface IElectronAPI {
    register: (email: string, password: string) => Promise<{
        success: boolean;
        user?: {
            token: string;
            uid: string;
            email: string;
            id: string;
            expiresAt: number;
            refreshToken?: string;
        };
        error?: string;
        refreshToken?: string;
    }>;

    // Existing APIs
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
    download: (options: { url: string; filename?: string }) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
    selectFiles: () => Promise<string[]>;
    getFileInfo: (filePath: string) => Promise<{ name: string; path: string; size: number; lastModified: Date; extension: string }>;
    onUploadProgress: (callback: (progress: any) => void) => void;
    removeUploadProgressListener: () => void;

    // HLS Upload API
    convertAndUploadToHLS: (filePath: string) => Promise<any>;
    convertAndUploadToStreaming: (filePath: string) => Promise<any>;

    // API D'AUTHENTIFICATION
    login: (email: string, password: string) => Promise<{
        success: boolean;
        user?: {
            token: string;
            uid: string;
            email: string;
            id: string;
            expiresAt: number;
            refreshToken?: string;
        };
        error?: string;
        refreshToken?: string;
    }>;

    logout: (refreshToken?: string) => Promise<{ success: boolean; error?: string }>;
    getCurrentUser: () => Promise<{ user: any; isAuthenticated: boolean }>;
    checkAuth: () => Promise<{ isAuthenticated: boolean }>;
    hasRefreshToken: () => Promise<{ hasRefreshToken: boolean }>;
    refreshAuth: () => Promise<{ success: boolean; token?: string; error?: string }>;

    isElectron: boolean;
}

// This extends the global Window interface to include your electronAPI
declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}