/**
 * 限制长度的队列构造函数
 * @param maxSize 队列最大长度
 */
export class Queue<T> {
    private queue: T[] = [];
    private maxSize: number;

    constructor(maxSize: number) {
        if (maxSize <= 0) {
            throw new Error('队列最大长度必须大于0');
        }
        this.maxSize = maxSize;
    }

    /**
     * 添加元素到队列末尾
     * @param item 要添加的元素
     * @returns 添加后的队列长度
     */
    enqueue(item: T): number {
        const i = this.queue.findIndex((v) => item === v)
        if (i > -1) {
            this.queue.splice(i, 1)
        }
        // 如果队列已满，先移除第一个元素
        if (this.queue.length >= this.maxSize) {
            this.queue.shift();
        }

        this.queue.push(item);
        return this.queue.length;
    }

    /**
     * 移除并返回队列第一个元素
     * @returns 队列第一个元素，如果队列为空则返回undefined
     */
    dequeue(): T | undefined {
        return this.queue.shift();
    }

    /**
     * 获取队列当前长度
     */
    get size(): number {
        return this.queue.length;
    }

    /**
     * 检查队列是否已满
     */
    get isFull(): boolean {
        return this.queue.length >= this.maxSize;
    }

    /**
     * 检查队列是否为空
     */
    get isEmpty(): boolean {
        return this.queue.length === 0;
    }

    /**
     * 清空队列
     */
    clear(): void {
        this.queue = [];
    }

    /**
     * 获取队列中的所有元素
     */
    get items(): T[] {
        return [...this.queue];
    }

    /**
     * 获取队列第一个元素（不移除）
     */
    peekFirst(): T | undefined {
        return this.queue[0];
    }

    /**
     * 获取队列最后一个元素（不移除）
     */
    peekLast(): T | undefined {
        return this.queue[this.queue.length - 1];
    }
}