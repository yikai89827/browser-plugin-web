import { fbControlLog } from '../../../utils/fbControlLog';
import { isAdsPanelTargetPage } from './detectSelectedAccount';
import { AdsPanelWidget } from './widget';

let widget: AdsPanelWidget | null = null;

/** 在广告管理 / 广告报表页挂载右下角悬浮数据窗 */
export function initAdsPanelOnPage(): void {
  const tryMount = () => {
    if (!isAdsPanelTargetPage() || widget) return;
    try {
      widget = new AdsPanelWidget();
      widget.mount();
    } catch (e) {
      fbControlLog('content:ads-panel', '挂载失败', e);
    }
  };
  tryMount();
  window.setInterval(tryMount, 3000);
}
