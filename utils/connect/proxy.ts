import { browser } from 'wxt/browser';
import { browserStorage } from "../../utils/storage";
// 监听网络请求
export const getWebRequestHeaders = () => {
    browser?.webRequest?.onBeforeSendHeaders?.addListener(
        //@ts-ignore
        async (details) => {
            try {
                const { url, requestHeaders }: any = details
                if (url?.includes('facebook.com')) {
                    console.log('%c 请求地址=====:', 'color:red;', url);
                    // 原生方法将URL参数转换为JSON并打印
                    const urlParams = new URL(url)?.searchParams || {};
                    const paramsObj: any = {};
                    urlParams.forEach((value, key) => {
                        paramsObj[key] = value;
                    });
                    console.log('%c URL参数JSON=====:', 'color:blue;', paramsObj);
                    console.log('%c  请求头：', 'color:red;', requestHeaders);
                    const header = await browserStorage.get('lyRequestHeaders')
                    // if (!header) {
                    //     browserStorage.set('lyRequestHeaders', JSON.stringify(requestHeaders))
                    // }
                    // if (url.includes('/ap/signin') || url.includes('/ap/mfa')){//验证码或者登录页面
                    //     browserStorage.set('lyFacebookVerifycodePage', '1')
                    // }else {//已登录
                    //     browserStorage.set('lyFacebookVerifycodePage', '')
                    // }
                }
                // @ts-ignore
                // const apiUrl = import.meta?.env?.WXT_COUPON_API_URL || '/coupons/api/getCouponPromotions'
                // if (url?.includes(apiUrl)) {
                //     console.log('%c  请求头=====：', 'color:red;', requestHeaders);
                //     browserStorage.set('lyRequestHeaders', JSON.stringify(requestHeaders))
                //     requestHeaders?.forEach(el => {
                //         console.log('%c 请求头=====：', 'color:red;', el?.name + '========' + el?.value);
                //     });
                // }
            } catch (error) {
                console.error(error)
            }
            return details;
        },
        { urls: ['<all_urls>'] },
        ['requestHeaders', 'extraHeaders']
    );
}

// 监听响应头事件
export const getWebResponseHeaders = () => {
    browser?.webRequest?.onHeadersReceived.addListener(
        (details) => {
            try {
                // const { url, responseHeaders }: any = details
                // if (url?.includes('/sugrec')){
                    // console.log('%c 响应头：', 'color:green;', responseHeaders);
                // }
                // if (url?.includes('sellercentral.Facebook') || url?.includes('baidu.com')||url?.includes('facebook.com')) {
                    // console.log('%c 响应头：', 'color:green;', responseHeaders);
                    // responseHeaders?.forEach(el => {
                    //     // console.log('%c 响应头：', 'color:green;', el?.name + '========' + el?.value);
                    //     if (el?.name?.toLowerCase() === 'anti-csrftoken-a2z') {
                    //         console.log('%c 响应头详情:', 'font-size:25px;background:#000;color:#fff;', el?.name, el?.value);
                    //         if (el?.value) {
                    //             browserStorage.set('lyResponseHeadersToken', el?.value)
                    //         }
                    //     }
                    // });
                    // console.log('%c 响应地址:', 'color:green;', url);
                // }
            } catch (error) {
                console.error(error)
            }
            return details;
        },
        { urls: ['<all_urls>'] },
        ['responseHeaders', 'extraHeaders']
    );
}
//设置网络代理
export const setProxy = () => {
    // location.origin + '/coupons/api/getCouponPromotions?paginationSize=25&paginationSkip=0'
    // 代理配置
    // const proxyConfig = {
    //     mode: 'fixed_servers',
    //     rules: {
    //         proxyForHttp: {
    //             scheme: 'http',
    //             mode: 'direct',
    //             host: '127.0.0.1',
    //             port: 32890,
    //             bypassList: ['localhost']
    //         },
    //         proxyForHttps: {
    //             scheme: 'https',
    //             host: '127.0.0.1',
    //             mode: 'direct',
    //             port: 32890,
    //             bypassList: ['localhost']
    //         }
    //     }
    // };
    // browser.proxy?.settings?.set({
    //     value: {
    //         mode: "fixed_servers",
    //         rules: {
    //             singleProxy: {
    //                 scheme: "http",
    //                 host:'127.0.0.1',
    //                 port: 32890
    //             }
    //         }
    //     }, scope: "regular"
    // }, () => {
    //     console.log("代理已启用:", browser.runtime?.lastError?.message);
    //     if (browser.runtime.lastError) {
    //         console.error('代理设置失败:', browser.runtime.lastError);
    //     } else {
    //         const proxyAddress = `http://192.168.110.106:32890`;
    //         console.log('当前代理地址:', proxyAddress);
    //         // browser.storage.local.set({ proxy: proxyAddress }); // 存储配置
    //     }
    // });
    // // 设置代理并打印配置
    // browser.proxy?.settings?.set({
    //     value: proxyConfig,
    //     scope: 'regular'
    // }, () => {
    //     console.log('当前代理配置：', proxyConfig);
    //     browser.proxy.settings.get({}, (config) => {
    //         console.log('实际生效配置：', config.value);
    //     });
    // });

    // browser.proxy?.settings?.set({
    //     value: {
    //         mode: "fixed_servers",
    //         rules: {
    //             singleProxy: {
    //                 scheme: "https",
    //                 host,
    //                 port: 7890
    //             }
    //         }
    //     }, scope: "regular"
    // }, () => {
    //     console.log("代理已启用:", browser.runtime?.lastError?.message);
    //     if (browser.runtime.lastError) {
    //         console.error('代理设置失败:', browser.runtime.lastError);
    //     } else {
    //         const proxyAddress = `http://192.168.1.100:8080`;
    //         console.log('当前代理地址:', proxyAddress);
    //         // browser.storage.local.set({ proxy: proxyAddress }); // 存储配置
    //     }
    // });
    // browser.proxy.settings.get({}, (config) => {
    //     if (config.value.mode === 'fixed_servers') {
    //         const { host, port } = config.value.rules.singleProxy;
    //         console.log('当前生效代理:', `${host}:${port}`);
    //     }
    // });
}