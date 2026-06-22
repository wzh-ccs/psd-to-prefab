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
        // 直接刷新整个 assets 目录，避免路径计算错误
        Editor.assetdb.refresh('db://assets', () => {
          Editor.log('[psd-to-prefab] 资源刷新完成，查询 UUID...');

          // 步骤4: 查询每张图的 SpriteFrame UUID
          const uuidMap = {};
          // 构建 textures 目录的 db:// URL 用于查询 UUID
          const assetsIndex = exportDir.indexOf('/assets/');
          let texturesDbUrl;
          if (assetsIndex >= 0) {
            texturesDbUrl = 'db://' + exportDir.substring(assetsIndex + 1);
          } else {
            texturesDbUrl = 'db://assets/' + psdName + '/textures';
          }

          // 用 layerNames（PSD图层名）作为 key，和 prefab-builder 匹配
          exportedAssets.layerNames.forEach((layerName, index) => {
            const fileName = exportedAssets.fileNames[index];
            const textureUrl = `${texturesDbUrl}/${fileName}`;
            const textureUuid = Editor.assetdb.urlToUuid(textureUrl);

            if (textureUuid) {
              // 查询 SpriteFrame 子资源的 UUID
              // Cocos Creator 2.4.x 中，PNG 导入后生成 Texture2D(主) + SpriteFrame(子)
              // SpriteFrame 子资源的 URL 格式是 textureUrl + '/spriteFrame' 
              // 或者通过 assetInfo 获取
              let sfUuid = textureUuid;
              try {
                const info = Editor.assetdb.assetInfo(textureUrl);
                if (info && info.subAssets) {
                  // 找到 cc.SpriteFrame 类型的子资源
                  for (const key in info.subAssets) {
                    const sub = info.subAssets[key];
                    if (sub.type === 'sprite-frame' || sub.type === 'cc.SpriteFrame') {
                      sfUuid = sub.uuid;
                      break;
                    }
                  }
                }
              } catch (e) {
                // 如果查不到子资源，用纹理 UUID（配合 __expectedType__ 也能工作）
              }

              uuidMap[layerName] = sfUuid;
              Editor.log(`[psd-to-prefab] ${layerName} → ${sfUuid}`);
            } else {
              uuidMap[layerName] = UuidUtils.generate();
              Editor.warn(`[psd-to-prefab] ${layerName} UUID 未找到，使用随机值`);
            }
          });

          // 步骤5: 构建 Prefab JSON
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

          // 步骤6: 保存 Prefab 文件（不写 .meta 文件！）
          Editor.log('[psd-to-prefab] 步骤5: 保存 Prefab 文件...');
          const prefabPath = Path.join(outputPath, psdName, `${psdName}.prefab`);
          const prefabDir = Path.dirname(prefabPath);
          if (!Fs.existsSync(prefabDir)) {
            Fs.mkdirSync(prefabDir, { recursive: true });
          }
          Fs.writeFileSync(prefabPath, JSON.stringify(prefabJson, null, 2));

          // 步骤7: 刷新整个 assets 目录让编辑器导入 Prefab
          Editor.assetdb.refresh('db://assets', () => {
            Editor.success(`[psd-to-prefab] ✅ 转换完成! 共 ${exportedAssets.count} 个图层`);
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
