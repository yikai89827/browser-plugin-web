// 接口数据结构
export interface SourceItem {
    title: string;
    country: string;
    mall: string;
    couponId: string;
    status: string;
    discountType: string;
    discountValue: number;
    budget: number;
    couponMetrics: {
        budgetSpent: number;
        sales: number;
        clipCount: number;
        redemptionCount: number;
        budgetUtilization: string;
    };
    startDate: Date;
    endDate: Date;
    couponType: string;
    asinCount: number;
    saleCount: number;
    activeTime: string;
    firstSyncTime: Date;
    lastSyncTime: Date;
    remark: string;
};
//存储数据结构
export interface TargetItem {
    id: string;//当前行的key
    couponId?: string;//优惠券id
    orderId?: string;//行顺序
    title: string;//优惠券名称
    country: string;//国家
    store: string;//店铺
    status: string;//状态
    discount: string;//折扣
    budget: number;//预算
    budgetSpent: number;//支出
    clipCount: number;//领取数
    redemptionCount: number;//兑换数
    redemptionRate: string;//兑换率
    sales: number;//销售额
    saleCount: number;//销量
    activeTime: string;//活动时间
    firstSyncTime: string;//首次同步时间
    lastSyncTime: string;//最近同步时间
    remark: string;//备注
};