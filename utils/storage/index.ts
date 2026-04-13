import { indexedDBStorage } from './indexedDBStorage';

interface StorageWrapper {
    get<T = any>(key: string): Promise<T | null>;
    set(key: string, value: any): Promise<void>;
    remove(key: string): Promise<void>;
    watch<T = any>(key: string, callback: (newValue: T) => void): void;
}

// 使用IndexedDB存储实现
export const browserStorage: StorageWrapper = indexedDBStorage;