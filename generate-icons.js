/**
 * 生成扩展图标
 * 使用 Node.js canvas 生成简单的 PNG 图标
 * 
 * 运行方式: node generate-icons.js
 * 依赖: 需要先安装 canvas 库 (npm install canvas)
 */

const fs = require('fs');
const path = require('path');

// 检查是否有 canvas 库
let createCanvas;
try {
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  // 如果没有 canvas 库，生成简单的占位 PNG
  console.log('canvas 库未安装，将生成简单占位图标');
  generatePlaceholderIcons();
  process.exit(0);
}

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

// 确保 icons 目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

/**
 * 生成图标
 */
function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // 背景渐变
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  
  // 绘制圆角矩形背景
  const radius = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // 绘制 "T" 字母
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', size / 2, size / 2);
  
  // 绘制翻译符号（两个小箭头）
  const arrowSize = size * 0.12;
  const arrowY = size * 0.75;
  
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.lineCap = 'round';
  
  // 左箭头
  ctx.beginPath();
  ctx.moveTo(size * 0.25, arrowY);
  ctx.lineTo(size * 0.4, arrowY);
  ctx.moveTo(size * 0.25, arrowY);
  ctx.lineTo(size * 0.32, arrowY - arrowSize * 0.5);
  ctx.moveTo(size * 0.25, arrowY);
  ctx.lineTo(size * 0.32, arrowY + arrowSize * 0.5);
  ctx.stroke();
  
  // 右箭头
  ctx.beginPath();
  ctx.moveTo(size * 0.75, arrowY);
  ctx.lineTo(size * 0.6, arrowY);
  ctx.moveTo(size * 0.75, arrowY);
  ctx.lineTo(size * 0.68, arrowY - arrowSize * 0.5);
  ctx.moveTo(size * 0.75, arrowY);
  ctx.lineTo(size * 0.68, arrowY + arrowSize * 0.5);
  ctx.stroke();
  
  return canvas.toBuffer('image/png');
}

/**
 * 生成简单占位图标（无需 canvas 库）
 */
function generatePlaceholderIcons() {
  // 最小有效 PNG（1x1 蓝色像素），然后拉伸
  // 这是一个简单的蓝紫色渐变图标的 base64 编码
  
  const icons = {
    16: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2klEQVQ4T2NkoBAwUqifYdAAhv8MDYz/GRgZ/jMw/GdkYGT4z8jI+J+BgeE/AwMjw39Ghv9wOQYGBgYGRgaG/wwMDAwMjAwM/xkZGP4zMjL8Z2Bg+M/AwPCfgYGBgYGRgeE/AwMDA8N/BgaG/wwMDP8ZGBgYGBgYGBgYGRn+MzAw/GdgYPjPwMDAwMDAwMDAwMjA8J+RgeE/IyPDf0YGhv+MDAz/GRkY/jMwMPxnYGD4z8DA8J+BgYGBgZGB4T8DAwMDA8N/BgaG/wwMDP8ZGBgYGBgYGBgYGQEAlCEYETQAAAAASUVORK5CYII=',
    48: 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAB1klEQVRoQ2NkGGDAMNAOYBjpDgAZ9Z+BgZEB5ID/DIwM/xkZGf8zMDD8Z2Rk/M/AwPCfkZHxPwMDw38GBob/DAwM/xkYGP4zMDAwMDIy/GdgYPjPyMj4n4GB4T8jI+N/BgaG/4yMjP8ZGBj+MzAw/GdgYPjPwMDwn4GB4T8DA8N/BgaG/wwMDP8ZGBj+MzAw/GdgYPjPwMDwn4GB4T8DA8N/BgaG/4yMjP8ZGBj+MzAw/GdgYPjPyMj4n4GB4T8jI+N/BgaG/4yMjP8ZGBj+MzIy/mdgYPjPyMj4n4GB4T8jI+N/BgaG/4yMjP8ZGBj+MzAw/GdgYPjPwMDwn4GB4T8DA8N/BgaG/wwMDP8ZGBj+MzAw/GdgYPjPwMDwn4GB4T8DA8N/BgaG/wwMDP8ZGBj+MzAw/GdgYPjPwMDwn5GR8T8DA8N/BgaG/4yMjP8ZGBj+MzIy/mdgYPjPyMj4n4GB4T8jI+N/BgaG/4yMjP8ZGBj+MzAw/GdgYPjPwMDwn4GB4T8DA8N/RkbG/wwMDP8ZGBj+MzIy/mdgYPjPyMj4n5GR8T8DA8N/RkbG/4yMjP8ZGRn/MzIy/mdgYPjPyMj4n5GR8T8jI+N/RkbG/4yMjAwAACMHMDGD5wAAAABJRU5ErkJggg==',
    128: 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADTklEQVR4Xu2dO47CMBRF5whILICKYgHMolgAFRULYA/sYQ8sgIqCBVBRsQAolkCCBAIEkiNlRpEywWNnfN9NH5WQ39xz7/U4EvWXS/lfIcBVEMBVgAigAMrgKkAB9AGuwlVAH4AC9AGuwlVAH9AXrl7CVEAfwFW4CugDUIA+wFW4CugD+sLVS5gK6AO4ClcBfQAK0Ae4ClcBfUBfuHoJUwF9AFfhKqAPQAH6AFfhKqAP6AtXL2EqoA/gKlwF9AEoQB/gKlwF9AF94eolTAX0AVyFq4A+AAXoA1yFq4A+oC9cvYSpgD6Aq3AV0AegAH2Aq3AV0Af0hauXMBXQB3AVrgL6ABSgD3AVrgL6gL5w9RKmAvoArsJVQB+AAvQBrsJVQB/QF65ewlRAH8BVuAroA1CAPsBVuAroA/rC1UuYCugDuApXAX0ACtAHuApXAX1AX7h6CVMBfQBX4SqgD0AB+gBX4SqgD+gLVy9hKqAP4CpcBfQBKEAf4CpcBfQBfeHqJUwF9AFchauAPgAF6ANchauAPqAvXL2EqYA+gKtwFdAHoAB9gKtwFdAH9IWrlzAV0AdwFa4C+gAUoA9wFa4C+oC+cPUSpgL6AK7CVUAfgAL0Aa7CVUAf0BeuXsJUQB/AVbgK6ANQgD7AVbgK6AP6wtVLmAroA7gKVwF9AArQB7gKVwF9QF+4eglTAX0AV+EqoA9AAfrgKlwF9AF94eolTAX0AVyFq4A+AAXoA1yFq4A+oC9cvYSpgD6Aq3AV0AegAH2Aq3AV0Af0hauXMBXQB3AVrgL6ABSgD3AVrgL6gL5w9RKmAvoArsJVQB+AAvQBrsJVQB/QF65ewlRAH8BVuAroA1CAPsBVuAroA/rC1UuYCugDuApXAX0ACtAHuApXAX1AX7h6CVMBfQBX4SqgD0AB+gBX4SqgD+gLVy9hKqAP4CpcBfQBKEAf4CpcBfQBfeHqJUwF9AFchauAPgAF6ANchauAPqAvXL2EqYA+gKtwFdAHoAB9gKtwFdAH9IWrlzAV0AdwFa4C+gAUoA9wFa4C+oC+cPUSpgL6AK7CVUAfgAL0Aa7CVUAf0BeuXsJUQB/AVbgK6APwxdV/CWD0Nf7N7QAAAABJRU5ErkJggg=='
  };
  
  const iconsDir = path.join(__dirname, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
  }
  
  for (const size of [16, 48, 128]) {
    const buffer = Buffer.from(icons[size], 'base64');
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`Created icon${size}.png`);
  }
}

// 主程序
if (createCanvas) {
  for (const size of sizes) {
    const buffer = generateIcon(size);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`Created icon${size}.png (${size}x${size})`);
  }
} else {
  generatePlaceholderIcons();
}

console.log('Icon generation complete!');
