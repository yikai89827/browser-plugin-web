
import { DBItem, DBRowInfo, DBOptions } from '../../interfaces/db'
// 数据库处理类封装
export class IndexedDBWrapper {
    private db: IDBDatabase | null = null;
    constructor(private options: DBOptions) { }
    // 初始化数据库
    private async init(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.options.name, this.options.version);

            request.onupgradeneeded = (event) => {
                try {
                    this.db = (event.target as IDBOpenDBRequest).result;
                    if (!this.db.objectStoreNames.contains(this.options.storeName)) {
                        const store = this.db.createObjectStore(this.options.storeName, {
                            keyPath: 'id',
                            autoIncrement: true
                        });

                        this.options.data?.forEach(item => {
                            store.createIndex('id_idx', 'id', { unique: true });//唯一索引
                        });
                    }
                } catch (error) {
                    reject('数据库初始化失败: ' + error);
                }
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve(true);
            };

            request.onerror = (event) => {
                reject('数据库初始化失败: ' + (event.target as IDBOpenDBRequest).error);
            };
        });
    }
    // 事物封装
    private async transaction<T>(
        mode: IDBTransactionMode,
        handler: (store: IDBObjectStore) => IDBRequest,
        range?: string
    ): Promise<T[]> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(this.options.storeName, mode);
            const store = transaction.objectStore(this.options.storeName);
            const request = handler(store);
            if (range === 'all') {//获取所有数据
                const results: T[] = [];
                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        console.log('获取所有数据成功 results', results)
                        resolve(results)
                    }
                };
                request.onerror = (event) => {
                    reject('获取所有数据失败: ' + (event.target as IDBOpenDBRequest).error)
                };
            } else if (range) {//按国家获取所有数据
                const results: T[] = [];
                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        if (cursor.value.country === range) {
                            results.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        console.log('按国家获取所有数据成功 results', results)
                        resolve(results)
                    }
                };
                request.onerror = (event) => {
                    reject('按国家获取所有数据失败: ' + (event.target as IDBOpenDBRequest).error)
                };
            } else {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }
        });
    }
    // 唯一性写入数据
    public async add<DBRowInfo>(data: DBRowInfo): Promise<IDBValidKey> {
        return this.transaction('readwrite', store => store.add(data));
    }
    // 覆盖写入数据
    public async put<DBRowInfo>(data: DBRowInfo): Promise<IDBValidKey> {
        return this.transaction('readwrite', store => store.put(data));
    }
    // 读取单条数据
    public async get<T>(key: IDBValidKey): Promise<T[] | undefined> {
        return this.transaction('readonly', store => store.get(key));
    }
    // 读取所有数据
    public async getAll<T>(item: string = 'all'): Promise<T[]> {
        return this.transaction('readonly', store => store.openCursor(), item);
    }
    // 按国家读取所有数据
    public async getAllByCountry<T>(country: string): Promise<T[]> {
        return this.transaction('readonly', (store): IDBRequest => store.openCursor(), country)
    }
    //获取已写入总条数
    public async getTotalCount<T>(): Promise<T[]> {
        return this.transaction("readonly", store => store.count());
    }
}
export const DB = async () => {
    return  new IndexedDBWrapper({
        name: 'couponData',
        version: 1,
        storeName: 'coupons',
        data: []
    });
}