import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 源目录
const sourceDir = path.join(__dirname, '../public/icon');
// 目标目录
const targetDir = path.join(__dirname, '../site/public/icon');

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log('创建目录:', targetDir);
}

// 获取源目录中的所有 PNG 文件
const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.png'));

// 复制文件
files.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);
  
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`复制: ${file} -> ${targetPath}`);
});

console.log('图标复制完成！');
