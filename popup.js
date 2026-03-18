/**
 * Smart Hover Translator - Popup Script
 * 弹出窗口交互逻辑
 */

// 默认 API 提供商配置（与 background.js 保持一致）
const DEFAULT_API_PROVIDERS = {
  'alibaba': {
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo'
  },
  'openai': {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini'
  },
  'deepseek': {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat'
  },
  'custom': {
    name: '自定义',
    baseUrl: '',
    defaultModel: ''
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // 获取 DOM 元素
  const enableToggle = document.getElementById('enableToggle');
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const providerName = document.getElementById('providerName');
  const modelName = document.getElementById('modelName');
  const apiKeyWarning = document.getElementById('apiKeyWarning');
  const openOptions = document.getElementById('openOptions');

  // 加载当前设置
  await loadSettings();

  // 监听开关变化
  enableToggle.addEventListener('change', async () => {
    const enabled = enableToggle.checked;
    try {
      await chrome.storage.sync.set({ enabled });
      updateStatusDisplay(enabled);
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  });

  // 打开设置页面
  openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  /**
   * 加载设置并更新显示
   */
  async function loadSettings() {
    try {
      // 从 sync 存储读取设置
      const syncData = await chrome.storage.sync.get({
        enabled: true,
        apiProvider: 'alibaba',
        customBaseUrl: '',
        modelName: ''  // 统一的模型名称字段
      });

      // 从 local 存储读取 API Key
      const localData = await chrome.storage.local.get({ apiKey: '' });

      // 更新开关状态
      enableToggle.checked = syncData.enabled;
      updateStatusDisplay(syncData.enabled);

      // 获取提供商信息
      const provider = syncData.apiProvider;
      const providerConfig = DEFAULT_API_PROVIDERS[provider] || DEFAULT_API_PROVIDERS['alibaba'];

      // 显示提供商名称
      providerName.textContent = providerConfig.name;

      // 显示模型名称（优先使用存储的值，否则用默认值）
      if (syncData.modelName) {
        modelName.textContent = syncData.modelName;
      } else if (provider === 'custom') {
        modelName.textContent = '未配置';
      } else {
        modelName.textContent = providerConfig.defaultModel;
      }

      // 检查 API Key 是否已配置
      if (!localData.apiKey) {
        apiKeyWarning.style.display = 'flex';
      } else {
        apiKeyWarning.style.display = 'none';
      }

    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  /**
   * 更新状态显示
   * @param {boolean} enabled - 是否启用
   */
  function updateStatusDisplay(enabled) {
    if (enabled) {
      statusText.textContent = '已启用';
      statusText.style.color = '#34c759';
      statusDot.className = 'status-dot enabled';
    } else {
      statusText.textContent = '已禁用';
      statusText.style.color = '#999';
      statusDot.className = 'status-dot disabled';
    }
  }
});
