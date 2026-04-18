// 数据提取模块
// 负责从DOM中提取广告数据，包括编号字段

import { AdEntity, AdLevel } from './hierarchy';
import {  numericFields } from './config';
import { getTableDataRows, findTableContainer, getColumnIndicesSync } from './dom';

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
    // 使用dom.ts中的函数获取列索引
    const columnIndices = getColumnIndicesSync();
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
    // 分割路径并获取最后一部分
    const pathParts = path.split('/').filter(part => part.trim() !== '');
    const lastPart = pathParts[pathParts.length - 1];
    
    if (lastPart === 'campaigns') {
      return 'Campaigns';
    } else if (lastPart === 'adsets') {
      return 'Adsets';
    } else if (lastPart === 'ads') {
      return 'Ads';
    }
    return 'Campaigns';
  }

  // 提取广告实体
  private extractEntities(level: AdLevel, columnIndices: ColumnIndices): AdEntity[] {
    const entities: AdEntity[] = [];
    
    // 使用dom.ts中的函数找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.warn('extractEntities: 未找到表格容器');
      return entities;
    }
    
    // 使用dom.ts中的函数获取表格数据行
    const rowPairs = getTableDataRows(tableContainer);
    
    rowPairs.forEach((rowPair, rowIndex) => {
      const entity = this.extractEntityFromRowPair(rowPair, level, columnIndices, rowIndex);
      if (entity) {
        entities.push(entity);
      }
    });
    
    return entities;
  }

  // 从行对中提取广告实体
  private extractEntityFromRowPair(rowPair: { fixed: HTMLElement; scrollable: HTMLElement }, level: AdLevel, columnIndices: ColumnIndices, rowIndex: number): AdEntity | null {
    // 从固定列提取名称
    const nameDiv = rowPair.fixed.querySelector('div');
    const name = nameDiv?.textContent?.trim() || '';
    
    // 从可滚动列提取数据
    const cells = Array.from(rowPair.scrollable.querySelectorAll('div'));
    
    // 提取编号字段（ID）
    const id = this.extractId(cells, level, columnIndices);
    if (!id) {
      return null;
    }
    
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

  // 提取数值字段
  private extractValues(cells: Element[], columnIndices: ColumnIndices): Record<string, number> {// 提取数值字段
    const values: Record<string, number> = {};
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
