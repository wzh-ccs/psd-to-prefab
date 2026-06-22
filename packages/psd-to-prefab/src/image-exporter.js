'use strict';

const Path = require('path');
const Fs = require('fs');
const Zlib = require('zlib');

/**
 * 图层图像导出器
 * 负责将 PSD 图层导出为独立的 PNG 文件
 *
 * 关键点：psd.js 在启用 layerImages: true 后，
 * 可以通过 layer.image.toFile() 导出单个图层图像
 */
class ImageExporter {

  /**
   * 导出所有可见图层为 PNG
   * @param {object} psdTree - 解析后的 PSD 树
   * @param {string} outputDir - 输出目录（绝对路径）
   * @param {object} document - PSD 文档信息
   * @returns {object} { filePaths, fileNames, dbUrls, count }
   */
  static exportLayers(psdTree, outputDir, document) {
    // 确保输出目录存在
    if (!Fs.existsSync(outputDir)) {
      Fs.mkdirSync(outputDir, { recursive: true });
    }

    const result = {
      filePaths: [],
      fileNames: [],
      dbUrls: [],
      count: 0
    };

    // 递归导出所有图层
    this._exportNode(psdTree.root, psdTree._psd, outputDir, document, result, '');

    return result;
  }

  /**
   * 递归导出单个节点及其子节点
   */
  static _exportNode(node, psd, outputDir, document, result, pathPrefix) {
    // 跳过不可见图层
    if (!node.visible) return;

    // 为每个图层生成 PNG
    // 只有 type === 'layer' 的才导出图像
    // type === 'group' 的是文件夹，不导出图像但递归处理子节点
    if (node.type === 'layer') {
      const safeName = this._sanitizeFileName(node.name);
      const fileName = pathPrefix ? `${pathPrefix}_${safeName}.png` : `${safeName}.png`;
      const filePath = Path.join(outputDir, fileName);

      // 使用 psd.js 的图层图像导出
      this._exportLayerImage(node, psd, filePath);

      result.filePaths.push(filePath);
      result.fileNames.push(fileName);
      // 构建 db:// URL（在 Cocos Creator 插件环境中使用）
      const dbUrlBase = Path.basename(outputDir);
      result.dbUrls.push(
        `db://assets/psd-imports/${dbUrlBase}/${fileName}`
      );
      result.count++;
    }

    // 递归处理子节点
    if (node.children) {
      node.children.forEach(child => {
        const childPrefix = pathPrefix
          ? `${pathPrefix}_${this._sanitizeFileName(node.name)}`
          : this._sanitizeFileName(node.name);
        this._exportNode(child, psd, outputDir, document, result, childPrefix);
      });
    }
  }

  /**
   * 导出单个图层图像到文件
   * psd.js 3.4.0 API:
   *   - layer.image.toPng() 返回 pngjs PNG 对象
   *   - 用 PNG.sync.write() 同步写入文件
   */
  static _exportLayerImage(node, psd, outputPath) {
    const psdTree = psd.tree();
    const layerNode = this._findLayerNode(psdTree, node.name, node.left, node.top);

    if (layerNode && layerNode.layer && layerNode.layer.image) {
      try {
        // 用 toPng() 获取 PNG 对象
        const png = layerNode.layer.image.toPng();
        // 用 pngjs 的同步 API 写入文件
        const { PNG } = require('pngjs');
        const buffer = PNG.sync.write(png);
        Fs.writeFileSync(outputPath, buffer);
        return;
      } catch (e) {
        // 导出失败，使用占位图
        console.error('[psd-to-prefab] 图层导出失败:', e.message);
      }
    }

    // 回退方案：创建透明占位图
    this._createPlaceholderImage(node.width, node.height, outputPath);
  }

  /**
   * 在 psd 树中查找匹配的图层节点
   */
  static _findLayerNode(tree, name, left, top) {
    try {
      const descendants = tree.descendants();
      for (const node of descendants) {
        if (node.get('name') === name &&
            Math.abs((node.get('left') || 0) - (left || 0)) < 1 &&
            Math.abs((node.get('top') || 0) - (top || 0)) < 1) {
          return node;
        }
      }
    } catch (e) {
      // 忽略遍历错误
    }
    return null;
  }

  /**
   * 创建透明占位图（当图层图像导出失败时）
   */
  static _createPlaceholderImage(width, height, outputPath) {
    const w = Math.max(Math.round(width) || 1, 1);
    const h = Math.max(Math.round(height) || 1, 1);
    const png = this._encodePNG(w, h);
    Fs.writeFileSync(outputPath, png);
  }

  /**
   * 简单 PNG 编码器（生成 RGBA 透明图）
   */
  static _encodePNG(width, height) {
    // PNG 签名
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR 块
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8);    // 位深度
    ihdrData.writeUInt8(6, 9);    // 颜色类型 RGBA
    ihdrData.writeUInt8(0, 10);   // 压缩方法
    ihdrData.writeUInt8(0, 11);   // 过滤方法
    ihdrData.writeUInt8(0, 12);   // 隔行扫描
    const ihdr = this._createChunk('IHDR', ihdrData);

    // IDAT 块（图像数据）
    const rawData = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * (width * 4 + 1);
      rawData[rowOffset] = 0; // 无过滤
      for (let x = 0; x < width; x++) {
        const pixelOffset = rowOffset + 1 + x * 4;
        rawData[pixelOffset] = 0;     // R
        rawData[pixelOffset + 1] = 0; // G
        rawData[pixelOffset + 2] = 0; // B
        rawData[pixelOffset + 3] = 0; // A (透明)
      }
    }
    const compressed = Zlib.deflateSync(rawData);
    const idat = this._createChunk('IDAT', compressed);

    // IEND 块
    const iend = this._createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdr, idat, iend]);
  }

  /**
   * 创建 PNG 数据块
   */
  static _createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);

    // 手动计算 CRC32
    const crcValue = this._crc32(crcData);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crcValue >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  /**
   * CRC32 计算
   */
  static _crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xEDB88320;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /**
   * 清理文件名中的非法字符
   */
  static _sanitizeFileName(name) {
    if (!name) return 'unnamed';
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/^\.+/, '_')
      .substring(0, 100) || 'unnamed';
  }
}

module.exports = ImageExporter;
