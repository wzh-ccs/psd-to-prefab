'use strict';

const Fs = require('fs');
const Path = require('path');

Editor.Panel.extend({
  style: Fs.readFileSync(
    Editor.url('packages://psd-to-prefab/panel/style.css'),
    'utf-8'
  ),

  template: Fs.readFileSync(
    Editor.url('packages://psd-to-prefab/panel/index.html'),
    'utf-8'
  ),

  $: {
    psdPath: '#psd-path',
    outputPath: '#output-path',
    browsePsd: '#browse-psd',
    browseOutput: '#browse-output',
    convertBtn: '#convert-btn',
    skipHidden: '#skip-hidden',
    autoSize: '#auto-size',
    preserveOpacity: '#preserve-opacity',
    centerAnchor: '#center-anchor',
    psdInfo: '#psd-info',
    psdSize: '#psd-size',
    psdLayers: '#psd-layers',
    progressBar: '#progress-bar',
    progressFill: '#progress-fill',
    statusMsg: '#status-msg'
  },

  ready() {
    this._psdPath = '';
    this._outputPath = '';
    this._psdValid = false;

    // 浏览 PSD 文件
    this.$browsePsd.addEventListener('confirm', () => {
      this._openFileDialog('psd');
    });

    // 浏览输出目录
    this.$browseOutput.addEventListener('confirm', () => {
      this._openFileDialog('output');
    });

    // 转换按钮
    this.$convertBtn.addEventListener('confirm', () => {
      this._startConversion();
    });
  },

  messages: {
    'psd-to-prefab:conversion-progress'(event, progress) {
      this.$progressFill.style.width = progress.percent + '%';
      this.$statusMsg.innerText = progress.message;
    },

    'psd-to-prefab:conversion-complete'(event, result) {
      this.$progressBar.style.display = 'none';
      this.$statusMsg.innerText = result.success
        ? `转换完成! 共 ${result.layerCount} 个图层`
        : `转换失败: ${result.error}`;
      this.$convertBtn.disabled = false;
    }
  },

  _openFileDialog(type) {
    // Cocos Creator 2.4.x 使用 Electron 的 dialog
    const { dialog } = require('electron').remote;

    if (type === 'psd') {
      dialog.showOpenDialog({
        title: '选择 PSD 文件',
        filters: [
          { name: 'PSD 文件', extensions: ['psd'] }
        ],
        properties: ['openFile']
      }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
          this._psdPath = result.filePaths[0];
          this.$psdPath.value = this._psdPath;
          this._validatePsd(this._psdPath);
          this._updateConvertButton();
        }
      });
    } else {
      dialog.showOpenDialog({
        title: '选择输出目录',
        properties: ['openDirectory']
      }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
          this._outputPath = result.filePaths[0];
          this.$outputPath.value = this._outputPath;
          this._updateConvertButton();
        }
      });
    }
  },

  _validatePsd(psdPath) {
    this.$statusMsg.innerText = '验证 PSD 文件中...';

    Editor.Ipc.sendToMain('psd-to-prefab:validate-psd', psdPath, (error, result) => {
      if (error) {
        this._psdValid = false;
        this.$psdInfo.style.display = 'none';
        this.$statusMsg.innerText = `PSD 无效: ${error.message || error}`;
        this._updateConvertButton();
        return;
      }
      if (result && result.valid) {
        this._psdValid = true;
        this.$psdInfo.style.display = 'flex';
        this.$psdSize.innerText = `${result.info.width} x ${result.info.height}`;
        this.$psdLayers.innerText = `${result.info.layerCount}`;
        this.$statusMsg.innerText = 'PSD 文件有效';
      } else {
        this._psdValid = false;
        this.$psdInfo.style.display = 'none';
        this.$statusMsg.innerText = `PSD 无效: ${result ? result.error : '未知错误'}`;
      }
      this._updateConvertButton();
    });
  },

  _updateConvertButton() {
    this.$convertBtn.disabled = !(this._psdPath && this._outputPath && this._psdValid);
  },

  _startConversion() {
    this.$convertBtn.disabled = true;
    this.$progressBar.style.display = 'block';
    this.$progressFill.style.width = '0%';
    this.$statusMsg.innerText = '正在转换...';

    const params = {
      psdPath: this._psdPath,
      outputPath: this._outputPath,
      options: {
        skipHiddenLayers: this.$skipHidden.checked,
        autoSize: this.$autoSize.checked,
        preserveOpacity: this.$preserveOpacity.checked,
        centerAnchor: this.$centerAnchor.checked
      }
    };

    Editor.Ipc.sendToMain('psd-to-prefab:convert', params, (error, result) => {
      if (error) {
        this.$statusMsg.innerText = `转换失败: ${error.message || error}`;
        this.$convertBtn.disabled = false;
        this.$progressBar.style.display = 'none';
        return;
      }
      if (result && result.success) {
        this.$statusMsg.innerText = `转换完成! 共 ${result.layerCount} 个图层\nPrefab: ${result.prefabPath}`;
      } else {
        this.$statusMsg.innerText = `转换失败: ${result ? result.error : '未知错误'}`;
      }
      this.$convertBtn.disabled = false;
      this.$progressBar.style.display = 'none';
    });
  }
});
