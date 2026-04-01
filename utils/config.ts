//亚马逊各个国家站点地址
export const siteArray = [
    // 北美地区
    ['US', 'https://www.amazon.com', '美国'],
    ['CA', 'https://www.amazon.ca', '加拿大'],
    ['MX', 'https://www.amazon.com.mx', '墨西哥'],
    ['BR', 'https://www.amazon.com.br', '巴西'],

    // 欧洲地区
    ['UK', 'https://www.amazon.co.uk', '英国'],
    ['DE', 'https://www.amazon.de', '德国'],
    ['ES', 'https://www.amazon.es', '西班牙'],
    ['IT', 'https://www.amazon.it', '意大利'],
    ['FR', 'https://www.amazon.fr', '法国'],
    ['NL', 'https://www.amazon.nl', '荷兰'],
    ['SE', 'https://www.amazon.se', '瑞典'],
    ['IN', 'https://www.amazon.in', '印度'],
    ['AE', 'https://www.amazon.ae', '阿联酋'],
    ['SA', 'https://www.amazon.sa', '沙特阿拉伯'],
    ['PL', 'https://www.amazon.pl', '波兰'],
    ['TR', 'https://www.amazon.com.tr', '土耳其'],
    ['BE', 'https://www.amazon.com.be', '比利时'],
    ['IE', 'https://www.amazon.ie', '爱尔兰'],
    ['EG', 'https://www.amazon.eg', '埃及'],

    // 远东地区
    ['SG', 'https://www.amazon.sg', '新加坡'],
    ['JP', 'https://www.amazon.co.jp', '日本'],
    ['AU', 'https://www.amazon.com.au', '澳大利亚']
];
//各国家站点id
export const MarketplaceObj = {
    BR: 'A2Q3Y263D00KWC',
    CA: 'A2EUQ1WTGCTBG2',
    MX: 'A1AM78C64UM0Y8',
    US: 'ATVPDKIKX0DER',
    AE: 'A2VIGQ35RCS4UG',
    DE: 'A1PA6795UKMFR9',
    EG: 'ARBP9OOSHTCHU',
    ES: 'A1RKKUPIHCS9HS',
    FR: 'A13V1IB3VIYZZH',
    UK: 'A1F83G8C2ARO7P',
    GB: 'A1F83G8C2ARO7P',
    IN: 'A21TJRUUN4KGV',
    IT: 'APJ6JRA9NG5V4',
    NL: 'A1805IZSGTT6HS',
    SA: 'A17E79C6D8DWNP',
    TR: 'A33AVAJ2PDY3EV',
    SG: 'A19VAU5U5O7RUS',
    AU: 'A39IBJ37TRP1C6',
    JP: 'A1VC38T7YXB528',
    SE: 'A2NODRKZP88ZB9',
    PL: 'A1C3SOZRARQ6R3',
    BE: 'AMEN7PMS3EDWL',
    IE: 'A28R8C7NBKEWEA'
}
//通过id查询国家地址尾缀
export const codeToSiteMap = {
    A2Q3Y263D00KWC: 'BR',
    A2EUQ1WTGCTBG2: 'CA',
    A1AM78C64UM0Y8: 'MX',
    ATVPDKIKX0DER: 'US',
    A2VIGQ35RCS4UG: 'AE',
    A1PA6795UKMFR9: 'DE',
    ARBP9OOSHTCHU: 'EG',
    A1RKKUPIHCS9HS: 'ES',
    A13V1IB3VIYZZH: 'FR',
    A1F83G8C2ARO7P: 'UK',
    A21TJRUUN4KGV: 'IN',
    APJ6JRA9NG5V4: 'IT',
    A1805IZSGTT6HS: 'NL',
    A17E79C6D8DWNP: 'SA',
    A33AVAJ2PDY3EV: 'TR',
    A19VAU5U5O7RUS: 'SG',
    A39IBJ37TRP1C6: 'AU',
    A1VC38T7YXB528: 'JP',
    A2NODRKZP88ZB9: 'SE',
    A1C3SOZRARQ6R3: 'PL',
    AMEN7PMS3EDWL: 'BE',
    A28R8C7NBKEWEA: 'IE'
}
//通过国家地址尾缀查询国家code
export const codeToCountryId = {
    'US': 1,
    'CA': 2,
    'MX': 3,
    'UK': 4,
    'DE': 5,
    'FR': 6,
    'IT': 7,
    'ES': 8,
    'IN': 9,
    'JP': 10,
    'AU': 12,
    'AE': 13,
    'SG': 14,
    'NL': 15,
    'SA': 16,
    'BR': 17,
    'SE': 18,
    'PL': 19,
    'TR': 20,
    'BE': 21,
    'IE': 22,
    'EG': 23
}
//优惠券字段对照信息
export const fields = {
    title: "优惠券名称",
    country: "国家",
    mall: "店铺",
    status: "优惠券状态",
    discountType: "折扣类型",
    discountValue: "折扣值",
    budget: "预算",
    couponMetrics: {
        budgetSpent: "支出",
        sales: "销售额",
        clipCount: "领取数",
        redemptionCount: "兑换数",
        budgetUtilization: "预算利用率"
    },
    startDate: "活动开始时间",
    endDate: "活动结束时间",
    couponType: "劵类型",
    asinCount: "适用商品数",
    saleCount: "销量",
    activeTime: "活动时间",
    firstSyncTime: "首次同步时间",
    lastSyncTime: "最近同步时间",
    remark: "备注",
}
//折扣类型
export const legacyDiscountTypesSupported = ["MONEY", "PERCENT"]
//支持的优惠券类型
export const allowedCouponTypes = ["standard", "subscribe_and_save"]