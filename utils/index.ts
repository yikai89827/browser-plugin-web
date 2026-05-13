import { browser } from "wxt/browser";

/**
 * 通用工具（随机数、日期格式化、弹窗检测、内存测量等），供扩展与历史页面复用。
 *
 * 生成 `[min, max]` 范围内的随机整数（含边界）。
 * @param min 最小值（包含）
 * @param max 最大值（包含）
 */
export const randomIntInRange = (min:number, max:number) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    if (min > max) [min, max] = [max, min]; // 自动交换错误顺序
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** 检测扩展 Popup 是否处于打开状态（用于避免重复打开等） */
export const checkPopupOpen = async () => {
    const views = browser?.extension?.getViews({ type: 'popup' });
    return views.length > 0;
}
/**
 * 日期格式转换函数
 * @param input 支持 Date、时间戳(毫秒)、ISO字符串
 * @param separator 年月日分隔符，默认'-'
 * @param keepZero 是否保留前导零，默认true
 */
export const formatDate = (
    input: Date | number | string,
    separator: string = '-',
    keepZero: boolean = true
): string => {
    const date = new Date(input);

    // 时区安全处理
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // 自动补零逻辑
    const pad = (n: number) => keepZero ? n.toString().padStart(2, '0') : n.toString();

    return [
        year,
        pad(month),
        pad(day)
    ].join(separator);
}

// 使用示例
// console.log(formatDate(new Date())); // 2024-05-21
// console.log(formatDate(1687315200000, '/')); // 2023/06/21
// console.log(formatDate('2024-12-31T12:34:56Z', '.', false)); // 2024.12.31

/** 格式化为 UTC 日期 `YYYY-MM-DD` */
export const formatUTCDate = (input: Date | number | string) => {
    const d = new Date(input);
    return [
        d.getUTCFullYear(),
        (d.getUTCMonth() + 1).toString().padStart(2, '0'),
        d.getUTCDate().toString().padStart(2, '0')
    ].join('-');
};
/** 根据已领取/已核销数量计算核销率百分比字符串 */
export const calculateRedemptionRate = (
    redeemed: number,
    claimed: number
): string => {
    if (claimed === 0) return '0.00%';
    return `${((redeemed / claimed) * 100).toFixed(2)}%`;
}
/** `setTimeout` 的 Promise 封装，用于测试或串行等待 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** 粗略测量回调前后 JS 堆变化（仅 Chromium `performance.memory`） */
export const measureMemory = (fn: Function) => {
    performance.mark('mem-start');
    //@ts-ignore
    const startMem = performance?.memory?.usedJSHeapSize;

    // 执行内存操作
    fn && fn();

    performance.mark('mem-end');
    performance.measure('mem-usage', 'mem-start', 'mem-end');
    //@ts-ignore
    const diff = performance?.memory?.usedJSHeapSize - startMem;
    console.log(`内存增长量：${diff} bytes`);
}; 
/** 判断点击是否落在带指定 class 的节点或其祖先上（有限深度） */
export function isClickInsideTarget(event: Event, className: string): boolean {
    if (!className || !(event.target instanceof Element)) return false;

    // 从点击目标向上遍历DOM树
    let currentElement = event.target as Element;
    const MAX_DEPTH = 12; // 防止无限循环

    for (let i = 0; i < MAX_DEPTH; i++) {
        if (currentElement.classList?.contains(className)) {
            return true;
        }
        if (!currentElement.parentElement || currentElement === document.documentElement) {
            break;
        }
        currentElement = currentElement.parentElement;
    }

    return false;
}

