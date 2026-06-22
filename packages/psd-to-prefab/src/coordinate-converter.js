'use strict';

/**
 * PSD 坐标系统 → Cocos Creator 坐标系统转换
 *
 * PSD 坐标系: 原点左上角，Y 轴向下
 * Cocos 坐标系: 原点左下角，Y 轴向上
 *
 * 当父节点锚点为 (0.5, 0.5) 时，子节点坐标是相对于父节点中心的偏移
 * 当父节点锚点为 (0, 0) 时，子节点坐标是相对于父节点左下角的偏移
 */
class CoordinateConverter {

  /**
   * @param {object} layer - PSD 图层 { left, top, width, height }
   * @param {number} psdHeight - PSD 文档高度
   * @param {number} psdWidth - PSD 文档宽度
   * @param {object} parentLayer - 父图层数据（可选）
   * @param {object} options - 转换选项
   */
  static convertLayer(layer, psdHeight, psdWidth, parentLayer = null, options = {}) {
    const centerAnchor = options.centerAnchor !== false;

    const width = layer.width || (layer.right - layer.left) || 0;
    const height = layer.height || (layer.bottom - layer.top) || 0;

    // PSD 坐标（相对父图层）
    let relativeLeft = layer.left || 0;
    let relativeTop = layer.top || 0;

    // 父节点尺寸
    let parentW, parentH;
    if (parentLayer) {
      relativeLeft -= (parentLayer.left || 0);
      relativeTop -= (parentLayer.top || 0);
      parentW = parentLayer.width || psdWidth;
      parentH = parentLayer.height || psdHeight;
    } else {
      parentW = psdWidth;
      parentH = psdHeight;
    }

    // Y 轴翻转：PSD top → Cocos bottom
    const bottomY = parentH - relativeTop - height;

    if (centerAnchor) {
      // 锚点 (0.5, 0.5)：坐标 = 图层中心相对于父节点中心的偏移
      return {
        x: relativeLeft + width / 2 - parentW / 2,
        y: bottomY + height / 2 - parentH / 2,
        anchorPoint: { x: 0.5, y: 0.5 },
        contentSize: { width, height }
      };
    } else {
      // 锚点 (0, 0)：坐标 = 图层左下角相对于父节点左下角
      return {
        x: relativeLeft,
        y: bottomY,
        anchorPoint: { x: 0, y: 0 },
        contentSize: { width, height }
      };
    }
  }

  static getDocumentSize(psdTree) {
    return {
      width: psdTree.document.width,
      height: psdTree.document.height
    };
  }
}

module.exports = CoordinateConverter;
