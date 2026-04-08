import { browser } from 'wxt/browser';
import { browserStorage } from "../../utils/storage";
// 监听网络请求
export const getWebRequestHeaders = () => {
    // 确保browser对象存在
    if (!browser || !browser.webRequest) {
        console.error('browser.webRequest is not available');
        return;
    }
    
    // 添加网络请求监听器
    browser.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            try {
                const { url, requestHeaders } = details;
                // console.log('%c 请求地址:', 'color:red;', url);
                const apis = [
                    `/lightads?access_token`,
                    `/light_adsets?access_token`,
                    `/light_campaigns?access_token`,
                    // `/events`,
                ];
                if (url && url.includes('facebook.com')) {
                    // 原生方法将URL参数转换为JSON并打印
                    if(!apis.some(api => url.includes(api))){
                        console.log('%c 不是广告相关接口：', 'color:red;', url);
                        return;
                    }
                    console.log('%c 广告相关接口:', 'color:yellowgreen;', url);
                    try {
                        const urlParams = new URL(url).searchParams;
                        const paramsObj: any = {};
                        urlParams.forEach((value, key) => {
                            paramsObj[key] = value;
                        });
                        console.log('%c URL参数JSON=====:', 'color:orange;', paramsObj);
                        if (paramsObj.access_token) {
                            browserStorage.set('lyRequestHeadersToken', paramsObj.access_token);
                            browserStorage.set('lyRequestHeadersUrl', url);
                        }

                    } catch (error) {
                        console.error('Error parsing URL:', error);
                    }
                    console.log('%c  请求头：', 'color:red;', requestHeaders);  
                    // 存储请求头   
                    browserStorage.get('lyRequestHeaders').then(header => {
                        // if (!header) {
                        //     browserStorage.set('lyRequestHeaders', JSON.stringify(requestHeaders));
                        // }
                    });
                }
            } catch (error) {
                console.error('Error in webRequest listener:', error);
            }
            return { requestHeaders: details.requestHeaders };
        },
        { urls: ['<all_urls>'] },
        ['requestHeaders'] // 在Manifest V3中，extraHeaders可能不需要
    );
    
    console.log('Web request listener added successfully');
}

// 监听响应头事件
export const getWebResponseHeaders = () => {
    // 确保browser对象存在
    if (!browser || !browser.webRequest) {
        console.error('browser.webRequest is not available');
        return;
    }
    
    // 添加响应头监听器
    browser.webRequest.onHeadersReceived.addListener(
        (details) => {
            try {
                const { url, responseHeaders } = details;
                if (url && (url.includes('facebook.com') || url.includes('baidu.com'))) {
                    // console.log('%c 响应地址:', 'color:green;', url);
                    // console.log('%c 响应头：', 'color:green;', responseHeaders);
                    
                    // 检查响应头中的token
                    // if (responseHeaders) {
                    //     // 在Manifest V3中，responseHeaders的格式可能不同
                    //     for (const header of responseHeaders) {
                    //         if (header.name && header.name.toLowerCase() === 'anti-csrftoken-a2z') {
                    //             console.log('%c 响应头详情:', 'font-size:25px;background:#000;color:#fff;', header.name, header.value);
                    //             if (header.value) {
                    //                 browserStorage.set('lyResponseHeadersToken', header.value);
                    //                 console.log('Token stored successfully:', header.value);
                    //             }
                    //             break;
                    //         }
                    //     }
                    // }
                }
            } catch (error) {
                console.error('Error in webResponse listener:', error);
            }
            return { responseHeaders: details.responseHeaders };
        },
        { urls: ['<all_urls>'] },
        ['responseHeaders'] // 在Manifest V3中，extraHeaders可能不需要
    );
    
    console.log('Web response listener added successfully');
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