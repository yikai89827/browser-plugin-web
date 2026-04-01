import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

type RetryConfig = {
    retries: number;
    retryDelay: number;
    retryCondition: (error: any) => boolean;
};

class HttpService {
    private instance: AxiosInstance;
    private retryConfig: RetryConfig;

    constructor(config: AxiosRequestConfig & { retry?: Partial<RetryConfig> }) {
        this.instance = axios.create({
            timeout: 10000,
            ...config,
        });

        this.retryConfig = {
            retries: 3,
            retryDelay: 1000,
            retryCondition: (error) =>
                !error.config?.__isRetry &&
                (error.code === 'ECONNABORTED' || error.response?.status === 401),
            ...config.retry,
        };

        this.initInterceptors();
    }

    private initInterceptors() {
        // 请求拦截
        this.instance.interceptors.request.use(
            (config: InternalAxiosRequestConfig) => {
                config.headers.Authorization = `Bearer ${localStorage.getItem('token')}`;
                return config;
            },
            (error) => Promise.reject(error)
        );

        // 响应拦截
        this.instance.interceptors.response.use(
            (response: AxiosResponse) => {
                if (response.data.code !== 200) {
                    return Promise.reject(response.data);
                }
                return response.data;
            },
            async (error) => {
                const { config, response } = error;

                // 错误处理
                if (response) {
                    switch (response.status) {
                        case 401:
                            await this.refreshToken();
                            return this.retryRequest(config);
                        case 403:
                            window.location.href = '/403';
                            break;
                        case 500:
                            return Promise.reject('服务器内部错误');
                    }
                }
                return Promise.reject(this.normalizeError(error));
            }
        );
    }

    private async refreshToken() {
        const { data } = await axios.post('/auth/refresh');
        localStorage.setItem('token', data.token);
    }

    private async retryRequest(config: InternalAxiosRequestConfig) {
        config.headers.Authorization = `Bearer ${localStorage.getItem('token')}`;
        config.__isRetry = true;
        return this.instance.request(config);
    }

    private normalizeError(error: any) {
        return {
            code: error.code || 'UNKNOWN_ERROR',
            message: error.message || '未知错误',
            timestamp: Date.now(),
        };
    }

    public get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        return this.instance.get(url, config);
    }

}

// 创建实例
const http = new HttpService({
    // baseURL: import.meta.env.VITE_API_BASE,
    retry: {
        retries: 3,
        retryDelay: 1000,
    },
});

export default http;