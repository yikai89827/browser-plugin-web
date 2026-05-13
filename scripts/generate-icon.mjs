import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// 优化后的蜘蛛图标 SVG 代码 - 加粗腿部
const spiderSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- 白色背景 -->
  <rect x="0" y="0" width="128" height="128" fill="#ffffff" rx="16" ry="16"/>
  <defs>
    <linearGradient id="spiderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4facfe"/>
      <stop offset="100%" style="stop-color:#00f2fe"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="2" dy="2" stdDeviation="2" flood-opacity="0.3"/>
    </filter>
  </defs>
  <!-- 蜘蛛腹部 -->
  <ellipse cx="64" cy="55" rx="18" ry="22" fill="url(#spiderGradient)" filter="url(#shadow)"/>
  <!-- 蜘蛛头部 -->
  <circle cx="64" cy="35" r="12" fill="url(#spiderGradient)" filter="url(#shadow)"/>
  <!-- 眼睛 -->
  <circle cx="58" cy="32" r="3" fill="#fff"/>
  <circle cx="70" cy="32" r="3" fill="#fff"/>
  <circle cx="58" cy="32" r="1.5" fill="#000"/>
  <circle cx="70" cy="32" r="1.5" fill="#000"/>
  <!-- 加粗的曲线腿部 -->
  <path d="M64 50 Q40 45 20 25" stroke="url(#spiderGradient)" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M64 50 Q40 55 20 85" stroke="url(#spiderGradient)" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M64 54 Q38 35 30 12" stroke="url(#spiderGradient)" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M64 54 Q38 75 30 116" stroke="url(#spiderGradient)" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M64 58 Q92 35 98 12" stroke="url(#spiderGradient)" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M64 58 Q92 75 98 116" stroke="url(#spiderGradient)" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M64 62 Q96 55 108 85" stroke="url(#spiderGradient)" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M64 62 Q96 45 108 25" stroke="url(#spiderGradient)" stroke-width="4" stroke-linecap="round" fill="none"/>
</svg>
`;

const iconDir = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '../public/icon');

if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

const svgPath = path.join(iconDir, 'spider.svg');
fs.writeFileSync(svgPath, spiderSvg.trim());
console.log('SVG 图标已生成:', svgPath);

const sizes = [16, 32, 48, 96, 128];

sizes.forEach(size => {
  const pngPath = path.join(iconDir, `${size}.png`);
  sharp(Buffer.from(spiderSvg.trim()))
    .resize(size, size)
    .png()
    .toFile(pngPath)
    .then(() => console.log(`PNG 图标 ${size}x${size} 已生成: ${pngPath}`))
    .catch(err => console.error(`生成 ${size}x${size} 失败:`, err));
});
