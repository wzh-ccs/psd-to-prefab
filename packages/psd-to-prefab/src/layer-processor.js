'use strict';

/**
 * 图层类型处理器
 *
 * 处理 PSD 中不同类型的图层：
 *   1. pixel layer (type: 'layer') - 普通像素图层 → Sprite 组件
 *   2. group layer (type: 'group') - 图层组/文件夹 → 空 Node（仅作容器）
 *   3. text layer (has text property) - 文本图层 → Label 组件
 *   4. adjustment layer - 调整图层 → 跳过（无法渲染为可视内容）
 *   5. smart object layer - 智能对象 → 跳过或尝试导出
 */
class LayerProcessor {

  /**
   * 判断图层类型并返回对应的组件类型
   */
  static classifyLayer(layer) {
    if (layer.type === 'group') {
      return {
        layerType: 'group',
        componentType: null,  // 组不需要组件
        exportable: false,
        description: '图层组（文件夹）'
      };
    }

    if (layer.type === 'layer') {
      // 文本图层判断
      if (layer.text && layer.text.value) {
        return {
          layerType: 'text',
          componentType: 'cc.Label',
          exportable: false,  // 文本不需要导出 PNG
          description: '文本图层'
        };
      }

      // 检查是否为调整图层（通过名称或其他特征）
      if (this._isAdjustmentLayer(layer)) {
        return {
          layerType: 'adjustment',
          componentType: null,
          exportable: false,
          description: '调整图层（跳过）'
        };
      }

      // 普通像素图层
      return {
        layerType: 'pixel',
        componentType: 'cc.Sprite',
        exportable: true,
        description: '像素图层'
      };
    }

    // 未知类型，当作普通图层处理
    return {
      layerType: 'unknown',
      componentType: 'cc.Sprite',
      exportable: true,
      description: '未知类型图层'
    };
  }

  /**
   * 判断是否为调整图层
   * 调整图层通常没有像素数据，名称可能包含特定关键词
   */
  static _isAdjustmentLayer(layer) {
    const adjustmentKeywords = [
      '亮度/对比度', '色阶', '曲线', '色彩平衡', '色相/饱和度',
      'Brightness', 'Levels', 'Curves', 'Hue', 'Saturation',
      'Color Balance', 'Selective Color', 'Channel Mixer',
      'Gradient Map', 'Photo Filter', 'Exposure', 'Invert',
      'Threshold', 'Posterize'
    ];

    const name = (layer.name || '').toLowerCase();
    return adjustmentKeywords.some(keyword =>
      name.includes(keyword.toLowerCase())
    );
  }

  /**
   * 检查图层是否应该被包含在输出中
   */
  static shouldIncludeLayer(layer, options = {}) {
    // 跳过隐藏图层
    if (options.skipHiddenLayers && !layer.visible) {
      return false;
    }

    // 跳过调整图层
    if (options.skipAdjustmentLayers && this._isAdjustmentLayer(layer)) {
      return false;
    }

    return true;
  }

  /**
   * 获取图层在 Cocos Creator 中对应的组件配置
   */
  static getComponentConfig(layer, options = {}) {
    const classification = this.classifyLayer(layer);

    switch (classification.componentType) {
      case 'cc.Sprite':
        return {
          type: 'cc.Sprite',
          enabled: layer.visible,
          // Sprite 特定配置
          sizeMode: options.trimmedMode ? 1 : 0,  // TRIMMED or CUSTOM
          type: 0,  // SIMPLE
        };

      case 'cc.Label':
        return {
          type: 'cc.Label',
          enabled: layer.visible,
          // Label 特定配置
          string: layer.text ? layer.text.value : '',
          fontSize: layer.text && layer.text.font
            ? (layer.text.font.sizes[0] || 24)
            : 24,
        };

      default:
        return null;
    }
  }
}

module.exports = LayerProcessor;
