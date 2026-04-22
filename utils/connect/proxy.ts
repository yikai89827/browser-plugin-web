import { browser } from 'wxt/browser';
import { browserStorage } from "../../utils/storage";

// 存储自定义排序的id数组
let customSortIds: string[] | null = null;

// 设置自定义排序的id数组
export const setCustomSortIds = (ids: string[]) => {
    customSortIds = ids;
    console.log('Custom sort ids set:', customSortIds);
    
    // 将排序信息存储到localStorage，以便内容脚本可以访问
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('customSortIds', JSON.stringify(ids));
    }
    
    // 通知所有标签页更新排序
    browser.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.id) {
                browser.tabs.sendMessage(tab.id, { action: 'updateSortIds', ids }).catch(() => {
                    // 忽略无法发送消息的标签页
                });
            }
        });
    });
};

// 获取自定义排序的id数组
export const getCustomSortIds = (): string[] | null => {
    return customSortIds;
};

// 清除自定义排序
export const clearCustomSortIds = () => {
    customSortIds = null;
    console.log('Custom sort ids cleared');
    
    // 从localStorage中清除排序信息
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('customSortIds');
    }
    
    // 通知所有标签页清除排序
    browser.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.id) {
                browser.tabs.sendMessage(tab.id, { action: 'clearSortIds' }).catch(() => {
                    // 忽略无法发送消息的标签页
                });
            }
        });
    });
};

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
                const { url, method , } = details;
                console.log('%c 请求地址:', 'color:red;', url, method );
                const apis = [
                    `/lightads?access_token`,
                    `/light_adsets?access_token`,
                    `/light_campaigns?access_token`,
                    // `/events`,
                ];
                if (url && url.includes('facebook.com')) {
                    // 原生方法将URL参数转换为JSON并打印
                    if(!apis.some(api => url.includes(api))){
                        // console.log('%c 不是广告相关接口：', 'color:red;', url);
                        return;
                    }
                    const path = url.split('?access_token=')[0];
                    console.log('%c 广告相关接口:', 'color:yellowgreen;', path,);
                    try {
                        const urlParams = new URL(url).searchParams;
                        const paramsObj: any = {};
                        urlParams.forEach((value, key) => {
                            paramsObj[key] = value;
                        });
                        // const testUrl = `https://adsmanager-graph.facebook.com/v22.0/act_940870165585058/light_adsets?access_token=EAABsbCS1iHgBRCIxV1jE1P56KCb8XBcHrq8PdxRMuZB9Scmfb8qjTa6KoXHaY0HZCo4J7TR0UdZBQiIvCd5hNs8h2i2MZCeclaXCq9qx73QGXGI0MV23C1WhUwmhui2bqpI4PIAZC2BQSAI9Ml3LeeHZBWW0By6RUFNYxH07Nl3nyU6ba1tfzHBxKqYD5v8nxEN5ZCWmE5MfP9nugZDZD&__aaid=940870165585058&__activeScenarioIDs=%5B%5D&__activeScenarios=%5B%5D&__entryPointPreloaded=1&__interactionsMetadata=%5B%5D&_callFlowletID=5680&_reqName=adaccount%2Flight_adsets&_reqSrc=AdsManagerDataLoadingSortEntryPoint&_sessionID=27d490e6abbdaec4&_triggerFlowletID=5681&ad_draft_id=957736656941949&fields=id&filtering=%5B%5D&include_headers=false&limit=200&locale=en_GB&method=get&pretty=0&sort=%5B%22cost_per_result_ascending%22%5D&summary=true&suppress_http_code=1&time_range=%7B%22since%22%3A%222026-03-31%22%2C%22until%22%3A%222026-04-03%22%7D&xref=f247202ee34b9c00c&qpl_active_e2e_trace_ids=&access_token=EAABsbCS1iHgBRCIxV1jE1P56KCb8XBcHrq8PdxRMuZB9Scmfb8qjTa6KoXHaY0HZCo4J7TR0UdZBQiIvCd5hNs8h2i2MZCeclaXCq9qx73QGXGI0MV23C1WhUwmhui2bqpI4PIAZC2BQSAI9Ml3LeeHZBWW0By6RUFNYxH07Nl3nyU6ba1tfzHBxKqYD5v8nxEN5ZCWmE5MfP9nugZDZD&fields=id,name,status,campaign_id,adset_id,impressions,reach,spend,results,cost_per_result&limit=200`
                        // console.log('%c 测试URL:', 'color:red;', testUrl.split('?access_token=')[0]);
                        console.log('%c URL参数JSON=====:', 'color:orange;', paramsObj);
                        if (paramsObj.access_token) {
                            browserStorage.set('lyRequestHeadersToken', paramsObj.access_token);
                            browserStorage.set('lyRequestHeadersUrl', url.split('?access_token=')[0]);
                        }

                    } catch (error) {
                        console.error('Error parsing URL:', error);
                    }
                    // console.log('%c  请求头：', 'color:red;', requestHeaders);  
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
                const { url, method  } = details;
                if (url && (url.includes('facebook.com') || url.includes('baidu.com'))) {
                    console.log('%c 响应地址:', 'color:green;', url, method );
                    console.log('%c details:', 'color:green;', details);
                    
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
// 处理API响应的排序
export const processApiResponse = (response: any): any => {
    // 检查是否有自定义排序ID
    let sortIds = customSortIds;
    
    // 如果没有，尝试从localStorage获取
    if (!sortIds && typeof localStorage !== 'undefined') {
        const storedIds = localStorage.getItem('customSortIds');
        if (storedIds) {
            try {
                sortIds = JSON.parse(storedIds);
            } catch (error) {
                console.error('Error parsing stored sort ids:', error);
            }
        }
    }
    
    // 如果有自定义排序ID，且响应格式正确
    if (sortIds && response && Array.isArray(response.data)) {
        console.log('Processing API response with custom sort:', sortIds,response.data);
        
        // 根据customSortIds重新排序
        const sortedData = sortIds
            .map(id => response.data.find((item: any) => item.id === id))
            .filter(Boolean); // 过滤掉未找到的项
        
        console.log('Original data length:', response.data.length);
        console.log('Sorted data length:', sortedData.length);
        
        // 创建修改后的响应
        return {
            ...response,
            data: sortedData
        };
    }
    
    // 如果没有自定义排序，返回原始响应
    return response;
};

// 处理API请求并返回修改后的响应
async function handleApiRequest(url: string): Promise<{ redirectUrl?: string } | undefined> {
    try {
        console.log('Intercepting API request:', url);
        
        // 检查是否有自定义排序ID
        let sortIds = customSortIds;
        
        // 如果没有，尝试从localStorage获取
        if (!sortIds && typeof localStorage !== 'undefined') {
            const storedIds = localStorage.getItem('customSortIds');
            if (storedIds) {
                try {
                    sortIds = JSON.parse(storedIds);
                } catch (error) {
                    console.error('Error parsing stored sort ids:', error);
                }
            }
        }
        
        // 如果有自定义排序ID，才拦截请求
        if (sortIds && sortIds.length > 0) {
            console.log('Custom sort ids found, processing response:', sortIds.length);
            
            // 发送请求获取原始响应
            const response = await fetch(url);
            const originalData = await response.json();
            
            // 检查响应格式
            if (originalData && Array.isArray(originalData.data)) {
                console.log('Original response data:', originalData.data);
                
                // 根据customSortIds重新排序
                const sortedData = sortIds
                    .map(id => originalData.data.find((item: any) => item.id === id))
                    .filter(Boolean); // 过滤掉未找到的项
                
                console.log('Sorted response data:', sortedData);
                
                // 创建修改后的响应
                const modifiedData = {
                    ...originalData,
                    data: sortedData
                };
                
                // 将修改后的数据转换为字符串
                const modifiedDataStr = JSON.stringify(modifiedData);
                
                // 创建一个Blob对象
                const blob = new Blob([modifiedDataStr], { type: 'application/json' });
                
                // 创建一个URL对象
                const blobUrl = URL.createObjectURL(blob);
                
                // 返回修改后的请求
                return {
                    redirectUrl: blobUrl
                };
            }
        }
    } catch (error) {
        console.error('Error intercepting API response:', error);
    }
    
    // 如果没有修改，返回undefined
    return undefined;
}

// 拦截并修改API响应
export const interceptApiRequests = () => {
    // 确保browser对象存在
    if (!browser || !browser.webRequest) {
        console.error('browser.webRequest is not available');
        return;
    }
    
    // 要拦截的API路径
    const apiPaths = [
        '/lightads?access_token',
        '/light_adsets?access_token',
        '/light_campaigns?access_token'
    ];
    
    // 添加请求拦截器
    browser.webRequest.onBeforeRequest.addListener(
        (details) => {
            try {
                const { url, method } = details;
                
                // 检查是否是要拦截的API
                const isTargetApi = apiPaths.some(api => url.includes(api));
                
                if (isTargetApi && method === 'GET') {
                    return handleApiRequest(url);
                }
            } catch (error) {
                console.error('Error in API request interceptor:', error);
            }
            
            // 如果没有修改，返回原始请求
            return {};
        },
        { urls: ['<all_urls>'] },
        ['blocking']
    );
    
    console.log('API request interceptor added successfully');
};

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