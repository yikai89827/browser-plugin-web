

// 拦截fetch请求并修改响应
export function interceptFetch() {
    const originalFetch = window.fetch;
    const originalXmlHttpRequest = window.XMLHttpRequest;
    
    window.fetch = async function(...args: Parameters<typeof fetch>) {
        const [url, options] = args;
        
        // 要拦截的API路径
        const apiPaths = [
            '/lightads?access_token',
            '/light_adsets?access_token',
            '/light_campaigns?access_token'
        ];
        
        // 检查是否是要拦截的API
        const isTargetApi = apiPaths.some(api => typeof url === 'string' && url.includes(api));
        
        if (isTargetApi) {
            console.log('Intercepting fetch request:', url);
            
            try {
                // 发送原始请求
                const response = await originalFetch(...args);
                
                // 克隆响应以便可以多次读取
                const clonedResponse = response.clone();
                
                // 获取响应数据
                const originalData = await clonedResponse.json();
                
                // 检查是否有自定义排序ID
                let sortIds: string[] | null = null;
                const storedIds = localStorage.getItem('customSortIds');
                if (storedIds) {
                    try {
                        sortIds = JSON.parse(storedIds);
                    } catch (error) {
                        console.error('Error parsing stored sort ids:', error);
                    }
                }
                
                // 如果有自定义排序ID，修改响应
                if (sortIds && sortIds.length > 0 && originalData && Array.isArray(originalData.data)) {
                    console.log('Custom sort ids found, processing response:', sortIds.length);
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
                    
                    // 创建新的响应
                    return new Response(JSON.stringify(modifiedData), {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }
                console.log('No custom sort ids found, returning original response',originalData.data);
                // 如果没有修改，返回原始响应
                return response;
            } catch (error) {
                console.error('Error intercepting fetch response:', error);
                // 如果出错，返回原始请求
                return originalFetch(...args);
            }
        }
        
        // 如果不是目标API，返回原始请求
        return originalFetch(...args);
    };
    // 重写XMLHttpRequest构造函数以拦截响应
    window.XMLHttpRequest = function() {
        const xhr = new originalXmlHttpRequest();
        const originalOpen = xhr.open;
        const originalSend = xhr.send;
        
        // 保存请求信息
        let requestUrl: string = '';
        let requestMethod: string = '';
        
        // 重写open方法以捕获请求信息
        xhr.open = function(method: string, url: string | URL, ...args: any[]) {
            requestUrl = typeof url === 'string' ? url : url.toString();
            requestMethod = method;
            return originalOpen.call(this, method, url, ...args);
        };
        
        // 重写send方法以拦截响应
        xhr.send = function(...args: any[]) {
            // 要拦截的API路径
            const apiPaths = [
                '/lightads?access_token',
                '/light_adsets?access_token',
                '/light_campaigns?access_token'
            ];
            
            // 检查是否是要拦截的API
            const isTargetApi = apiPaths.some(api => requestUrl.includes(api));
            
            if (isTargetApi && requestMethod === 'GET') {
                console.log('Intercepting XMLHttpRequest:', requestUrl);
                
                // 保存原始的onreadystatechange
                const originalOnreadystatechange = xhr.onreadystatechange;
                
                // 重写onreadystatechange以修改响应
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        try {
                            // 解析响应数据
                            const originalData = JSON.parse(xhr.responseText);
                            
                            // 检查是否有自定义排序ID
                            let sortIds: string[] | null = null;
                            const storedIds = localStorage.getItem('customSortIds');
                            if (storedIds) {
                                try {
                                    sortIds = JSON.parse(storedIds);
                                } catch (error) {
                                    console.error('Error parsing stored sort ids:', error);
                                }
                            }
                            console.log('originalData:', originalData);
                            // 如果有自定义排序ID，修改响应
                            if (sortIds && sortIds.length > 0 && originalData && Array.isArray(originalData.data)) {
                                console.log('Custom sort ids found, processing XMLHttpRequest response:', sortIds.length);
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
                                
                                // 重写responseText和response属性
                                Object.defineProperty(xhr, 'responseText', {
                                    value: JSON.stringify(modifiedData),
                                    writable: false
                                });
                                
                                Object.defineProperty(xhr, 'response', {
                                    value: modifiedData,
                                    writable: false
                                });
                            }
                        } catch (error) {
                            console.error('Error intercepting XMLHttpRequest response:', error);
                        }
                    }
                    
                    // 调用原始的onreadystatechange
                    if (typeof originalOnreadystatechange === 'function') {
                        originalOnreadystatechange.call(this);
                    }
                };
            }
            
            return originalSend.call(this, ...args);
        };
        
        return xhr;
    };
    
    // 复制原始XMLHttpRequest的静态属性和方法
    Object.assign(window.XMLHttpRequest, originalXmlHttpRequest);
}

// 处理更新排序的消息
function handleUpdateSortIds(request: any, sender: any, sendResponse: any) {
    const { action, ids } = request;
    
    if (action === 'updateSortIds') {
        console.log('Updating sort ids:', ids);
        localStorage.setItem('customSortIds', JSON.stringify(ids));
        sendResponse({ success: true });
        return true;
    }
    
    if (action === 'clearSortIds') {
        console.log('Clearing sort ids');
        localStorage.removeItem('customSortIds');
        sendResponse({ success: true });
        return true;
    }
    
    return false;
}

// 初始化content script
function initContentScript() {
    console.log('Content script initialized');
    
    // 拦截fetch请求
    interceptFetch();
    
    // 监听来自popup的消息
    // browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    //     const { action } = request;
        
    //     // 首先处理更新排序的消息
    //     if (action === 'updateSortIds' || action === 'clearSortIds') {
    //         return handleUpdateSortIds(request, sender, sendResponse);
    //     }
        
    //     // 然后处理其他消息
    //     if (action && messageHandlers[action]) {
    //         return messageHandlers[action](request, sender, sendResponse);
    //     }
        
    //     return false;
    // });
}

// 启动content script
// initContentScript();
