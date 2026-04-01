import { browser } from 'wxt/browser';
import { storage } from "@wxt-dev/storage";
//创建无边框iframe
export function createIframe(url: string, options: {
    width?: string;
    height?: string;
    parent?: HTMLElement;
},fn?:Function) {
    const iframe = document.createElement('iframe');

    // 基础配置
    iframe.src = url;
    iframe.id='iframeContentNode'
    iframe.style.width = options.width || '100%';
    iframe.style.height = options.height || '100%';
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.zIndex = '10001';
    // 添加可见的DOM元素用于调试
    const debugIndicator = document.createElement('div');
    debugIndicator.style = 'position:fixed;background:red;top:0;left:0;color:#fff;z-index:10000;padding:15px;cursor:pointer;';
    debugIndicator.innerText = '已加载';
    iframe.appendChild(debugIndicator);

    // 移除浏览器默认控件
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowtransparency', 'true');

    // 容器定位
    const container = options.parent || document.body;
    container.style.position = 'relative';
    container.appendChild(iframe);

    // 加载完成后回调
    iframe.onload = () => {
        iframe.contentWindow?.postMessage({ type: 'iframe_ready' }, '*');
        fn && fn()
    };

    return iframe;
}
// 插入元素到iframe中
export function insertToIframe(iframe: HTMLIFrameElement, elementConfig: {
    tag: string;
    styles?: Record<string, string>;
    content?: string;
}) {
    if (!iframe.contentDocument) {
        console.error('无法访问iframe文档');
        return;
    }

    const el = iframe.contentDocument.createElement(elementConfig.tag);

    if (elementConfig.styles) {
        Object.assign(el.style, elementConfig.styles);
    }

    if (elementConfig.content) {
        el.innerHTML = elementConfig.content;
    }

    iframe.contentDocument.body.appendChild(el);
    return el;
}
//iframe全局变量注入
export function setGlobalVariable(iframe: HTMLIFrameElement, varName: string, value: any) {
    console.log('[iframeVar] 开始注入:', { iframeSrc: iframe.src, varName });

    if (!iframe.contentWindow) {
        console.error('[iframeVar] 错误: iframe窗口不可访问');
        return false;
    }

    try {
        console.log('[iframeVar] 当前iframe安全策略:', iframe.sandbox);

        // 添加沙箱检测
        if (iframe.sandbox.length > 0 && !iframe.sandbox.contains('allow-same-origin')) {
            console.warn('[iframeVar] 警告: iframe缺少allow-same-origin权限');
        }

        const clonedValue = structuredClone(value);
        console.log('[iframeVar] 克隆值完成:', clonedValue);

        Object.defineProperty(iframe.contentWindow, varName, {
            value: clonedValue,
            writable: true,
            configurable: true,
            enumerable: true
        });

        console.log('[iframeVar] 注入完成，验证结果:', {
            exists: varName in iframe.contentWindow,
            value: iframe.contentWindow[varName]
        });
        return true;
    } catch (e) {
        console.error('[iframeVar] 注入失败:', e);
        return false;
    }
}
//捕获iframe控制台日志
export function captureIframeConsole(iframe?: HTMLIFrameElement) {
    if (!iframe?.contentWindow) return;

    const consoleMethods = ['log', 'warn', 'error'];

    consoleMethods.forEach(method => {
        //@ts-ignore
        const original = iframe.contentWindow!.console[method];
        //@ts-ignore
        iframe.contentWindow!.console[method] = (...args: any[]) => {
            // 发送日志到父窗口
            window.postMessage({
                type: 'IFRAME_CONSOLE',
                method,
                args: JSON.parse(JSON.stringify(args)),
                source: iframe.src
            }, '*');
            //@ts-ignore
            original.apply(iframe.contentWindow!.console, args);
        };
    });
}
// 监听iframe控制台输出
export function iframeConsole() {
    window.addEventListener('message', (event) => {
        console.log('message', event?.data?.type)
        if (event?.data?.type === 'IFRAME_CONSOLE') {
            const prefix = `[${event.data.source}]`;
            const logs = {
                log() {
                    console.log(prefix, ...event.data.args);
                },
                warn() {
                    console.warn(prefix, ...event.data.args);
                },
                error() {
                    console.error(prefix, ...event.data.args);
                }
            }
            logs[event.data.method] && logs[event.data.method]()
        }
    });
}