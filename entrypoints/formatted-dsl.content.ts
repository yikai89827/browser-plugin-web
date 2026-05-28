import { installFormattedDslCapture } from './content/adsPanel/formattedDslCapture';

/** 尽早挂钩 fetch/XHR，避免错过 Ads Manager 首次 GraphQL 响应中的 formatted_dsl */
export default defineContentScript({
  matches: [
    'https://adsmanager.facebook.com/*',
    'https://*.business.facebook.com/*',
  ],
  runAt: 'document_start',
  main() {
    installFormattedDslCapture();
  },
});
