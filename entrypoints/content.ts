// Content script for the extension
export default defineContentScript({
  matches: ['*://*.facebook.com/*', '*://*.baidu.com/*'],
  main() {
    console.log('Content script loaded');

    // Add your content script logic here
  }
});
