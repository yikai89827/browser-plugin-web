interface headerFields {
    "title": string,
    "country": string,
    "mall": string,
    "status": "优惠券状态",
    "discountType": "折扣类型",
    "discountValue": "折扣值",
    "budget": "预算",
    "couponMetrics": {
        "budgetSpent": "支出",
        "sales": "销售额",
        "clipCount": "领取数",
        "redemptionCount": "兑换数",
        "budgetUtilization": "预算利用率"
    },
    "startDate": "活动开始时间",
    "endDate": "活动结束时间",
    "couponType": "劵类型",
    "asinCount": "适用商品数",
    "saleCount": "销量",
    "activeTime": "活动时间",
    "firstSyncTime": "首次同步时间",
    "lastSyncTime": "最近同步时间",
    "remark": "备注",
    "legacyDiscountTypesSupported": ["MONEY", "PERCENT"],
    "allowedCouponTypes": ["standard", "subscribe_and_save"]
}