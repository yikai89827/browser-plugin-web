import { indexedDBStorage } from './indexedDBStorage';

interface StorageWrapper {
    get<T = any>(key: string): Promise<T | null>;
    set(key: string, value: any): Promise<void>;
    remove(key: string): Promise<void>;
    watch<T = any>(key: string, callback: (newValue: T) => void): void;
    keys(): Promise<string[]>;
}

// 使用IndexedDB存储实现
export const browserStorage: StorageWrapper = {
    get: indexedDBStorage.get.bind(indexedDBStorage),
    set: indexedDBStorage.set.bind(indexedDBStorage),
    remove: indexedDBStorage.remove.bind(indexedDBStorage),
    watch: indexedDBStorage.watch.bind(indexedDBStorage),
    keys: async (): Promise<string[]> => {
        const result = await indexedDBStorage.keys();
        return result ?? [];
    },
};
