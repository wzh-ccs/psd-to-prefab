'use strict';

const Path = require('path');
const Fs = require('fs');

module.exports = {
  load() {
    Editor.log('[psd-to-prefab] 插件已加载');
  },

  unload() {
    Editor.log('[psd-to-prefab] 插件已卸载');
  },

  messages: {
    'open'() {
      Editor.Panel.open('psd-to-prefab');
    },

    'psd-to-prefab:convert'(event, params) {
      const { psdPath, outputPath, options } = params;
      const PsdParser = require('./src/psd-parser');
      const PrefabBuilder = require('./src/prefab-builder');
      const ImageExporter = require('./src/image-exporter');
      const UuidUtils = require('./src/uuid-utils');

      Editor.log(`[psd-to-prefab] 开始转换: ${psdPath}`);

      try {
        // 步骤1: 解析 PSD
        Editor.log('[psd-to-prefab] 步骤1: 解析 PSD 文件...');
        const psdTree = PsdParser.parse(psdPath, {
          layerImages: true,
          onlyVisibleLayers: options.skipHiddenLayers || false
        });
        Editor.log(`[psd-to-prefab] PSD 解析完成: ${psdTree.document.width}x${psdTree.document.height}`);

        // 步骤2: 导出图层为 PNG（不生成 .meta 文件！让编辑器自动生成）
        Editor.log('[psd-to-prefab] 步骤2: 导出图层为 PNG...');
        const psdName = Path.basename(psdPath, '.psd');
        const exportDir = Path.join(outputPath, psdName, 'textures');

        if (!Fs.existsSync(exportDir)) {
          Fs.mkdirSync(exportDir, { recursive: true });
        }

        const exportedAssets = ImageExporter.exportLayers(psdTree, exportDir, psdTree.document);
        Editor.log(`[psd-to-prefab] 导出完成: ${exportedAssets.count} 个图层`);

        // 步骤3: 刷新 AssetDB，让编辑器自动生成 .meta 文件
        Editor.log('[psd-to-prefab] 步骤3: 刷新资源数据库...');
        Editor.assetdb.refresh('db://assets', () => {
          Editor.log('[psd-to-prefab] 资源刷新完成');

          // 步骤4: 构建 Prefab JSON
          // Sprite 组件不绑定 UUID，用户手动拖图片上去
          Editor.log('[psd-to-prefab] 步骤4: 构建 Prefab JSON...');
          const uuidMap = {}; // 空映射，Sprite 的 _spriteFrame 为 null
          const prefabJson = PrefabBuilder.build(psdTree, uuidMap, {
            psdWidth: psdTree.document.width,
            psdHeight: psdTree.document.height,
            prefabName: psdName,
            autoSize: options.autoSize || false,
            preserveOpacity: options.preserveOpacity || false,
            centerAnchor: options.centerAnchor !== false,
            skipHidden: options.skipHiddenLayers || false
          });

          // 步骤5: 保存 Prefab 文件
          Editor.log('[psd-to-prefab] 步骤5: 保存 Prefab 文件...');
          const prefabPath = Path.join(outputPath, psdName, `${psdName}.prefab`);
          const prefabDir = Path.dirname(prefabPath);
          if (!Fs.existsSync(prefabDir)) {
            Fs.mkdirSync(prefabDir, { recursive: true });
          }
          Fs.writeFileSync(prefabPath, JSON.stringify(prefabJson, null, 2));

          // 步骤6: 刷新整个 assets 目录让编辑器导入 Prefab
          Editor.assetdb.refresh('db://assets', () => {
            Editor.success(`[psd-to-prefab] ✅ 转换完成! 共 ${exportedAssets.count} 个图层`);
            Editor.log('[psd-to-prefab] 💡 Sprite 组件未绑定图片，请手动拖拽纹理到 Sprite 的 SpriteFrame 属性');
            event.reply(null, {
              success: true,
              prefabPath: prefabPath,
              layerCount: exportedAssets.count
            });
          });
        });

      } catch (error) {
        Editor.error(`[psd-to-prefab] 转换失败: ${error.message}`);
        Editor.error(error.stack);
        event.reply(null, { success: false, error: error.message });
      }
    },

    'psd-to-prefab:validate-psd'(event, psdPath) {
      try {
        const PSD = require('psd');
        const psd = PSD.fromFile(psdPath);
        psd.parse();
        const tree = psd.tree().export();
        const layerCount = countLayers(tree);
        Editor.log(`[psd-to-prefab] PSD 验证通过: ${tree.document.width}x${tree.document.height}, ${layerCount} 层`);
        event.reply(null, {
          valid: true,
          info: {
            width: tree.document.width,
            height: tree.document.height,
            layerCount: layerCount
          }
        });
      } catch (error) {
        Editor.warn(`[psd-to-prefab] PSD 验证失败: ${error.message}`);
        event.reply(null, { valid: false, error: error.message });
      }
    }
  }
};

function countLayers(tree) {
  let count = 0;
  if (tree.children) {
    tree.children.forEach(child => {
      count++;
      if (child.children) {
        count += countLayers(child);
      }
    });
  }
  return count;
}
