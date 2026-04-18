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
    private dbVersion: number = 1;
    private initPromise: Promise<void> | null = null;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 3;

    constructor(dbName: string = 'browser-plugin-v3', storeName: string = 'storage') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.initPromise = this.initDB();
    }

    private async initDB(): Promise<void> {
        if (typeof indexedDB === 'undefined') {
            console.warn('IndexedDB is not available, using memory storage as fallback');
            this.isIndexedDBAvailable = false;
            return;
        }

        return new Promise((resolve, reject) => {
            this.isIndexedDBAvailable = true;
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB initialization error:', request.error);
                this.isIndexedDBAvailable = false;
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.reconnectAttempts = 0;
                this.setupDBErrorHandlers();
                this.processQueue();
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    private setupDBErrorHandlers(): void {
        if (!this.db) return;

        this.db.onerror = (event) => {
            console.error('IndexedDB database error:', event);
        };

        this.db.onclose = () => {
            console.warn('IndexedDB database connection closed');
            this.db = null;
            this.isIndexedDBAvailable = false;
        };

        this.db.onversionchange = () => {
            console.warn('IndexedDB database version change detected');
            if (this.db) {
                this.db.close();
                this.db = null;
            }
            this.isIndexedDBAvailable = false;
        };
    }

    private async ensureDB(): Promise<IDBDatabase> {
        if (this.initPromise) {
            try {
                await this.initPromise;
            } catch (error) {
                console.error('Failed to initialize IndexedDB:', error);
            }
        }

        if (this.db && this.db.connection) {
            return this.db;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect to IndexedDB (attempt ${this.reconnectAttempts})`);
            this.initPromise = this.initDB();
            await this.initPromise;
        }

        if (!this.db) {
            throw new Error('IndexedDB is not available');
        }

        return this.db;
    }

    private processQueue(): void {
        if (this.db) {
            while (this.queue.length > 0) {
                const callback = this.queue.shift();
                if (callback) {
                    try {
                        callback(this.db);
                    } catch (error) {
                        console.error('Error processing queue callback:', error);
                    }
                }
            }
        }
    }

    private withDB<T>(callback: (db: IDBDatabase) => Promise<T>): Promise<T> {
        return new Promise(async (resolve, reject) => {
            if (!this.isIndexedDBAvailable) {
                reject(new Error('IndexedDB is not available'));
                return;
            }

            try {
                const db = await this.ensureDB();
                callback(db)
                    .then(resolve)
                    .catch(reject);
            } catch (error) {
                reject(error);
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
                    try {
                        const transaction = db.transaction(this.storeName, 'readonly');
                        const store = transaction.objectStore(this.storeName);
                        const request = store.get(key);

                        request.onerror = () => {
                            const error = (request.error || new Error('Unknown error'));
                            reject(new Error(`从IndexedDB获取数据失败: ${error.message}`));
                        };

                        request.onsuccess = () => {
                            resolve(request.result as T ?? null);
                        };

                        transaction.onerror = () => {
                            reject(new Error('Transaction failed'));
                        };
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        } catch (error: any) {
            console.error('从IndexedDB数据错误:', error);
            if (error.message?.includes('connection is closing') ||
                error.message?.includes('not a valid key')) {
                this.isIndexedDBAvailable = false;
                this.db = null;
            }
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
                    try {
                        const transaction = db.transaction(this.storeName, 'readwrite');
                        const store = transaction.objectStore(this.storeName);
                        const request = store.put(value, key);

                        request.onerror = () => {
                            const error = (request.error || new Error('Unknown error'));
                            reject(new Error(`保存IndexedDB数据失败: ${error.message}`));
                        };

                        request.onsuccess = () => {
                            resolve();
                        };

                        transaction.oncomplete = () => {
                            this.notifyWatchers(key, value);
                        };

                        transaction.onerror = () => {
                            reject(new Error('Transaction failed'));
                        };
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        } catch (error: any) {
            console.error('保存IndexedDB数据错误:', error);
            if (error.message?.includes('connection is closing') ||
                error.message?.includes('not a valid key')) {
                this.isIndexedDBAvailable = false;
                this.db = null;
            }
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
                    try {
                        const transaction = db.transaction(this.storeName, 'readwrite');
                        const store = transaction.objectStore(this.storeName);
                        const request = store.delete(key);

                        request.onerror = () => {
                            reject(new Error('删除IndexedDB数据失败'));
                        };

                        request.onsuccess = () => {
                            resolve();
                        };

                        transaction.oncomplete = () => {
                            this.notifyWatchers(key, null);
                        };

                        transaction.onerror = () => {
                            reject(new Error('Transaction failed'));
                        };
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        } catch (error: any) {
            console.error('删除IndexedDB数据错误:', error);
            if (error.message?.includes('connection is closing')) {
                this.isIndexedDBAvailable = false;
                this.db = null;
            }
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
                    console.error('IndexedDB监听回调错误:', error);
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
