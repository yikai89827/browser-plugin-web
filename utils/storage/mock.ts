import { faker } from '@faker-js/faker';
// import { v4 as uuid } from 'uuid';
import { formatDate } from '../index';
/**
 * 优惠券明细数据项
 */
interface CouponItem {
    /** country_page */
    id: string;
    /** 订单流水号，格式：ORDER_年月日+6位序列号 */
    orderId: string;
    /** 优惠券展示名称（最多50字符） */
    couponName: string;
    /** 国家代码，ISO 3166-1 alpha-2标准 */
    country: string;
    /** 店铺名称（关联店铺表） */
    store: string;
    /** 活动状态 */
    status: '进行中' | '已结束' | '未开始';
    /** 折扣力度，示例：'30% OFF' */
    discount: string;
    /** 总预算（单位：美元，精度0.01） */
    budget: number;
    /** 已支出金额（单位：美元，精度0.01） */
    expenditure: number;
    /** 领取次数（>=0） */
    claimedCount: number;
    /** 核销次数（<=领取次数） */
    redeemedCount: number;
    /** 核销率计算公式：核销次数/领取次数 */
    redemptionRate: string;
    /** 带来的销售额（单位：美元） */
    sales: number;
    /** 商品销量（整数） */
    volume: number;
    /** 活动周期（年-月-日格式） */
    activePeriod: string;
    /** 首次同步时间（系统自动记录） */
    firstSyncTime: string;
    /** 最后同步时间（年-月-日格式） */
    lastSyncTime: string;
    /** 运营备注（可选，最多200字符） */
    remark?: string;
}

/**
 * 优惠券列表响应数据结构
 */
interface CouponListResponse {
    /** 当前页唯一标识（UUID） */
    id: string;
    /** 当前查询的国家代码 */
    country: string;
    /** 上次同步时间（年-月-日 HH:mm:ss格式） */
    lastSyncTime: string;
    /** 当前页码（从1开始） */
    page: number;
    /** 每页数据量（默认25，最大100） */
    rows: number;
    /** 总数据量（用于分页计算） */
    total: number;
    /** 当前页数据列表 */
    list: CouponItem[];
}

export const mockCouponData = (page: number = 1, rows: number = 25): CouponListResponse => {
    const country = faker.location.country();
    const now = new Date();
    // const id = uuid()
    return {
        id: country+'_'+page,
        country,
        lastSyncTime: formatDate(now),
        page,
        rows,
        // unique: faker.datatype.boolean(),
        total: rows * 10, // 模拟总数据量
        list: Array.from({ length: rows }, (_, index) => ({
            id: country + '_' + page,
            orderId: `ORDER_${(page - 1) * rows + index + 1}`,
            couponName: faker.commerce.productName(),
            country,
            store: faker.company.name(),
            status: faker.helpers.arrayElement(['进行中', '已结束', '未开始']),
            discount: `${faker.number.int({ min: 5, max: 50 })}%`,
            budget: faker.number.float({ min: 1000, max: 100000, fractionDigits: 2 }),
            expenditure: faker.number.float({ min: 0, max: 10000, fractionDigits: 2 }),
            claimedCount: faker.number.int(1000),
            redeemedCount: faker.number.int(500),
            redemptionRate: `${faker.number.float({ min: 0, max: 1, fractionDigits: 2 })}%`,
            sales: faker.number.float({ min: 0, max: 50000, fractionDigits: 2 }),
            volume: faker.number.int(10000),
            activePeriod: `${formatDate(faker.date.recent({ days: 30 }).toISOString()?.slice(0, 10))} ~ ${formatDate(faker.date.soon({ days: 30 }).toISOString()?.slice(0, 10))}`,
            firstSyncTime: formatDate(faker.date.between({ from: '2024-01-01', to: now })),
            lastSyncTime: formatDate(faker.date.between({ from: '2024-05-01', to: now })),
            remark: faker.datatype.boolean() ? faker.lorem.sentence() : undefined
        }))
    };
}

// // 使用示例
// const dataPage1 = mockCouponData(1, 25);
// const dataPage2 = mockCouponData(2, 25);
// console.log('dataPage1, dataPage2', dataPage1, dataPage2)
