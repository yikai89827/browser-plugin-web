/**
 * fbControl 页面 MAIN 世界 token 探测（通道二）
 * 须与 utils/fb/tokenPostMessageProtocol.ts 中常量保持一致。
 */
(function () {
  var SRC = 'FB_CONTROL_PAGE';
  var ACT = 'SAVE_ACCESS_TOKEN';

  function post(t) {
    try {
      if (!t || typeof t !== 'string' || t.length < 30) return;
      window.postMessage({ source: SRC, action: ACT, token: t }, '*');
    } catch (e) {
      /* ignore */
    }
  }

  var last = '';

  function tick() {
    var t = null;
    try {
      t = window.__accessToken || window.__fbAccessToken || null;
    } catch (e) {
      /* ignore */
    }
    if (t && typeof t === 'string' && t !== last) {
      last = t;
      post(t);
    }
  }

  tick();
  setInterval(tick, 2500);
})();
