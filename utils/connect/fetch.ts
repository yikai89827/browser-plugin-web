import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { randomIntInRange } from '../index';
import { browserStorage } from '../storage';

// type HttpMethod = 'get' | 'post';
// const failedTimeInfo = {//请求失败时间信息
//     get time() {
//         return globalThis.__failedTime__ || browserStorage.get('lyFailedTime') || '{}';
//     },
//     set time(item) {
//         globalThis.__failedTime__ = item;
//         browserStorage.set('lyFailedTime', JSON.stringify(item));
//     }
//   };
const activeControllers = new Set<AbortController>();//正在请求的控制器集合
export class HttpClient {
    private instance: AxiosInstance;

    constructor({ baseURL, timeout = 10000, header }: { baseURL: string, timeout?: number, header?: any }) {
        this.instance = axios.create({
            baseURL,
            timeout,
            headers: header ? { 'Content-Type': 'application/json', ...header } : { 'Content-Type': 'application/json' }
        });
        // this.instance.defaults.baseURL = baseURL

        // 请求拦截器
        this.instance.interceptors.request.use(
            async config => {
                const failedTime: string = await browserStorage.get('lyFailedTime') || '{}';
                const { time, sleepTime } = JSON.parse(failedTime)
                const controller = new AbortController();
                //@ts-ignore
                const isLogin = baseURL === import.meta?.env?.WXT_API_URL
                if (!isLogin) {//非登录sso接口
                    if (time) {
                        activeControllers.add(controller);
                        const diffTime = Date.now() - Number(time)
                        if (sleepTime && diffTime < sleepTime) {//休眠时间成倍数增长
                            const msg = `请求接口失败：任务暂停，${Math.ceil(sleepTime / 1000 / 60)}分钟后将继续`
                            controller.abort(msg);
                            throw new Error(msg);
                        }
                        if (diffTime > 60 * 60 * 1000 * 24) {//24小时内多次失败，休眠时间累加，之后重新计数。
                            browserStorage.set('lyFailedTime', JSON.stringify({
                                times: 1,
                                time,
                                sleepTime: 5 * 60 * 1000 + randomIntInRange(1000 * 30, 1000 * 60 * 2)
                            }))
                        }
                    }
                    const ctrlTaskStatus: string = await browserStorage.get('lyCtrlTaskStatus') || '1'
                    const pageCtrlTaskStatus: string = await browserStorage.get('lyPageCtrlTaskStatus') || '1'
                    if (!ctrlTaskStatus || !pageCtrlTaskStatus) {
                        const msg = `用户手动控制：任务暂停`
                        controller.abort(msg);
                        throw new Error(msg);
                    }
                    const isAmazonVerifycodePage: string = await browserStorage.get('lyAmazonVerifycodePage') || ''
                    if (isAmazonVerifycodePage) {
                        const msg = `当前站点的亚马逊买家页面未登录：任务暂停`
                        controller.abort(msg);
                        throw new Error(msg);
                    }
                }
                return {
                    ...config,
                    signal: controller.signal
                };
            },
            error => Promise.reject(error)
        );

        // 响应拦截器
        this.instance.interceptors.response.use(
            response => {
                console.log('response==============anti-csrftoken-a2z', response.headers['anti-csrftoken-a2z'])
                if (response?.config?.signal) {
                    //@ts-ignore
                    activeControllers.delete(response?.config?.signal);
                }
                if (response.headers['anti-csrftoken-a2z']) {
                    browserStorage.set('lyResponseHeadersToken', response.headers['anti-csrftoken-a2z'])
                }
                return response.data
            },
            error => this.handleHttpError(error)
        );
    }

    public async get<T>(url: string, params?: object, config?: AxiosRequestConfig): Promise<T> {
        return this.instance.get(url, { params, ...config });
    }

    public async post<T>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
        return this.instance.post(url, data, config);
    }
    // http错误处理
    private async handleHttpError(error: any): Promise<never> {
        if (error?.response) {
            const status = error?.response?.status;
            switch (status) {
                case 400:
                    error.message = '请求参数错误';
                    break;
                case 401:
                    error.message = '未授权，请重新登录';
                    break;
                case 403:
                    error.message = '拒绝访问';
                    break;
                case 404:
                    error.message = `请求地址出错: ${error?.response?.config?.url}`;
                    break;
                case 429:
                    error.message = `请求太频繁: ${error?.response?.config?.url}`;
                    break;
                case 500:
                    error.message = '服务器内部错误';
                    break;
                default:
                    error.message = `连接失败: ${status}`;
            }
        } else if (error?.request) {
            error.message = '服务器无响应';
        }
        // sleep(5 * 1000 * 60 + randomIntInRange(1000,1000 * 60))//请求出错休眠5分钟 再继续请求
        //@ts-ignore
        const isLogin = baseURL === import.meta?.env?.WXT_API_URL//是否erp登录接口
        if (!isLogin) {
            if (error.config?.signal) {
                activeControllers.delete(error.config.signal);
            }
            activeControllers.forEach(ctrl => ctrl.abort('任务暂停中'));
            activeControllers.clear();
            const failedTime = await browserStorage.get('lyFailedTime')
            const n = JSON.parse(failedTime)?.times
            const times = n ? Number(n) + 1 : 1
            const time = Date.now()
            const sleepTime = (5 * 60 * 1000 + randomIntInRange(1000 * 30, 1000 * 60 * 2)) * times
            browserStorage.set('lyFailedTime', JSON.stringify({ times, time, sleepTime }))
            const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
            if (syncTaskInfo) {//出现请求失败将任务状态设置为非运行
                const temp = JSON.parse(syncTaskInfo)
                temp.isRunning = false
                await browserStorage.set('lySyncTaskInfo', JSON.stringify(temp))
            }
        }
        return Promise.reject(error);
    }
}
// @ts-ignore
const baseURL: string = import.meta.env.WXT_API_URL || ''
console.log('HttpClient baseURL', baseURL)
export const http = new HttpClient({ baseURL });//erp api