const fs = require('fs')
const jsonData = fs.readFileSync('./test.json','utf8');
const jsonString = JSON.stringify(jsonData);
const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
console.log(`JSON数据大小：${sizeInBytes/1024} KB`);
document.querySelector