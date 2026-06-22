'use strict';

/**
 * Cocos Creator UUID 工具
 *
 * Cocos Creator 使用标准 UUID v4 格式（8-4-4-4-12 十六进制字符）
 * 在插件环境中，可以通过 Editor.Utils.UuidUtils 生成
 *
 * UUID 用途：
 *   1. 资源的 .meta 文件中作为资源标识
 *   2. Prefab JSON 中作为节点和组件的 __id__ 引用
 *   3. 资源之间的引用通过 UUID 建立
 *
 * __id__ vs __uuid__:
 *   - __id__: Prefab 内部引用（数组索引），在同一个 JSON 数组内唯一
 *   - __uuid__: 全局资源引用，跨文件唯一
 */
class UuidUtils {

  /**
   * 生成新的 UUID v4
   * 在 Cocos Creator 插件环境中优先使用 Editor API
   */
  static generate() {
    // 优先使用 Cocos Creator 内置 UUID 生成
    if (typeof Editor !== 'undefined' && Editor.Utils && Editor.Utils.UuidUtils) {
      try {
        // Editor.Utils.UuidUtils.uuid() 返回压缩格式，需要解压
        return Editor.Utils.UuidUtils.decompressUuid(
          Editor.Utils.UuidUtils.uuid()
        );
      } catch (e) {
        // 回退到手动生成
      }
    }

    // 回退方案：手动生成 UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 生成 Prefab 内部引用 ID（简短的唯一标识符）
   * 用于 Prefab JSON 数组中的 __id__ 引用
   */
  static generateShortId() {
    return 'xxxxxxxx'.replace(/x/g, () =>
      (Math.random() * 16 | 0).toString(16)
    );
  }

  /**
   * 压缩 UUID（用于存储）
   * Cocos Creator 内部使用压缩 UUID 格式（22字符 base64）
   */
  static compress(uuid) {
    if (typeof Editor !== 'undefined' && Editor.Utils && Editor.Utils.UuidUtils) {
      try {
        return Editor.Utils.UuidUtils.compressUuid(uuid);
      } catch (e) {
        // 回退
      }
    }
    return uuid;
  }

  /**
   * 已知的 Cocos Creator 内置资源 UUID
   */
  static getBuiltinUuids() {
    return {
      // 默认 Sprite 材质（builtin-sprite-material）
      spriteMaterial: 'eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432',
      // 默认纹理
      defaultTexture: '02eee22c-49e2-49dd-ae41-af335d10d1db',
      // 默认精灵帧
      defaultSpriteFrame: '7a5a0b4e-7a5a-4b4e-8a5a-0b4e7a5a4b4e'
    };
  }
}

module.exports = UuidUtils;
