'use strict';

const UuidUtils = require('./uuid-utils');
const CoordinateConverter = require('./coordinate-converter');

/**
 * Cocos Creator 2.4.x Prefab JSON 构建器
 *
 * 严格按照 Cocos Creator 2.4.11 的真实 Prefab 序列化格式生成 JSON。
 * 参考格式来自编辑器导出的真实 .prefab 文件。
 *
 * _trs 数组格式（10个元素）：
 *   [x, y, z, qx, qy, qz, qw, sx, sy, sz]
 *   位置(3) + 旋转四元数(4) + 缩放(3)
 */
class PrefabBuilder {

  static build(psdTree, uuidMap, options = {}) {
    const docSize = CoordinateConverter.getDocumentSize(psdTree);
    this._prefabData = [];

    // [0] cc.Prefab
    const prefabObj = {
      "__type__": "cc.Prefab",
      "_name": options.prefabName || 'PsdPrefab',
      "_objFlags": 0,
      "_native": "",
      "data": { "__id__": 1 },
      "optimizationPolicy": 0,
      "asyncLoadAssets": false,
      "readonly": false
    };
    this._prefabData.push(prefabObj);

    // [1] 根节点 cc.Node
    const rootCoords = CoordinateConverter.convertLayer(
      psdTree.root, docSize.height, null, options
    );
    const rootNode = this._buildNode(psdTree.root.name || 'Root', rootCoords, null, options);
    this._prefabData.push(rootNode);
    const rootNodeIndex = 1;

    // 递归构建子节点
    if (psdTree.root.children && psdTree.root.children.length > 0) {
      this._buildChildren(psdTree.root.children, rootNodeIndex, docSize, psdTree.root, uuidMap, options);
    }

    // 根节点的组件（仅当根节点本身是图层时）
    if (psdTree.root.type === 'layer') {
      const sfUuid = uuidMap[psdTree.root.name];
      if (sfUuid) {
        this._prefabData.push(this._buildSprite(rootNodeIndex, sfUuid));
      }
    }

    // 根节点的 PrefabInfo
    this._prefabData.push(this._buildPrefabInfo(rootNodeIndex));

    // 后处理：建立 _children 和 _components 引用
    this._linkReferences();

    return this._prefabData;
  }

  /**
   * 递归构建子节点
   */
  static _buildChildren(children, parentIndex, docSize, parentLayer, uuidMap, options) {
    for (const child of children) {
      if (options.skipHidden && !child.visible) continue;

      const coords = CoordinateConverter.convertLayer(
        child, docSize.height, parentLayer, options
      );

      // 创建节点
      const node = this._buildNode(child.name || 'Layer', coords, parentIndex, options);
      this._prefabData.push(node);
      const nodeIndex = this._prefabData.length - 1;

      // 递归处理子节点
      if (child.children && child.children.length > 0) {
        this._buildChildren(child.children, nodeIndex, docSize, child, uuidMap, options);
      }

      // 添加组件
      if (child.type === 'layer') {
        const sfUuid = uuidMap[child.name];
        if (sfUuid) {
          this._prefabData.push(this._buildSprite(nodeIndex, sfUuid));
        }
      }

      // 文本图层
      if (child.text && child.text.value) {
        this._prefabData.push(this._buildLabel(nodeIndex, child));
      }

      // PrefabInfo（节点结束标志）
      this._prefabData.push(this._buildPrefabInfo(nodeIndex));
    }
  }

  /**
   * 构建 cc.Node（严格按照 2.4.11 格式）
   * 关键：所有节点统一用 (0,0) 锚点计算坐标，避免居中锚点导致坐标错乱
   * 如果用户选了居中锚点，在 _anchorPoint 字段设置，但坐标不额外偏移
   */
  static _buildNode(name, coords, parentIndex, options) {
    const x = coords.x;
    const y = coords.y;

    const node = {
      "__type__": "cc.Node",
      "_name": name,
      "_objFlags": 0,
      "_parent": parentIndex !== null ? { "__id__": parentIndex } : null,
      "_children": [],
      "_active": true,
      "_components": [],
      "_prefab": null,
      "_opacity": 255,
      "_color": {
        "__type__": "cc.Color",
        "r": 255,
        "g": 255,
        "b": 255,
        "a": 255
      },
      "_contentSize": {
        "__type__": "cc.Size",
        "width": options.autoSize ? (coords.contentSize.width || 0) : 0,
        "height": options.autoSize ? (coords.contentSize.height || 0) : 0
      },
      "_anchorPoint": {
        "__type__": "cc.Vec2",
        "x": coords.anchorPoint.x,
        "y": coords.anchorPoint.y
      },
      "_trs": {
        "__type__": "TypedArray",
        "ctor": "Float64Array",
        "array": [x, y, 0, 0, 0, 0, 1, 1, 1, 1]
      },
      "_eulerAngles": {
        "__type__": "cc.Vec3",
        "x": 0,
        "y": 0,
        "z": 0
      },
      "_skewX": 0,
      "_skewY": 0,
      "_is3DNode": false,
      "_groupIndex": 0,
      "groupIndex": 0,
      "_id": ""
    };

    return node;
  }

  /**
   * 构建 cc.Sprite 组件
   */
  static _buildSprite(nodeIndex, spriteFrameUuid) {
    return {
      "__type__": "cc.Sprite",
      "_name": "",
      "_objFlags": 0,
      "node": { "__id__": nodeIndex },
      "_enabled": true,
      "_materials": [{
        "__uuid__": "eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432"
      }],
      "_srcBlendFactor": 770,
      "_dstBlendFactor": 771,
      "_spriteFrame": {
        "__uuid__": spriteFrameUuid,
        "__expectedType__": "cc.SpriteFrame"
      },
      "_type": 0,
      "_sizeMode": 0,
      "_fillType": 0,
      "_fillCenter": {
        "__type__": "cc.Vec2",
        "x": 0,
        "y": 0
      },
      "_fillStart": 0,
      "_fillRange": 0,
      "_isTrimmedMode": true,
      "_useGrayscale": false,
      "_atlas": null,
      "_id": ""
    };
  }

  /**
   * 构建 cc.Label 组件
   */
  static _buildLabel(nodeIndex, layer) {
    const textData = layer.text;
    const fontSizes = textData.font ? (textData.font.sizes || [24]) : [24];
    const fontName = textData.font ? textData.font.name : 'Arial';
    const fontSize = fontSizes[0] || 24;

    return {
      "__type__": "cc.Label",
      "_name": "",
      "_objFlags": 0,
      "node": { "__id__": nodeIndex },
      "_enabled": true,
      "_materials": [{
        "__uuid__": "eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432"
      }],
      "_srcBlendFactor": 770,
      "_dstBlendFactor": 771,
      "_string": textData.value || '',
      "_N$string": textData.value || '',
      "_fontSize": fontSize,
      "_N$fontSize": fontSize,
      "_lineHeight": Math.round(fontSize * 1.2),
      "_N$lineHeight": Math.round(fontSize * 1.2),
      "_enableWrapText": true,
      "_N$enableWrapText": true,
      "_isSystemFontUsed": true,
      "_N$isSystemFontUsed": true,
      "_spacingX": 0,
      "_N$spacingX": 0,
      "_N$horizontalAlign": 1,
      "_N$verticalAlign": 1,
      "_N$fontFamily": fontName,
      "_N$overflow": 0,
      "_id": ""
    };
  }

  /**
   * 构建 cc.PrefabInfo（严格按照 2.4.11 格式）
   */
  static _buildPrefabInfo(nodeIndex) {
    return {
      "__type__": "cc.PrefabInfo",
      "root": { "__id__": 1 },  // 指向根节点
      "asset": { "__id__": 0 }, // 指向 cc.Prefab
      "fileId": UuidUtils.generateShortId(),
      "sync": false
    };
  }

  /**
   * 后处理：建立 _children、_components、_prefab 引用
   */
  static _linkReferences() {
    const childrenMap = {}; // nodeIndex → [childIndex, ...]
    const componentsMap = {}; // nodeIndex → [compIndex, ...]

    // 收集关系
    for (let i = 1; i < this._prefabData.length; i++) {
      const item = this._prefabData[i];

      if (item.__type__ === 'cc.Node') {
        // 收集父→子关系
        if (item._parent && item._parent.__id__ !== undefined) {
          const pid = item._parent.__id__;
          if (!childrenMap[pid]) childrenMap[pid] = [];
          childrenMap[pid].push(i);
        }
      }

      if (item.__type__ === 'cc.Sprite' || item.__type__ === 'cc.Label') {
        // 收集节点→组件关系
        if (item.node && item.node.__id__ !== undefined) {
          const nid = item.node.__id__;
          if (!componentsMap[nid]) componentsMap[nid] = [];
          componentsMap[nid].push(i);
        }
      }
    }

    // 填充 _children 和 _components
    for (let i = 0; i < this._prefabData.length; i++) {
      const item = this._prefabData[i];
      if (item.__type__ === 'cc.Node') {
        item._children = (childrenMap[i] || []).map(id => ({ "__id__": id }));
        item._components = (componentsMap[i] || []).map(id => ({ "__id__": id }));
      }
    }

    // 填充 _prefab（每个节点指向它对应的 PrefabInfo）
    // PrefabInfo 紧跟在节点的所有子节点和组件之后
    for (let i = 0; i < this._prefabData.length; i++) {
      const item = this._prefabData[i];
      if (item.__type__ === 'cc.Node') {
        // 向后查找最近的 PrefabInfo
        for (let j = i + 1; j < this._prefabData.length; j++) {
          if (this._prefabData[j].__type__ === 'cc.PrefabInfo') {
            item._prefab = { "__id__": j };
            break;
          }
        }
      }
    }
  }
}

module.exports = PrefabBuilder;
