export interface DBItem {
    id: string//当前行的key
    orderId: number//行顺序
    couponName: string//优惠券名称
    country: string//国家
    store: string//店铺
    status: string//状态
    discount: string//折扣
    budget: number//预算
    expenditure: string//支出
    claimedCount: number//领取数
    redeemedCount: number//兑换数
    redemptionRate: number//兑换率
    sales: number//销售额
    volume: number//销量
    activePeriod: string//活动时间
    firstSyncTime: string//首次同步时间
    lastSyncTime: string//最近同步时间
    remark: string //备注
}
export interface DBRowInfo {
    id: string //当前页的key,
    conutry: string //国家名称,
    lastSyncTime: string //上次同步时间,
    page: number //当前页码，
    rows: number //一页多少行数据，默认25条一页
    list: DBItem[]//优惠券数据列表   
}
export interface DBOptions {
    name: string;// 数据库名称
    version: number;// 数据库版本
    storeName: string;// 表名
    data?: Array<DBRowInfo>;//数据
}