// 配置模块
// 存储列映射和字段映射配置

// 列映射配置 - 表头ID到字段名的映射
export const columnMapping = {
  name: 'reporting_table_column_name',//广告名称
  impressions: 'reporting_table_column_impressions',//展示次数
  reach: 'reporting_table_column_reach',//覆盖人数
  spend: 'reporting_table_column_spend',//已花费金额
  clicks: 'reporting_table_column_clicks',//点击量（全部）
  campaign_id: 'reporting_table_column_campaign_group_id',//广告系列编号
  adset_id: 'reporting_table_column_campaign_id',//广告组编号
  ad_id: 'reporting_table_column_adgroup_id',//广告编号
  purchases: 'reporting_table_column_actions:omni_purchase',//购物次数
  purchase_cost: 'reporting_table_column_cost_per_action_type:omni_purchase',//单次购物费用
  results: 'ads_manager_table_results_column_label_id',//成效
  costPerResult: 'reporting_table_column_cost_per_result',//单次成效费用
  registrations: 'reporting_table_column_actions:omni_complete_registration',//完成注册次数
  registration_cost: 'reporting_table_column_cost_per_action_type:omni_complete_registration',//单次完成注册费用
};

// 字段映射配置 - 用于表头文本到字段名的映射
export const fieldMappingConfig = [
  { field: 'name', labels: ['campaign', '广告系列', 'ad set', '广告组', 'ad', '广告'] },
  { field: 'spend', labels: ['amount spent', '已花费金额'] },
  { field: 'impressions', labels: ['impressions', '展示次数'] },
  { field: 'reach', labels: ['reach', '覆盖人数'] },
  { field: 'clicks', labels: ['clicks(all)', '点击量（全部）'] },
  { field: 'campaign_id', labels: ['campaign id', '广告系列编号'] },
  { field: 'adset_id', labels: ['ad set id', '广告组编号'] },
  { field: 'ad_id', labels: ['ad id', '广告编号'] },
  { field: 'results', labels: ['results', '成效'] },
  { field: 'costPerResult', labels: ['cost per result', '单次成效费用'] },
  { field: 'purchases', labels: ['purchases', '购物次数'] },
  { field: 'purchase_cost', labels: ['purchase cost', '单次购物费用'] },
  { field: 'registrations', labels: ['registrations completed', '完成注册次数'] },
  { field: 'registration_cost', labels: ['registration cost', '单次完成注册费用'] },
];

// 非数值字段（不参与数值计算的字段）
export const nonNumericFields = ['name', 'campaign_id', 'adset_id', 'ad_id'];

// 数值字段（参与数值计算的字段）
export const numericFields = Object.keys(columnMapping).filter(field => !nonNumericFields.includes(field));

// 应用配置
export const appConfig = {
  // 防抖时间（毫秒）
  debounceTime: 300,
  // 同步延迟时间（毫秒）
  syncDelay: 500,
  // 最大重连尝试次数
  maxReconnectAttempts: 3,
  // 缓存键前缀
  cacheKeyPrefix: 'browser-plugin-v3',
};
// 过滤名称文本，去除多余的按钮文本
export const filterTexts = [
  '复制',
  '编辑',
  '删除',
  '查看',
  '设置',
  '更多',
  '打开',
  '下拉',
  '菜单',
  '图表'
];
