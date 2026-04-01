import { browser } from 'wxt/browser';
interface StorageWrapper {
    get<T = any>(key: string): Promise<T | null>;
    set(key: string, value: any): Promise<void>;
    remove(key: string): Promise<void>;
    watch<T = any>(key: string, callback: (newValue: T) => void): void;
}
//browserStorage存取处理
export const browserStorage: StorageWrapper = {
    async get<T>(key: string): Promise<T | null> {
        try {
            // console.log('browser.storage', browser.storage)
            const result = await browser.storage?.local?.get(key);
            return result[key] as T ?? null;
        } catch (error) {
            console.error('Storage 获取出错:', error);
            return null;
        }
    },

    async set(key: string, value: any): Promise<void> {
        await browser.storage?.local?.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
        await browser.storage?.local?.remove(key);
    },

    watch<T>(key: string, callback: (newValue: T) => void): void {
        browser.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && key in changes) {
                callback(changes[key].newValue);
            }
        });
    }
};