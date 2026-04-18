// 数据提取模块
// 负责从DOM中提取广告数据，包括编号字段

import { AdEntity, AdLevel } from './hierarchy';
// 临时定义配置，避免模块导入错误
const columnMapping: Record<string, string> = {
  campaign_id: 'campaign_id',
  adset_id: 'adset_id',
  ad_id: 'ad_id',
  name: 'name',
  impressions: 'impressions',
  reach: 'reach',
  spend: 'spend',
  clicks: 'clicks',
  registrations: 'registrations',
  purchases: 'purchases'
};

const fieldMappingConfig: Array<{ field: string; labels: string[] }> = [
  { field: 'campaign_id', labels: ['Campaign ID', '编号'] },
  { field: 'adset_id', labels: ['Ad Set ID', '编号'] },
  { field: 'ad_id', labels: ['Ad ID', '编号'] },
  { field: 'name', labels: ['Name', '名称'] },
  { field: 'impressions', labels: ['Impressions', '展示次数'] },
  { field: 'reach', labels: ['Reach', '覆盖人数'] },
  { field: 'spend', labels: ['Spend', '花费'] },
  { field: 'clicks', labels: ['Clicks', '点击次数'] },
  { field: 'registrations', labels: ['Registrations', '注册'] },
  { field: 'purchases', labels: ['Purchases', '购买'] }
];

// 列索引映射
export interface ColumnIndices {
  [key: string]: number;
}

// 数据提取结果
export interface ExtractionResult {
  entities: AdEntity[];
  columnIndices: ColumnIndices;
  level: AdLevel;
}

// 数据提取管理器
class DataExtractor {
  // 从DOM提取数据
  extractFromDom(): ExtractionResult {
    const level = this.detectCurrentLevel();
    const columnIndices = this.extractColumnIndices();
    const entities = this.extractEntities(level, columnIndices);
    
    return {
      entities,
      columnIndices,
      level
    };
  }

  // 检测当前层级
  private detectCurrentLevel(): AdLevel {
    if (typeof window === 'undefined' || !window.location) {
      return 'Campaigns';
    }

    const path = window.location.pathname;
    if (path.includes('/campaigns/')) {
      return 'Campaigns';
    } else if (path.includes('/adsets/')) {
      return 'Adsets';
    } else if (path.includes('/ads/')) {
      return 'Ads';
    }
    return 'Campaigns';
  }

  // 提取列索引
  private extractColumnIndices(): ColumnIndices {
    const result: ColumnIndices = {};
    const headerRow = document.querySelector('[role="table"] thead tr');
    
    if (headerRow) {
      const cells = Array.from(headerRow.querySelectorAll('[role="columnheader"]'));
      
      cells.forEach((cell, index) => {
        const cellId = cell?.children[0]?.children[0]?.id || '';
        const cellText = cell?.textContent?.trim().toLowerCase() || '';
        
        // 通过ID模式匹配
        for (const [field, idPattern] of Object.entries(columnMapping)) {
          if (cellId.includes(idPattern as string)) {
            result[field] = index;
            break;
          }
        }
        
        // 通过文本匹配
        if (!Object.keys(result).length) {
          for (const { field, labels } of fieldMappingConfig) {
            if (labels.some((label: string) => cellText === label.toLowerCase())) {
              result[field] = index;
              break;
            }
          }
        }
      });
    }
    
    return result;
  }

  // 提取广告实体
  private extractEntities(level: AdLevel, columnIndices: ColumnIndices): AdEntity[] {
    const entities: AdEntity[] = [];
    const tableBody = document.querySelector('[role="table"] tbody');
    
    if (tableBody) {
      const rows = Array.from(tableBody.querySelectorAll('[role="row"]'));
      
      rows.forEach((row, rowIndex) => {
        const entity = this.extractEntityFromRow(row, level, columnIndices, rowIndex);
        if (entity) {
          entities.push(entity);
        }
      });
    }
    
    return entities;
  }

  // 从行中提取广告实体
  private extractEntityFromRow(row: Element, level: AdLevel, columnIndices: ColumnIndices, rowIndex: number): AdEntity | null {
    const cells = Array.from(row.querySelectorAll('[role="gridcell"]'));
    
    // 提取编号字段（ID）
    const id = this.extractId(cells, level, columnIndices);
    if (!id) {
      return null;
    }
    
    // 提取名称
    const name = this.extractName(cells, columnIndices);
    
    // 提取数值字段
    const values = this.extractValues(cells, columnIndices);
    
    return {
      id,
      name,
      level,
      values,
      increaseValues: {}
    };
  }

  // 提取编号
  private extractId(cells: Element[], level: AdLevel, columnIndices: ColumnIndices): string {
    // 根据层级提取对应的编号
    switch (level) {
      case 'Campaigns':
        return this.extractCellValue(cells, columnIndices, 'campaign_id') || 
               this.extractCellValue(cells, columnIndices, 'id') || 
               `campaign_${Math.random().toString(36).slice(2, 9)}`;
      case 'Adsets':
        return this.extractCellValue(cells, columnIndices, 'adset_id') || 
               this.extractCellValue(cells, columnIndices, 'id') || 
               `adset_${Math.random().toString(36).slice(2, 9)}`;
      case 'Ads':
        return this.extractCellValue(cells, columnIndices, 'ad_id') || 
               this.extractCellValue(cells, columnIndices, 'id') || 
               `ad_${Math.random().toString(36).slice(2, 9)}`;
      default:
        return `entity_${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  // 提取名称
  private extractName(cells: Element[], columnIndices: ColumnIndices): string {
    return this.extractCellValue(cells, columnIndices, 'name') || 'Unknown';
  }

  // 提取数值字段
  private extractValues(cells: Element[], columnIndices: ColumnIndices): Record<string, number> {
    const values: Record<string, number> = {};
    
    const numericFields = [
      'impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'
    ];
    
    numericFields.forEach(field => {
      const value = this.extractCellValue(cells, columnIndices, field);
      if (value) {
        // 清理数值，去除货币符号和逗号
        const cleanedValue = value.replace(/[\$,]/g, '');
        const numValue = parseFloat(cleanedValue);
        if (!isNaN(numValue)) {
          values[field] = numValue;
        }
      }
    });
    
    return values;
  }

  // 提取单元格值
  private extractCellValue(cells: Element[], columnIndices: ColumnIndices, field: string): string {
    const index = columnIndices[field];
    if (index !== undefined && cells[index]) {
      return cells[index].textContent?.trim() || '';
    }
    return '';
  }
}

export const dataExtractor = new DataExtractor();
