// 新页面的数据提取模块
// 负责从新页面提取数据

import { getColumnIndicesSync, getReportingTableDataRows } from './dom';

export const dataExtractor = {
  // 从DOM提取数据
  extractFromDom(): { entities: any[], columnIndices: any, sortInfo: any } {
    const entities: any[] = [];
    const columnIndices = getColumnIndicesSync();
    const sortInfo = { field: null, direction: null };
    
    // 报告页面的数据提取逻辑
    const tableContainer = document.querySelector('[role="table"]');
    if (tableContainer) {
      const dataRows = getReportingTableDataRows();
      
      // 遍历数据行
      let currentAccount: any | null = null;
      let currentCampaign: any | null = null;
      let currentAdSet: any | null = null;
      
      dataRows.forEach((row, index) => {
        // 提取行数据
        const rowData = this.extractRowData(row);
        
        // 识别行类型（合计行或数据行）
        const rowType = this.identifyRowType(rowData);
        
        // 根据行类型处理数据
        if (rowType === 'account') {
          currentAccount = rowData;
          entities.push({
            ...rowData,
            type: 'account',
            children: []
          });
        } else if (rowType === 'campaign') {
          currentCampaign = rowData;
          if (currentAccount) {
            currentAccount.children.push({
              ...rowData,
              type: 'campaign',
              children: []
            });
          }
        } else if (rowType === 'adset') {
          currentAdSet = rowData;
          if (currentCampaign) {
            currentCampaign.children.push({
              ...rowData,
              type: 'adset',
              children: []
            });
          }
        } else if (rowType === 'ad') {
          if (currentAdSet) {
            currentAdSet.children.push({
              ...rowData,
              type: 'ad',
              children: []
            });
          }
        }
      });
    }
    
    return { entities, columnIndices, sortInfo };
  },
  
  // 提取行数据
  extractRowData(row: HTMLElement): any {
    const data: any = {};
    const cells = Array.from(row.children);
    
    cells.forEach((cell: any, index: number) => {
      const text = cell.textContent?.trim() || '';
      data[`column_${index}`] = text;
    });
    
    // 提取账户名称、广告系列名称、广告组名称和广告名称
    data.accountName = cells[0]?.textContent?.trim() || '';
    data.campaignName = cells[1]?.textContent?.trim() || '';
    data.adSetName = cells[2]?.textContent?.trim() || '';
    data.adName = cells[3]?.textContent?.trim() || '';
    
    // 提取数值数据
    data.impressions = this.parseNumber(cells[4]?.textContent?.trim() || '0');
    data.reach = this.parseNumber(cells[5]?.textContent?.trim() || '0');
    data.spend = this.parseCurrency(cells[6]?.textContent?.trim() || '0');
    data.clicks = this.parseNumber(cells[7]?.textContent?.trim() || '0');
    data.purchases = this.parseNumber(cells[8]?.textContent?.trim() || '0');
    data.registrations = this.parseNumber(cells[9]?.textContent?.trim() || '0');
    
    return data;
  },
  
  // 识别行类型
  identifyRowType(rowData: any): string {
    // 根据数据判断行类型
    if (rowData.campaignName === '全部' && rowData.adSetName === '全部' && rowData.adName === '全部') {
      return 'account';
    } else if (rowData.adSetName === '全部' && rowData.adName === '全部') {
      return 'campaign';
    } else if (rowData.adName === '全部') {
      return 'adset';
    } else {
      return 'ad';
    }
  },
  
  // 解析数字
  parseNumber(text: string): number {
    const cleaned = text.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  },
  
  // 解析货币
  parseCurrency(text: string): number {
    const cleaned = text.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  }
};
