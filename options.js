/**
 * Smart Hover Translator - Options Script
 * 设置页面交互逻辑
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

// 当前黑名单列表
let blacklist = [];

document.addEventListener('DOMContentLoaded', async () => {
  // 获取 DOM 元素
  const providerRadios = document.querySelectorAll('input[name="apiProvider"]');
  const baseUrlInput = document.getElementById('baseUrl');
  const baseUrlHint = document.getElementById('baseUrlHint');
  const modelNameInput = document.getElementById('modelName');
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const eyeIcon = document.getElementById('eyeIcon');
  const testApiBtn = document.getElementById('testApiBtn');
  const testResult = document.getElementById('testResult');
  const hoverDelayInput = document.getElementById('hoverDelay');
  const hoverDelayValue = document.getElementById('hoverDelayValue');
  const blacklistInput = document.getElementById('blacklistInput');
  const addBlacklistBtn = document.getElementById('addBlacklistBtn');
  const blacklistError = document.getElementById('blacklistError');
  const blacklistContainer = document.getElementById('blacklistContainer');
  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');

  // 加载设置
  await loadSettings();

  // 监听 API 提供商变化
  providerRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateProviderFields(radio.value);
    });
  });

  // 切换 API Key 可见性
  toggleApiKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      eyeIcon.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      eyeIcon.textContent = '👁';
    }
  });

  // 测试 API 连接
  testApiBtn.addEventListener('click', testApiConnection);

  // 悬停延迟滑块
  hoverDelayInput.addEventListener('input', () => {
    hoverDelayValue.textContent = `${hoverDelayInput.value}ms`;
  });

  // 添加黑名单
  addBlacklistBtn.addEventListener('click', addToBlacklist);
  blacklistInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addToBlacklist();
    }
  });

  // 保存设置
  saveBtn.addEventListener('click', saveSettings);

  /**
   * 加载设置
   */
  async function loadSettings() {
    try {
      // 从 sync 存储读取设置
      const syncData = await chrome.storage.sync.get({
        apiProvider: 'alibaba',
        customBaseUrl: '',
        modelName: '',  // 统一的模型名称字段
        hoverDelay: 300,
        blacklist: []
      });

      // 从 local 存储读取 API Key
      const localData = await chrome.storage.local.get({ apiKey: '' });

      // 设置 API 提供商
      const providerRadio = document.querySelector(`input[name="apiProvider"][value="${syncData.apiProvider}"]`);
      if (providerRadio) {
        providerRadio.checked = true;
        updateProviderFields(syncData.apiProvider, syncData.customBaseUrl, syncData.modelName);
      }

      // 设置 API Key
      apiKeyInput.value = localData.apiKey;

      // 设置悬停延迟
      hoverDelayInput.value = syncData.hoverDelay;
      hoverDelayValue.textContent = `${syncData.hoverDelay}ms`;

      // 设置黑名单
      blacklist = syncData.blacklist || [];
      renderBlacklist();

    } catch (error) {
      console.error('加载设置失败:', error);
      showSaveStatus('加载设置失败', 'error');
    }
  }

  /**
   * 更新 API 提供商相关字段
   * @param {string} provider - 提供商 ID
   * @param {string} customBaseUrl - 自定义 baseUrl（可选）
   * @param {string} storedModelName - 存储的模型名称（可选）
   */
  function updateProviderFields(provider, customBaseUrl = '', storedModelName = '') {
    const config = DEFAULT_API_PROVIDERS[provider];
    
    if (provider === 'custom') {
      // 自定义模式：baseUrl 和 model 可编辑
      baseUrlInput.value = customBaseUrl;
      baseUrlInput.disabled = false;
      baseUrlInput.placeholder = 'https://api.example.com/v1';
      baseUrlHint.textContent = '请输入 API 服务地址';
      
      // 自定义模式使用存储的模型名称
      modelNameInput.value = storedModelName;
      modelNameInput.placeholder = '请输入模型名称';
    } else {
      // 预设提供商：baseUrl 只读，model 可编辑
      baseUrlInput.value = config.baseUrl;
      baseUrlInput.disabled = true;
      baseUrlHint.textContent = '预设提供商的 API 地址，不可修改';
      
      // 优先使用存储的模型名称，否则使用默认值
      modelNameInput.value = storedModelName || config.defaultModel;
      modelNameInput.placeholder = config.defaultModel;
    }
  }

  /**
   * 测试 API 连接
   */
  async function testApiConnection() {
    // 获取当前配置
    const provider = document.querySelector('input[name="apiProvider"]:checked')?.value;
    const baseUrl = baseUrlInput.value.trim();
    const model = modelNameInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    // 验证必填字段
    if (!baseUrl) {
      showTestResult('请先填写 API Base URL', 'error');
      return;
    }
    if (!model) {
      showTestResult('请先填写模型名称', 'error');
      return;
    }
    if (!apiKey) {
      showTestResult('请先填写 API Key', 'error');
      return;
    }

    // 显示加载状态
    testApiBtn.disabled = true;
    testApiBtn.textContent = '测试中...';
    showTestResult('正在测试连接...', 'loading');

    try {
      // 发送测试请求到 background.js
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_API',
        config: {
          provider,
          baseUrl,
          model,
          apiKey
        }
      });

      if (response.success) {
        showTestResult('✅ 连接成功！API 配置有效', 'success');
      } else {
        showTestResult(`❌ 连接失败：${response.error || '未知错误'}`, 'error');
      }
    } catch (error) {
      console.error('测试连接失败:', error);
      showTestResult('❌ 测试失败：无法与扩展通信', 'error');
    } finally {
      testApiBtn.disabled = false;
      testApiBtn.textContent = '测试连接';
    }
  }

  /**
   * 显示测试结果
   * @param {string} message - 消息内容
   * @param {string} type - 类型：success / error / loading
   */
  function showTestResult(message, type) {
    testResult.textContent = message;
    testResult.className = `test-result ${type}`;
  }

  /**
   * 添加到黑名单
   */
  function addToBlacklist() {
    const domain = blacklistInput.value.trim().toLowerCase();
    
    // 清除之前的错误
    blacklistError.textContent = '';

    // 验证域名格式
    if (!domain) {
      return;
    }

    // 简单的域名格式验证
    const domainRegex = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
    if (!domainRegex.test(domain)) {
      blacklistError.textContent = '请输入有效的域名格式';
      return;
    }

    // 检查是否已存在
    if (blacklist.includes(domain)) {
      blacklistError.textContent = '该域名已在黑名单中';
      return;
    }

    // 添加到列表
    blacklist.push(domain);
    blacklistInput.value = '';
    renderBlacklist();
  }

  /**
   * 从黑名单移除
   * @param {string} domain - 要移除的域名
   */
  function removeFromBlacklist(domain) {
    blacklist = blacklist.filter(d => d !== domain);
    renderBlacklist();
  }

  /**
   * 渲染黑名单列表
   */
  function renderBlacklist() {
    if (blacklist.length === 0) {
      blacklistContainer.innerHTML = '<div class="blacklist-empty">暂无黑名单域名</div>';
      return;
    }

    blacklistContainer.innerHTML = blacklist.map(domain => `
      <div class="blacklist-item">
        <span class="blacklist-domain">${domain}</span>
        <button type="button" class="blacklist-remove" data-domain="${domain}">删除</button>
      </div>
    `).join('');

    // 绑定删除按钮事件
    blacklistContainer.querySelectorAll('.blacklist-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        removeFromBlacklist(btn.dataset.domain);
      });
    });
  }

  /**
   * 保存设置
   */
  async function saveSettings() {
    try {
      // 获取当前配置
      const provider = document.querySelector('input[name="apiProvider"]:checked')?.value || 'alibaba';
      const baseUrl = baseUrlInput.value.trim();
      const model = modelNameInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      const hoverDelay = parseInt(hoverDelayInput.value, 10);

      // 保存到 sync 存储
      await chrome.storage.sync.set({
        apiProvider: provider,
        customBaseUrl: provider === 'custom' ? baseUrl : '',
        modelName: model,  // 统一保存模型名
        hoverDelay,
        blacklist
      });

      // 保存 API Key 到 local 存储（安全）
      await chrome.storage.local.set({ apiKey });

      // 显示成功提示
      showSaveStatus('✅ 设置已保存', 'success');

    } catch (error) {
      console.error('保存设置失败:', error);
      showSaveStatus('保存失败', 'error');
    }
  }

  /**
   * 显示保存状态
   * @param {string} message - 消息内容
   * @param {string} type - 类型：success / error
   */
  function showSaveStatus(message, type) {
    saveStatus.textContent = message;
    saveStatus.className = `save-status ${type}`;

    // 3 秒后隐藏
    setTimeout(() => {
      saveStatus.className = 'save-status';
    }, 3000);
  }
});
