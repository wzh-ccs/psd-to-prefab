'use strict';

const UuidUtils = require('./uuid-utils');
const CoordinateConverter = require('./coordinate-converter');
const LayerProcessor = require('./layer-processor');

/**
 * Cocos Creator 2.4.x Prefab JSON 构建器
 *
 * Prefab 文件格式是一个 JSON 数组，包含：
 *   [0] cc.Prefab - Prefab 元信息
 *   [1] cc.Node - 根节点
 *   [2...] 子节点和组件（按深度优先顺序排列）
 *
 * 序列化顺序规则：
 *   1. cc.Prefab（数组第一个元素）
 *   2. cc.Node（根节点）
 *   3. 递归：对于每个节点，先序列化其子节点，再序列化其组件
 *   4. 每个节点的结束标志是 cc.PrefabInfo
 */
class PrefabBuilder {

  /**
   * 构建完整的 Prefab JSON
   *
   * @param {object} psdTree - 解析后的 PSD 树
   * @param {object} uuidMap - 图层名 → SpriteFrame UUID 的映射
   * @param {object} options - 构建选项
   * @returns {Array} Prefab JSON 数组
   */
  static build(psdTree, uuidMap, options = {}) {
    const docSize = CoordinateConverter.getDocumentSize(psdTree);
    this._idCounter = 0;
    this._prefabData = [];

    // 1. 构建 cc.Prefab 对象（索引 0）
    const prefabObj = this._buildPrefabRoot(options.prefabName || 'PsdPrefab');
    prefabObj._id = String(this._nextId());
    this._prefabData.push(prefabObj);
    const prefabId = parseInt(prefabObj._id);

    // 2. 构建根节点（索引 1）
    const rootNode = this._buildRootNode(psdTree.root, docSize, options);
    rootNode._id = String(this._nextId());
    this._prefabData.push(rootNode);
    const rootNodeId = parseInt(rootNode._id);

    // 3. 递归构建子节点树
    if (psdTree.root.children && psdTree.root.children.length > 0) {
      this._buildChildNodes(
        psdTree.root.children,
        rootNodeId,
        docSize,
        psdTree.root,  // 父图层数据（用于相对坐标计算）
        uuidMap,
        options
      );
    }

    // 4. 构建根节点的组件
    // 根节点通常不需要 Sprite 组件（除非根图层本身是图像图层）
    if (psdTree.root.type === 'layer') {
      const spriteFrameUuid = uuidMap[psdTree.root.name];
      if (spriteFrameUuid) {
        const spriteComp = this._buildSpriteComponent(
          rootNodeId,
          spriteFrameUuid,
          options
        );
        spriteComp._id = String(this._nextId());
        this._prefabData.push(spriteComp);
      }
    }

    // 5. 构建根节点的 PrefabInfo（节点结束标志）
    const rootPrefabInfo = this._buildPrefabInfo(rootNodeId, prefabId);
    rootPrefabInfo._id = String(this._nextId());
    this._prefabData.push(rootPrefabInfo);

    // 6. 后处理：建立正确的 __id__ 引用
    return this._postProcess(prefabId, rootNodeId);
  }

  /**
   * 构建 cc.Prefab 对象
   */
  static _buildPrefabRoot(name) {
    return {
      "__type__": "cc.Prefab",
      "_name": name,
      "_objFlags": 0,
      "_native": "",
      "data": null,  // 将在后处理中设置 __id__
      "optimizationPolicy": 0,
      "asyncLoadAssets": false,
      "readonly": false,
      "_id": "0"
    };
  }

  /**
   * 构建根节点
   */
  static _buildRootNode(rootLayer, docSize, options) {
    const coords = CoordinateConverter.convertLayer(
      rootLayer, docSize.height, null, options
    );

    return {
      "__type__": "cc.Node",
      "_name": rootLayer.name || "Root",
      "_objFlags": 0,
      "_parent": null,
      "_children": [],       // 将在后处理中填充
      "_active": true,
      "_components": [],     // 将在后处理中填充
      "_prefab": null,       // 将在后处理中设置
      "_lpos": {
        "__type__": "cc.Vec2",
        "x": coords.x,
        "y": coords.y
      },
      "_lrot": {
        "__type__": "cc.Vec2",
        "x": 0,
        "y": 0
      },
      "_lscale": {
        "__type__": "cc.Vec2",
        "x": 1,
        "y": 1
      },
      "_anchorPoint": {
        "__type__": "cc.Vec2",
        "x": coords.anchorPoint.x,
        "y": coords.anchorPoint.y
      },
      "_contentSize": {
        "__type__": "cc.Size",
        "width": coords.contentSize.width,
        "height": coords.contentSize.height
      },
      "_opacity": Math.round((rootLayer.opacity || 1) * 255),
      "_color": {
        "__type__": "cc.Color",
        "r": 255,
        "g": 255,
        "b": 255,
        "a": 255
      },
      "_cascadeOpacityEnabled": true,
      "_is3DNode": false,
      "_groupIndex": 0,
      "_trs": {
        "__type__": "TypedArray",
        "ctor": "Float64Array",
        "array": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
      },
      "_id": ""
    };
  }

  /**
   * 递归构建子节点
   * 深度优先遍历：先序列化子节点，再序列化组件
   */
  static _buildChildNodes(children, parentId, docSize, parentLayer, uuidMap, options) {
    for (const child of children) {
      // 跳过不可见图层（如果配置了）
      if (options.skipHidden && !child.visible) continue;

      const childCoords = CoordinateConverter.convertLayer(
        child, docSize.height, parentLayer, options
      );

      const nodeObj = this._buildNodeObject(child, childCoords, parentId, options);
      nodeObj._id = String(this._nextId());
      this._prefabData.push(nodeObj);
      const nodeId = parseInt(nodeObj._id);

      // 先递归处理子节点（深度优先）
      if (child.children && child.children.length > 0) {
        this._buildChildNodes(
          child.children,
          nodeId,
          docSize,
          child,
          uuidMap,
          options
        );
      }

      // 再添加组件
      // 如果是图层类型（非组），添加 Sprite 组件
      if (child.type === 'layer') {
        const spriteFrameUuid = uuidMap[child.name];
        if (spriteFrameUuid) {
          const spriteComp = this._buildSpriteComponent(
            nodeId, spriteFrameUuid, options
          );
          spriteComp._id = String(this._nextId());
          this._prefabData.push(spriteComp);
        }
      }

      // 处理文本图层：添加 Label 组件
      if (child.text && child.text.value) {
        const labelComp = this._buildLabelComponent(nodeId, child, options);
        labelComp._id = String(this._nextId());
        this._prefabData.push(labelComp);
      }

      // 节点结束标志：PrefabInfo
      const prefabInfo = this._buildPrefabInfo(nodeId, 0);
      prefabInfo._id = String(this._nextId());
      this._prefabData.push(prefabInfo);
    }
  }

  /**
   * 构建节点对象
   */
  static _buildNodeObject(layer, coords, parentId, options) {
    return {
      "__type__": "cc.Node",
      "_name": layer.name || "Layer",
      "_objFlags": 0,
      "_parent": { "__id__": parentId },
      "_children": [],
      "_active": layer.visible,
      "_components": [],
      "_prefab": { "__id__": 0 },  // 将在后处理中修正
      "_lpos": {
        "__type__": "cc.Vec2",
        "x": coords.x,
        "y": coords.y
      },
      "_lrot": {
        "__type__": "cc.Vec2",
        "x": 0,
        "y": 0
      },
      "_lscale": {
        "__type__": "cc.Vec2",
        "x": 1,
        "y": 1
      },
      "_anchorPoint": {
        "__type__": "cc.Vec2",
        "x": coords.anchorPoint.x,
        "y": coords.anchorPoint.y
      },
      "_contentSize": {
        "__type__": "cc.Size",
        "width": options.autoSize ? coords.contentSize.width : 0,
        "height": options.autoSize ? coords.contentSize.height : 0
      },
      "_opacity": options.preserveOpacity
        ? Math.round((layer.opacity || 1) * 255)
        : 255,
      "_color": {
        "__type__": "cc.Color",
        "r": 255,
        "g": 255,
        "b": 255,
        "a": 255
      },
      "_cascadeOpacityEnabled": true,
      "_is3DNode": false,
      "_groupIndex": 0,
      "_trs": {
        "__type__": "TypedArray",
        "ctor": "Float64Array",
        "array": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
      },
      "_id": ""
    };
  }

  /**
   * 构建 cc.Sprite 组件
   */
  static _buildSpriteComponent(nodeId, spriteFrameUuid, options) {
    return {
      "__type__": "cc.Sprite",
      "_name": "",
      "_objFlags": 0,
      "node": { "__id__": nodeId },
      "_enabled": true,
      "_materials": [{
        "__uuid__": UuidUtils.getBuiltinUuids().spriteMaterial
      }],
      "_srcBlendFactor": 2,    // SRC_ALPHA
      "_dstBlendFactor": 65026, // ONE_MINUS_SRC_ALPHA
      "_spriteFrame": {
        "__uuid__": spriteFrameUuid
      },
      "_type": 0,        // SIMPLE
      "_sizeMode": 0,    // CUSTOM (0) 或 TRIMMED (1)
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
   * 构建 cc.Label 组件（用于文本图层）
   */
  static _buildLabelComponent(nodeId, layer, options) {
    const textData = layer.text;
    const fontSizes = textData.font ? (textData.font.sizes || [24]) : [24];
    const fontColors = textData.font
      ? (textData.font.colors || [[255, 255, 255, 255]])
      : [[255, 255, 255, 255]];
    const fontName = textData.font ? textData.font.name : 'Arial';

    return {
      "__type__": "cc.Label",
      "_name": "",
      "_objFlags": 0,
      "node": { "__id__": nodeId },
      "_enabled": true,
      "_materials": [{
        "__uuid__": UuidUtils.getBuiltinUuids().spriteMaterial
      }],
      "_srcBlendFactor": 2,
      "_dstBlendFactor": 65026,
      "_string": textData.value || '',
      "_fontSize": fontSizes[0] || 24,
      "_lineHeight": (fontSizes[0] || 24) * 1.2,
      "_enableWrapText": true,
      "_N$string": textData.value || '',
      "_N$fontSize": fontSizes[0] || 24,
      "_N$lineHeight": (fontSizes[0] || 24) * 1.2,
      "_isSystemFontUsed": true,
      "_spacingX": 0,
      "_N$horizontalAlign": 1,  // Center
      "_N$verticalAlign": 1,    // Center
      "_N$fontFamily": fontName,
      "_N$overflow": 0,         // NONE
      "_id": ""
    };
  }

  /**
   * 构建 cc.PrefabInfo（节点结束标志）
   */
  static _buildPrefabInfo(nodeId, rootId) {
    return {
      "__type__": "cc.PrefabInfo",
      "root": { "__id__": rootId },
      "asset": { "__id__": 0 },
      "fileId": UuidUtils.generate(),
      "targetOverrides": null
    };
  }

  /**
   * 后处理：修正所有 __id__ 引用和 _children/_components 数组
   *
   * 关键：在 _buildChildNodes 中，__id__ 是临时 ID（连续自增数字）。
   * 但在 _postProcess 中，_id 被改为数组实际索引（字符串）。
   * 需要建立一个映射：临时ID → 最终数组索引。
   */
  static _postProcess(prefabId, rootId) {
    // 第一步：建立临时ID到最终数组索引的映射
    // 临时ID存储在 _id 中（1, 2, 3, ...）
    const tempIdToFinalIndex = {};

    this._prefabData.forEach((item, index) => {
      const tempId = parseInt(item._id) || 0;
      tempIdToFinalIndex[tempId] = index;
    });

    // 第二步：为每个元素分配实际数组索引作为 _id
    this._prefabData.forEach((item, index) => {
      item._id = String(index);
    });

    // 第三步：使用映射修正所有 __id__ 引用
    const remapId = (oldId) => {
      const mapped = tempIdToFinalIndex[oldId];
      return mapped !== undefined ? mapped : oldId;
    };

    // 修正 cc.Prefab.data 引用
    this._prefabData[0].data = { "__id__": remapId(rootId) };

    // 第四步：遍历所有元素，修正引用并收集节点关系
    const nodeMap = {};  // 最终索引 → 子节点最终索引列表
    const compMap = {};  // 最终索引 → 组件最终索引列表

    for (let i = 0; i < this._prefabData.length; i++) {
      const item = this._prefabData[i];

      if (item.__type__ === 'cc.Node') {
        const nid = i;
        nodeMap[nid] = nodeMap[nid] || [];

        // 修正 _parent.__id__
        if (item._parent && item._parent.__id__ !== undefined) {
          const oldPid = item._parent.__id__;
          const newPid = remapId(oldPid);
          item._parent = { "__id__": newPid };
          if (!nodeMap[newPid]) nodeMap[newPid] = [];
          nodeMap[newPid].push(nid);
        }
      }

      if (item.__type__ === 'cc.Sprite' || item.__type__ === 'cc.Label') {
        if (item.node && item.node.__id__ !== undefined) {
          const oldNid = item.node.__id__;
          const newNid = remapId(oldNid);
          item.node = { "__id__": newNid };
          if (!compMap[newNid]) compMap[newNid] = [];
          compMap[newNid].push(i);
        }
      }

      // 修正 PrefabInfo 中的 root 引用
      if (item.__type__ === 'cc.PrefabInfo') {
        if (item.root && item.root.__id__ !== undefined) {
          item.root = { "__id__": remapId(item.root.__id__) };
        }
      }
    }

    // 第五步：填充 _children 和 _components
    for (let i = 0; i < this._prefabData.length; i++) {
      const item = this._prefabData[i];

      if (item.__type__ === 'cc.Node') {
        item._children = (nodeMap[i] || []).map(id => ({ "__id__": id }));
        item._components = (compMap[i] || []).map(id => ({ "__id__": id }));
      }
    }

    // 第六步：修正每个节点的 _prefab 引用，指向其对应的 PrefabInfo
    for (let i = 0; i < this._prefabData.length; i++) {
      const item = this._prefabData[i];

      if (item.__type__ === 'cc.Node') {
        // PrefabInfo 是节点子树中最后一个 __type__ === 'cc.PrefabInfo' 的元素
        const prefabInfoIdx = this._findPrefabInfoForNode(i);
        if (prefabInfoIdx >= 0) {
          item._prefab = { "__id__": prefabInfoIdx };
        }
      }
    }

    return this._prefabData;
  }

  /**
   * 查找节点对应的 PrefabInfo 在数组中的索引
   */
  static _findPrefabInfoForNode(nodeIdx) {
    // 深度优先遍历：PrefabInfo 是节点子树中最后一个 __type__ === 'cc.PrefabInfo' 的元素
    for (let i = this._prefabData.length - 1; i > nodeIdx; i--) {
      if (this._prefabData[i].__type__ === 'cc.PrefabInfo') {
        return i;
      }
    }
    return -1;
  }

  static _nextId() {
    return ++this._idCounter;
  }
}

module.exports = PrefabBuilder;
