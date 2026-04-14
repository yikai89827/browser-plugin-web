interface StorageWrapper {
    get<T = any>(key: string): Promise<T | null>;
    set(key: string, value: any): Promise<void>;
    remove(key: string): Promise<void>;
    watch<T = any>(key: string, callback: (newValue: T) => void): void;
}

class IndexedDBStorage implements StorageWrapper {
    private dbName: string;
    private storeName: string;
    private db: IDBDatabase | null = null;
    private watchers: Map<string, Set<(newValue: any) => void>> = new Map();
    private queue: ((db: IDBDatabase) => void)[] = [];
    private memoryStorage: Map<string, any> = new Map();
    private isIndexedDBAvailable: boolean = false;

    constructor(dbName: string = 'browser-plugin-v3', storeName: string = 'storage') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.initDB();
    }

    private initDB(): void {
        if (typeof indexedDB === 'undefined') {
            console.warn('IndexedDB is not available, using memory storage as fallback');
            this.isIndexedDBAvailable = false;
            return;
        }

        this.isIndexedDBAvailable = true;
        const request = indexedDB.open(this.dbName, 1);

        request.onerror = (event) => {
            console.error('IndexedDB initialization error:', (event.target as IDBOpenDBRequest).error);
            this.isIndexedDBAvailable = false;
        };

        request.onsuccess = (event) => {
            this.db = (event.target as IDBOpenDBRequest).result;
            this.processQueue();
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(this.storeName)) {
                db.createObjectStore(this.storeName);
            }
        };
    }

    private processQueue(): void {
        if (this.db) {
            while (this.queue.length > 0) {
                const callback = this.queue.shift();
                if (callback) {
                    callback(this.db!);
                }
            }
        }
    }

    private withDB<T>(callback: (db: IDBDatabase) => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this.isIndexedDBAvailable) {
                // IndexedDB不可用，直接拒绝并使用内存存储
                reject(new Error('IndexedDB is not available'));
                return;
            }
            
            if (this.db) {
                callback(this.db)
                    .then(resolve)
                    .catch(reject);
            } else {
                // 限制队列长度，避免内存溢出
                if (this.queue.length > 100) {
                    reject(new Error('Storage queue is full'));
                    return;
                }
                
                this.queue.push((db) => {
                    callback(db)
                        .then(resolve)
                        .catch(reject);
                });
            }
        });
    }

    async get<T>(key: string): Promise<T | null> {
        if (!this.isIndexedDBAvailable) {
            return this.memoryStorage.get(key) as T ?? null;
        }

        try {
            return await this.withDB<T>((db) => {
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(this.storeName, 'readonly');
                    const store = transaction.objectStore(this.storeName);
                    const request = store.get(key);

                    request.onerror = () => {
                        const error = (request.error || new Error('Unknown error'));
                        reject(new Error(`Failed to get value from IndexedDB: ${error.message}`));
                    };

                    request.onsuccess = () => {
                        resolve(request.result as T ?? null);
                    };
                });
            });
        } catch (error) {
            console.error('IndexedDB get error:', error);
            return this.memoryStorage.get(key) as T ?? null;
        }
    }

    async set(key: string, value: any): Promise<void> {
        if (!this.isIndexedDBAvailable) {
            this.memoryStorage.set(key, value);
            this.notifyWatchers(key, value);
            return;
        }

        try {
            await this.withDB<void>((db) => {
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(this.storeName, 'readwrite');
                    const store = transaction.objectStore(this.storeName);
                    const request = store.put(value, key);

                    request.onerror = () => {
                        reject(new Error('Failed to set value in IndexedDB'));
                    };

                    request.onsuccess = () => {
                        resolve();
                    };

                    transaction.oncomplete = () => {
                        this.notifyWatchers(key, value);
                    };
                });
            });
        } catch (error) {
            console.error('IndexedDB set error:', error);
            this.memoryStorage.set(key, value);
            this.notifyWatchers(key, value);
        }
    }

    async remove(key: string): Promise<void> {
        if (!this.isIndexedDBAvailable) {
            this.memoryStorage.delete(key);
            this.notifyWatchers(key, null);
            return;
        }

        try {
            await this.withDB<void>((db) => {
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(this.storeName, 'readwrite');
                    const store = transaction.objectStore(this.storeName);
                    const request = store.delete(key);

                    request.onerror = () => {
                        reject(new Error('Failed to remove value from IndexedDB'));
                    };

                    request.onsuccess = () => {
                        resolve();
                    };

                    transaction.oncomplete = () => {
                        this.notifyWatchers(key, null);
                    };
                });
            });
        } catch (error) {
            console.error('IndexedDB remove error:', error);
            this.memoryStorage.delete(key);
            this.notifyWatchers(key, null);
        }
    }

    private notifyWatchers(key: string, value: any): void {
        const watcherSet = this.watchers.get(key);
        if (watcherSet) {
            watcherSet.forEach(callback => {
                try {
                    callback(value);
                } catch (error) {
                    console.error('Error in watcher callback:', error);
                }
            });
        }
    }

    watch<T>(key: string, callback: (newValue: T) => void): void {
        if (!this.watchers.has(key)) {
            this.watchers.set(key, new Set());
        }
        this.watchers.get(key)!.add(callback);
    }
}

export const indexedDBStorage = new IndexedDBStorage();