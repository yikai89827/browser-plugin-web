import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// 蜘蛛图标 SVG 代码
const spiderSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="spiderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4facfe"/>
      <stop offset="100%" style="stop-color:#00f2fe"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="50" r="20" fill="url(#spiderGradient)"/>
  <circle cx="64" cy="35" r="12" fill="url(#spiderGradient)"/>
  <circle cx="58" cy="32" r="3" fill="#fff"/>
  <circle cx="70" cy="32" r="3" fill="#fff"/>
  <circle cx="58" cy="32" r="1.5" fill="#000"/>
  <circle cx="70" cy="32" r="1.5" fill="#000"/>
  <line x1="64" y1="48" x2="20" y2="20" stroke="url(#spiderGradient)" stroke-width="3" stroke-linecap="round"/>
  <line x1="64" y1="48" x2="20" y2="88" stroke="url(#spiderGradient)" stroke-width="3" stroke-linecap="round"/>
  <line x1="64" y1="52" x2="35" y2="8" stroke="url(#spiderGradient)" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="64" y1="52" x2="35" y2="120" stroke="url(#spiderGradient)" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="64" y1="56" x2="93" y2="8" stroke="url(#spiderGradient)" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="64" y1="56" x2="93" y2="120" stroke="url(#spiderGradient)" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="64" y1="60" x2="108" y2="20" stroke="url(#spiderGradient)" stroke-width="3" stroke-linecap="round"/>
  <line x1="64" y1="60" x2="108" y2="108" stroke="url(#spiderGradient)" stroke-width="3" stroke-linecap="round"/>
</svg>
`;

const iconDir = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '../public/icon');

// 确保目录存在
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// 将 SVG 写入临时文件
const svgPath = path.join(iconDir, 'spider.svg');
fs.writeFileSync(svgPath, spiderSvg.trim());
console.log('SVG 图标已生成:', svgPath);

// 使用 sharp 转换为 PNG
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
