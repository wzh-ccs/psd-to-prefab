'use strict';

const PSD = require('psd');

/**
 * PSD 解析器
 * 负责解析 PSD 文件并返回结构化的图层树
 */
class PsdParser {

  /**
   * 解析 PSD 文件
   * @param {string} filePath - PSD 文件绝对路径
   * @param {object} options - 解析选项
   * @param {boolean} options.layerImages - 是否解析图层图像数据（必须为 true）
   * @param {boolean} options.onlyVisibleLayers - 是否仅解析可见图层
   * @returns {object} 解析后的 PSD 树结构
   */
  static parse(filePath, options = {}) {
    const psd = PSD.fromFile(filePath);

    // psd.js 3.4.0 直接 parse() 即可解析所有数据（包括图层图像）
    psd.parse();

    const tree = psd.tree().export();

    // 增强树结构，添加辅助信息
    return this._enhanceTree(tree, psd);
  }

  /**
   * 增强树结构，添加 PSD 文档级元数据和遍历辅助方法
   */
  static _enhanceTree(tree, psd) {
    const docWidth = tree.document.width;
    const docHeight = tree.document.height;
    const root = this._processNode(tree, psd);

    // psd.js 的 Root.export() 不含 left/top/width/height，需要补充
    // 否则坐标转换时根节点尺寸为 0，导致所有子节点坐标错误
    root.type = 'root';
    root.left = 0;
    root.top = 0;
    root.right = docWidth;
    root.bottom = docHeight;
    root.width = docWidth;
    root.height = docHeight;

    return {
      document: {
        width: docWidth,
        height: docHeight,
        resources: tree.document.resources || {}
      },
      root: root,
      _psd: psd
    };
  }

  /**
   * 递归处理节点，统一图层数据格式
   */
  static _processNode(node, psd) {
    const processed = {
      type: node.type,           // 'group' | 'layer'
      name: node.name || 'Unnamed',
      visible: node.visible !== false,
      opacity: node.opacity != null ? node.opacity : 1,
      blendingMode: node.blendingMode || 'normal',

      // PSD 坐标系：原点在左上角
      left: node.left || 0,
      top: node.top || 0,
      right: node.right || 0,
      bottom: node.bottom || 0,

      // 计算尺寸
      width: node.width || (node.right - node.left) || 0,
      height: node.height || (node.bottom - node.top) || 0,

      // 文本图层信息（如果有）
      text: node.text || null,

      // 蒙版信息（如果有）
      mask: node.mask || null,

      // 子节点
      children: []
    };

    // 递归处理子节点
    if (node.children && node.children.length > 0) {
      processed.children = node.children.map(child =>
        this._processNode(child, psd)
      );
    }

    return processed;
  }
}

module.exports = PsdParser;
