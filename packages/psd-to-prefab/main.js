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
    // 打开面板
    'open'() {
      Editor.Panel.open('psd-to-prefab');
    },

    // 处理 PSD 转换请求（从面板发来）
    'psd-to-prefab:convert'(event, params) {
      const { psdPath, outputPath, options } = params;

      // 在主进程中执行 PSD 解析和 Prefab 生成
      const PsdParser = require('./src/psd-parser');
      const PrefabBuilder = require('./src/prefab-builder');
      const ImageExporter = require('./src/image-exporter');
      const MetaBuilder = require('./src/meta-builder');
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

        // 步骤2: 导出图层为 PNG
        Editor.log('[psd-to-prefab] 步骤2: 导出图层为 PNG...');
        const psdName = Path.basename(psdPath, '.psd');
        const exportDir = Path.join(outputPath, psdName, 'textures');

        // 确保目录存在
        if (!Fs.existsSync(exportDir)) {
          Fs.mkdirSync(exportDir, { recursive: true });
        }

        const exportedAssets = ImageExporter.exportLayers(
          psdTree,
          exportDir,
          psdTree.document
        );

        Editor.log(`[psd-to-prefab] 导出完成: ${exportedAssets.count} 个图层`);

        // 步骤3: 生成 UUID 映射表（用于 Prefab 引用）
        // 在独立环境中，我们手动为每个导出的图片生成 UUID
        Editor.log('[psd-to-prefab] 步骤3: 生成资源 UUID 映射...');
        const uuidMap = {};

        // 使用图层名作为 key，生成 UUID
        exportedAssets.fileNames.forEach((fileName, index) => {
          const layerName = Path.basename(fileName, '.png');
          // 为每个纹理资源生成一个稳定的 UUID
          const sfUuid = UuidUtils.generate();
          uuidMap[layerName] = sfUuid;

          // 生成对应的 .meta 文件
          const metaContent = MetaBuilder.buildTextureMeta(
            UuidUtils.generate(),
            sfUuid,
            {
              displayName: layerName,
              width: 0,
              height: 0
            }
          );
          const metaPath = exportedAssets.filePaths[index] + '.meta';
          Fs.writeFileSync(metaPath, JSON.stringify(metaContent, null, 2));
        });

        Editor.log(`[psd-to-prefab] UUID 映射生成完成: ${Object.keys(uuidMap).length} 个资源`);

        // 步骤4: 构建 Prefab JSON
        Editor.log('[psd-to-prefab] 步骤4: 构建 Prefab JSON...');
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

        // 生成 Prefab 的 .meta 文件
        const prefabMeta = MetaBuilder.buildPrefabMeta(UuidUtils.generate());
        Fs.writeFileSync(prefabPath + '.meta', JSON.stringify(prefabMeta, null, 2));

        Editor.log(`[psd-to-prefab] 转换完成! Prefab: ${prefabPath}`);
        Editor.success(`[psd-to-prefab] ✅ 转换完成! 共 ${exportedAssets.count} 个图层，Prefab 已保存到: ${prefabPath}`);

        event.reply(null, {
          success: true,
          prefabPath: prefabPath,
          layerCount: exportedAssets.count
        });

      } catch (error) {
        Editor.error(`[psd-to-prefab] 转换失败: ${error.message}`);
        Editor.error(error.stack);
        event.reply(null, { success: false, error: error.message });
      }
    },

    // 验证 PSD 文件
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

/**
 * 递归计算图层数量
 */
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
