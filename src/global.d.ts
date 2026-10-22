export {};

declare global {
  type UpdateState =
    | { status: 'idle' }
    | { status: 'unsupported'; reason: string }
    | { status: 'checking' }
    | { status: 'available'; version: string; releaseNotes?: string }
    | { status: 'not-available'; version: string }
    | { status: 'downloading'; version: string; percent: number }
    | { status: 'downloaded'; version: string }
    | { status: 'error'; message: string };

  interface FileFilter {
    name: string;
    extensions: string[];
  }

  interface BudgetApi {
    loadData(): Promise<{ json: string | null; recoveredFromBackup?: boolean; error?: string }>;
    saveData(json: string): Promise<{ ok: boolean; error?: string }>;
    saveDataSync(json: string): { ok: boolean; error?: string };
    saveFile(options: { defaultName: string; content: string; filters: FileFilter[] }): Promise<{
      ok: boolean;
      canceled?: boolean;
      path?: string;
      error?: string;
    }>;
    openFile(options: { filters: FileFilter[] }): Promise<{ ok: boolean; canceled?: boolean; content?: string; error?: string }>;
    showDataFolder(): Promise<void>;
    getInfo(): Promise<{ version: string; dataPath: string; packaged: boolean }>;
    updates: {
      getState(): Promise<UpdateState>;
      check(): Promise<UpdateState>;
      download(): Promise<UpdateState>;
      install(): void;
      onState(callback: (state: UpdateState) => void): () => void;
    };
    /** Only set by end-to-end tests. */
    fakeToday?: string;
  }

  interface Window {
    budgetApi?: BudgetApi;
  }
}
