import { browser } from 'wxt/browser';

export interface FacebookPixel {
  id: string;
  name: string;
  pixelId: string;
  accountId: string;
  accountName: string;
  isActive: boolean;
  status: string;
  conversions: number;
  lastFireTime: number;
  createdAt: number;
}

export async function fetchPixels(): Promise<FacebookPixel[]> {
  const pixels: FacebookPixel[] = [];
  
  try {
    const url = window.location.href;
    
    if (url.includes('/events_manager2/') || url.includes('/business/events/')) {
      console.log('Fetching pixels from Events Manager');
      
      // 方法1: 从DOM中提取像素信息
      const pixelRows = document.querySelectorAll('[data-testid*="pixel-row"], [data-testid*="event-pixel"]');
      
      pixelRows.forEach((row, index) => {
        try {
          const nameEl = row.querySelector('[data-testid*="pixel-name"], [data-visualcompletion="ignore-dynamic"]');
          const idEl = row.querySelector('[data-testid*="pixel-id"]');
          const statusEl = row.querySelector('[data-testid*="pixel-status"]');
          const conversionsEl = row.querySelector('[data-testid*="conversions"]');
          
          if (nameEl) {
            const pixel: FacebookPixel = {
              id: `fb_pixel_${Date.now()}_${index}`,
              name: nameEl.textContent?.trim() || `Pixel ${index + 1}`,
              pixelId: idEl?.textContent?.trim() || '',
              accountId: '',
              accountName: '',
              isActive: statusEl?.textContent?.toLowerCase().includes('active') || true,
              status: statusEl?.textContent?.trim() || 'Active',
              conversions: parseConversions(conversionsEl?.textContent),
              lastFireTime: Date.now(),
              createdAt: Date.now()
            };
            
            pixels.push(pixel);
          }
        } catch (err) {
          console.error('Error parsing pixel row:', err);
        }
      });
      
      // 方法2: 尝试从页面数据中提取
      if (pixels.length === 0) {
        const pageData = extractPageData();
        if (pageData?.pixels) {
          pixels.push(...pageData.pixels);
        }
      }
      
      console.log(`Found ${pixels.length} pixels`);
    }
    
    // 保存到本地存储
    await savePixels(pixels);
    
    return pixels;
  } catch (error) {
    console.error('Error fetching pixels:', error);
    throw error;
  }
}

function parseConversions(conversionsText?: string | null): number {
  if (!conversionsText) return 0;
  
  const cleaned = conversionsText.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

function extractPageData() {
  try {
    const scripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const content = script.textContent;
      if (content && (content.includes('pixelsData') || content.includes('eventsManagerData'))) {
        const match = content.match(/(pixelsData|eventsManagerData)\s*=\s*({[^;]+});/);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
    }
  } catch (error) {
    console.error('Error extracting page data:', error);
  }
  return null;
}

async function savePixels(pixels: FacebookPixel[]) {
  try {
    const existingData: any = await browser.storage.local.get('fb_control_pixels');
    const existingPixels = Array.isArray(existingData['fb_control_pixels'])
      ? existingData['fb_control_pixels']
      : (existingData['fb_control_pixels'] ? JSON.parse(existingData['fb_control_pixels']) : []);
    
    // 合并数据，避免重复
    const pixelMap = new Map();
    existingPixels.forEach((pixel: { id: string; }) => pixelMap.set(pixel.id, pixel));
    pixels.forEach((pixel: { id: string; }) => pixelMap.set(pixel.id, pixel));
    
    const mergedPixels = Array.from(pixelMap.values());
    
    await browser.storage.local.set({
      'fb_control_pixels': JSON.stringify(mergedPixels)
    });
    
    console.log(`Saved ${mergedPixels.length} pixels to storage`);
  } catch (error) {
    console.error('Error saving pixels:', error);
  }
}

export function isPixelPage(): boolean {
  return window.location.href.includes('/events_manager2/') || 
         window.location.href.includes('/business/events/');
}
