// 数值同步模块
// 负责处理层级关系的数值同步

import { AdEntity, hierarchyManager } from './hierarchy';
import { numericFields } from './config';

// 同步类型
export type SyncDirection = 'up' | 'down'; // up: 向上同步（子级到父级）, down: 向下同步（父级到子级）

// 同步结果
export interface SyncResult {
  success: boolean;
  syncedEntities: AdEntity[];
  message: string;
}

// 数值同步管理器
class ValueSyncManager {
  // 向下同步：从父级同步到子级
  async syncDown(fromEntity: AdEntity, fields: string[] = numericFields): Promise<SyncResult> {
    const syncedEntities: AdEntity[] = [];
    
    try {
      // 广告系列 -> 广告组
      if (fromEntity.level === 'Campaigns') {
        const adsets = hierarchyManager.getCampaignAdsets(fromEntity.id);
        if (adsets.length > 0) {
          // 同步第一个广告组
          const firstAdset = adsets[0];
          this.syncValues(fromEntity, firstAdset, fields);
          syncedEntities.push(firstAdset);
          
          // 广告组 -> 广告
          const ads = hierarchyManager.getAdsetAds(firstAdset.id);
          if (ads.length > 0) {
            // 同步第一个广告
            const firstAd = ads[0];
            this.syncValues(firstAdset, firstAd, fields);
            syncedEntities.push(firstAd);
          }
        }
      }
      
      // 广告组 -> 广告
      else if (fromEntity.level === 'Adsets') {
        const ads = hierarchyManager.getAdsetAds(fromEntity.id);
        if (ads.length > 0) {
          // 同步第一个广告
          const firstAd = ads[0];
          this.syncValues(fromEntity, firstAd, fields);
          syncedEntities.push(firstAd);
        }
      }
      
      return {
        success: true,
        syncedEntities,
        message: `成功向下同步 ${syncedEntities.length} 个实体`
      };
    } catch (error: any) {
      return {
        success: false,
        syncedEntities,
        message: `同步失败: ${error?.message || '未知错误'}`
      };
    }
  }

  // 向上同步：从子级同步到父级
  async syncUp(fromEntity: AdEntity, fields: string[] = numericFields): Promise<SyncResult> {
    const syncedEntities: AdEntity[] = [];
    
    try {
      // 广告 -> 广告组
      if (fromEntity.level === 'Ads') {
        const adset = hierarchyManager.getAdAdset(fromEntity.id);
        if (adset) {
          this.syncValues(fromEntity, adset, fields);
          syncedEntities.push(adset);
          
          // 广告组 -> 广告系列
          const campaign = hierarchyManager.getAdsetCampaign(adset.id);
          if (campaign) {
            this.syncValues(adset, campaign, fields);
            syncedEntities.push(campaign);
          }
        }
      }
      
      // 广告组 -> 广告系列
      else if (fromEntity.level === 'Adsets') {
        const campaign = hierarchyManager.getAdsetCampaign(fromEntity.id);
        if (campaign) {
          this.syncValues(fromEntity, campaign, fields);
          syncedEntities.push(campaign);
        }
      }
      
      return {
        success: true,
        syncedEntities,
        message: `成功向上同步 ${syncedEntities.length} 个实体`
      };
    } catch (error: any) {
      return {
        success: false,
        syncedEntities,
        message: `同步失败: ${error?.message || '未知错误'}`
      };
    }
  }

  // 同步数值
  private syncValues(from: AdEntity, to: AdEntity, fields: string[]) {
    fields.forEach(field => {
      // 同步增加值
      const increaseValue = from.increaseValues[field] || 0;
      to.increaseValues[field] = increaseValue;
      
      // 计算新的总值
      const originalValue = to.values[field] || 0;
      to.values[field] = originalValue + increaseValue;
      
      console.log(`同步字段 ${field}: 从 ${from.name} (${from.id}) 到 ${to.name} (${to.id})，增加值: ${increaseValue}`);
    });
  }

  // 批量同步
  async batchSync(entities: AdEntity[], direction: SyncDirection = 'down'): Promise<SyncResult> {
    const allSynced: AdEntity[] = [];
    let allSuccess = true;
    
    for (const entity of entities) {
      let result: SyncResult;
      if (direction === 'down') {
        result = await this.syncDown(entity);
      } else {
        result = await this.syncUp(entity);
      }
      
      allSynced.push(...result.syncedEntities);
      if (!result.success) {
        allSuccess = false;
      }
    }
    
    return {
      success: allSuccess,
      syncedEntities: allSynced,
      message: `批量同步完成，成功同步 ${allSynced.length} 个实体`
    };
  }

  // 重置所有增加值
  resetIncreaseValues() {
    const hierarchy = hierarchyManager.getHierarchy();
    
    // 重置广告系列
    Object.values(hierarchy.campaigns).forEach(campaign => {
      Object.keys(campaign.increaseValues).forEach(field => {
        campaign.increaseValues[field] = 0;
      });
    });
    
    // 重置广告组
    Object.values(hierarchy.adsets).forEach(adset => {
      Object.keys(adset.increaseValues).forEach(field => {
        adset.increaseValues[field] = 0;
      });
    });
    
    // 重置广告
    Object.values(hierarchy.ads).forEach(ad => {
      Object.keys(ad.increaseValues).forEach(field => {
        ad.increaseValues[field] = 0;
      });
    });
  }

  // 计算同步后的总值
  calculateTotalValues(entity: AdEntity): Record<string, number> {
    const totalValues: Record<string, number> = {};
    
    numericFields.forEach(field => {
      const originalValue = entity.values[field] || 0;
      const increaseValue = entity.increaseValues[field] || 0;
      totalValues[field] = originalValue + increaseValue;
    });
    
    return totalValues;
  }
}

export const valueSyncManager = new ValueSyncManager();
