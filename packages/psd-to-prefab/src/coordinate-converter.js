'use strict';

/**
 * PSD 坐标系统 → Cocos Creator 坐标系统转换
 *
 * PSD 坐标系:
 *   - 原点在左上角 (0, 0)
 *   - Y 轴向下为正
 *   - 位置由 left, top, right, bottom 定义
 *
 * Cocos Creator 坐标系:
 *   - 原点在左下角 (0, 0) -- 或根据锚点而定
 *   - Y 轴向上为正
 *   - 位置由 x, y, anchorPoint 定义
 *   - 节点位置默认基于父节点坐标空间
 */
class CoordinateConverter {

  /**
   * 将 PSD 图层坐标转换为 Cocos Creator 节点坐标
   *
   * @param {object} layer - PSD 图层数据 { left, top, width, height }
   * @param {number} psdHeight - PSD 文档总高度（用于 Y 轴翻转）
   * @param {object} parentLayer - 父图层数据（可选，用于相对坐标）
   * @param {object} options - 转换选项
   * @param {boolean} options.centerAnchor - 是否使用中心锚点 (0.5, 0.5)
   * @returns {object} { x, y, anchorPoint, contentSize }
   */
  static convertLayer(layer, psdHeight, parentLayer = null, options = {}) {
    const centerAnchor = options.centerAnchor !== false;  // 默认居中

    const width = layer.width || (layer.right - layer.left) || 0;
    const height = layer.height || (layer.bottom - layer.top) || 0;

    // PSD 坐标（相对父图层）
    let relativeLeft = layer.left || 0;
    let relativeTop = layer.top || 0;

    if (parentLayer) {
      relativeLeft -= (parentLayer.left || 0);
      relativeTop -= (parentLayer.top || 0);
    }

    // 转换为 Cocos 坐标
    // Y 轴翻转：Cocos 的 Y 轴向上，PSD 的 Y 轴向下
    const parentHeight = parentLayer
      ? (parentLayer.height || (parentLayer.bottom - parentLayer.top) || psdHeight)
      : psdHeight;

    // PSD top 距离 → Cocos Y 坐标
    // Cocos Y = (父高度 - top - 高度) = 从底部算起的位置
    const cocosY = parentHeight - relativeTop - height;

    if (centerAnchor) {
      // 锚点居中：(0.5, 0.5)
      // 节点位置 = 图层左上角 + 半宽半高
      return {
        x: relativeLeft + width / 2,
        y: cocosY + height / 2,
        anchorPoint: { x: 0.5, y: 0.5 },
        contentSize: { width, height }
      };
    } else {
      // 锚点在左下角：(0, 0)
      return {
        x: relativeLeft,
        y: cocosY,
        anchorPoint: { x: 0, y: 0 },
        contentSize: { width, height }
      };
    }
  }

  /**
   * 获取 PSD 文档尺寸
   */
  static getDocumentSize(psdTree) {
    return {
      width: psdTree.document.width,
      height: psdTree.document.height
    };
  }
}

module.exports = CoordinateConverter;
