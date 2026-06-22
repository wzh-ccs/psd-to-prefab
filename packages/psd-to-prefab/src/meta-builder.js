'use strict';

const UuidUtils = require('./uuid-utils');

/**
 * .meta 文件生成器
 *
 * Cocos Creator 2.4.x 中每个资源文件都需要对应的 .meta 文件。
 * 对于纹理资源，.meta 文件包含：
 *   - 顶层 uuid（Texture2D 资源的 UUID）
 *   - subMetas 中的 spriteFrame（cc.SpriteFrame 子资源 UUID）
 *
 * 注意：当通过 AssetDB.import 导入图片时，编辑器会自动生成 .meta 文件。
 * 但在某些场景下，可能需要手动生成 .meta 文件。
 */
class MetaBuilder {

  /**
   * 为纹理图片生成 .meta 文件内容
   * @param {string} textureUuid - 纹理 UUID（可选，自动生成）
   * @param {string} spriteFrameUuid - SpriteFrame UUID（可选，自动生成）
   * @param {object} options - 生成选项
   * @returns {object} meta 文件 JSON 对象
   */
  static buildTextureMeta(textureUuid, spriteFrameUuid, options = {}) {
    const uuid = textureUuid || UuidUtils.generate();
    const sfUuid = spriteFrameUuid || UuidUtils.generate();

    return {
      "ver": "1.0.2",
      "uuid": uuid,
      "type": "sprite",
      "subMetas": {
        [sfUuid]: {
          "uuid": sfUuid,
          "displayName": options.displayName || "spriteFrame",
          "assetType": "cc.SpriteFrame",
          "rect": {
            "x": options.rectX || 0,
            "y": options.rectY || 0,
            "width": options.width || 0,
            "height": options.height || 0
          },
          "offset": {
            "x": 0,
            "y": 0
          },
          "originalSize": {
            "width": options.width || 0,
            "height": options.height || 0
          },
          "rotated": false,
          "capInsets": [0, 0, 0, 0]
        }
      },
      "wrapMode": options.wrapMode || "clamp-to-edge",
      "filterMode": options.filterMode || "bilinear",
      "isUuid": true,
      "genMipmaps": false
    };
  }

  /**
   * 为文件夹生成 .meta 文件内容
   */
  static buildFolderMeta() {
    return {
      "ver": "1.0.1",
      "uuid": UuidUtils.generate(),
      "isGroup": true,
      "subMetas": {}
    };
  }

  /**
   * 为 Prefab 文件生成 .meta 文件内容
   */
  static buildPrefabMeta(uuid) {
    return {
      "ver": "1.1.27",
      "uuid": uuid || UuidUtils.generate(),
      "subMetas": {},
      "importer": "prefab",
      "imported": true
    };
  }
}

module.exports = MetaBuilder;
