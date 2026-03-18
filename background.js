/**
 * Smart Hover Translator - Background Service Worker
 * 处理词典 API 调用和消息通信
 */

// 内存缓存，存储已查询过的单词结果
const wordCache = new Map();

// ==================== 模型 API 配置 ====================

/**
 * 默认 API 提供商配置
 * 所有提供商都使用 OpenAI 兼容的 Chat Completions 接口
 */
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

/**
 * 获取 API 配置
 * API Key 从 chrome.storage.local 读取（安全存储）
 * 其他设置从 chrome.storage.sync 读取
 * @returns {Promise<Object>} - { provider, baseUrl, model, apiKey }
 */
async function getApiConfig() {
  // 从 local 存储读取 API Key（安全存储）
  const localData = await new Promise((resolve) => {
    chrome.storage.local.get({ apiKey: '' }, resolve);
  });
  
  // 从 sync 存储读取其他设置
  const syncData = await new Promise((resolve) => {
    chrome.storage.sync.get({
      apiProvider: 'alibaba',
      customBaseUrl: '',
      modelName: ''  // 统一的模型名称字段
    }, resolve);
  });
  
  const provider = syncData.apiProvider;
  const providerConfig = DEFAULT_API_PROVIDERS[provider] || DEFAULT_API_PROVIDERS['alibaba'];
  
  // 如果是自定义提供商，使用用户设置的 baseUrl
  let baseUrl = providerConfig.baseUrl;
  if (provider === 'custom') {
    baseUrl = syncData.customBaseUrl || '';
  }
  
  // 优先使用存储中的 modelName，没有时才回退到默认模型
  let model = syncData.modelName || providerConfig.defaultModel;
  
  return {
    provider,
    baseUrl,
    model,
    apiKey: localData.apiKey
  };
}

/**
 * 隐藏 API Key 用于日志输出
 * @param {string} apiKey - 原始 API Key
 * @returns {string} - 隐藏后的 API Key（仅显示前4位）
 */
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 4) return '****';
  return apiKey.substring(0, 4) + '****';
}

/**
 * 调用模型 API 进行流式翻译
 * 使用 OpenAI 兼容的 Chat Completions 接口
 * @param {string} word - 要翻译的单词
 * @param {Function} sendStreamChunk - 发送流式数据块的回调函数
 */
async function callModelAPI(word, sendStreamChunk) {
  const config = await getApiConfig();
  
  // 检查 API Key 是否已配置
  if (!config.apiKey) {
    sendStreamChunk({ type: 'error', message: '请先在扩展设置中配置 API Key' });
    return;
  }
  
  // 检查 baseUrl 是否有效
  if (!config.baseUrl) {
    sendStreamChunk({ type: 'error', message: '请先配置 API 服务地址' });
    return;
  }
  
  // 检查 model 是否有效
  if (!config.model) {
    sendStreamChunk({ type: 'error', message: '请先配置模型名称' });
    return;
  }
  
  const url = `${config.baseUrl}/chat/completions`;
  
  console.log(`[Smart Hover Translator] 调用模型 API: ${config.provider}, 模型: ${config.model}, API Key: ${maskApiKey(config.apiKey)}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: '你是一个英语学习助手。用户会给你一个英文单词，请提供简洁实用的翻译信息。格式如下：\n\n📖 中文释义：（列出主要中文含义）\n🔤 词性：（标注词性）\n📝 常用例句：（给出2-3个实用例句，附中文翻译）\n💡 用法提示：（简要说明常见搭配或注意事项）'
          },
          {
            role: 'user',
            content: `请翻译这个英文单词：${word}`
          }
        ],
        stream: true,
        temperature: 0.3,
        max_tokens: 500
      })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Smart Hover Translator] API 请求失败: ${response.status}`, errorText);
      
      if (response.status === 401) {
        sendStreamChunk({ type: 'error', message: 'API Key 无效，请检查设置' });
      } else if (response.status === 429) {
        sendStreamChunk({ type: 'error', message: 'API 请求过于频繁，请稍后再试' });
      } else {
        sendStreamChunk({ type: 'error', message: `API 请求失败 (${response.status})` });
      }
      return;
    }
    
    // 流式读取 SSE 响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      // 解码并添加到缓冲区
      buffer += decoder.decode(value, { stream: true });
      
      // 按行处理 SSE 数据
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 最后一行可能不完整，保留到下次处理
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 跳过空行
        if (!trimmedLine) continue;
        
        // 检查是否是 SSE data 行
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6); // 去掉 'data: ' 前缀
          
          // 检查是否是结束标记
          if (data === '[DONE]') {
            continue;
          }
          
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            
            if (content) {
              sendStreamChunk({ type: 'chunk', content: content });
            }
          } catch (parseError) {
            // JSON 解析失败，可能是不完整的数据，忽略
            console.warn('[Smart Hover Translator] SSE 数据解析失败:', data);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Smart Hover Translator] 模型 API 调用失败:', error);
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      sendStreamChunk({ type: 'error', message: '网络连接失败，请检查网络' });
    } else {
      sendStreamChunk({ type: 'error', message: '翻译失败，请稍后重试' });
    }
  }
}

/**
 * 调用 Free Dictionary API 获取单词释义
 * @param {string} word - 要查询的单词
 * @returns {Promise<Object>} - 格式化后的单词数据
 */
async function fetchDictionaryData(word) {
  // 检查缓存
  if (wordCache.has(word.toLowerCase())) {
    return wordCache.get(word.toLowerCase());
  }

  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  
  try {
    const response = await fetch(url);
    
    if (response.status === 404) {
      return { error: "未收录该单词" };
    }
    
    if (!response.ok) {
      return { error: "网络错误" };
    }
    
    const data = await response.json();
    const result = parseApiResponse(data);
    
    // 存入缓存
    wordCache.set(word.toLowerCase(), result);
    
    return result;
  } catch (error) {
    console.error("Dictionary API error:", error);
    return { error: "网络错误" };
  }
}

/**
 * 解析 Free Dictionary API 返回的数据
 * @param {Array} data - API 返回的原始数据
 * @returns {Object} - 格式化后的单词数据
 */
function parseApiResponse(data) {
  if (!data || !data.length) {
    return { error: "未收录该单词" };
  }
  
  const entry = data[0];
  
  // 提取音标（优先美式音标）
  let phonetic = entry.phonetic || "";
  let audioUrl = "";
  
  if (entry.phonetics && entry.phonetics.length > 0) {
    // 优先查找美式音标（通常包含 -us 或来自美国的音频）
    for (const p of entry.phonetics) {
      if (p.audio && p.audio.includes("-us")) {
        phonetic = p.text || phonetic;
        audioUrl = p.audio;
        break;
      }
    }
    
    // 如果没找到美式，使用第一个有音频的
    if (!audioUrl) {
      for (const p of entry.phonetics) {
        if (p.audio) {
          audioUrl = p.audio;
          if (p.text) phonetic = p.text;
          break;
        }
      }
    }
    
    // 如果还是没有音标文本，使用第一个有文本的
    if (!phonetic) {
      for (const p of entry.phonetics) {
        if (p.text) {
          phonetic = p.text;
          break;
        }
      }
    }
  }
  
  // 提取词义
  const meanings = [];
  if (entry.meanings) {
    for (const meaning of entry.meanings) {
      const partOfSpeech = meaning.partOfSpeech || "";
      const definitions = [];
      
      if (meaning.definitions) {
        // 最多取前 3 个释义
        const defs = meaning.definitions.slice(0, 3);
        for (const def of defs) {
          definitions.push({
            definition: def.definition || "",
            example: def.example || ""
          });
        }
      }
      
      if (definitions.length > 0) {
        meanings.push({
          partOfSpeech,
          definitions
        });
      }
    }
  }
  
  return {
    word: entry.word || "",
    phonetic,
    audioUrl,
    meanings
  };
}

/**
 * 获取用户设置
 * @returns {Promise<Object>} - 用户设置对象
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      // 默认设置（使用新字段集合）
      enabled: true,
      blacklist: [],
      apiProvider: 'alibaba',
      customBaseUrl: '',
      modelName: '',
      hoverDelay: 300
    }, (settings) => {
      resolve(settings);
    });
  });
}

/**
 * 测试 API 连接
 * @param {Object} config - API 配置
 * @param {string} config.provider - 提供商
 * @param {string} config.baseUrl - API Base URL
 * @param {string} config.model - 模型名称
 * @param {string} config.apiKey - API Key
 * @returns {Promise<Object>} - { success: boolean, error?: string }
 */
async function testApiConnection(config) {
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 10
      })
    });

    if (response.ok) {
      return { success: true };
    } else {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data.error?.message || `HTTP ${response.status}` };
    }
  } catch (e) {
    console.error('[Smart Hover Translator] 测试 API 连接失败:', e);
    return { success: false, error: '网络连接失败' };
  }
}

/**
 * 模型 API 详细翻译（预留接口）
 * @param {string} word - 要翻译的单词
 * @returns {Promise<Object>} - 详细翻译结果
 */
async function translateWithModel(word) {
  const settings = await getSettings();
  
  if (!settings.apiKey) {
    return { error: "请先在设置中配置 API Key" };
  }
  
  // TODO: 后续 Task 实现模型 API 调用
  return { error: "请先在设置中配置 API Key" };
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 测试 API 连接
  if (message.type === 'TEST_API') {
    const config = message.config;
    testApiConnection(config)
      .then(sendResponse)
      .catch((error) => {
        console.error('Test API error:', error);
        sendResponse({ success: false, error: '网络连接失败' });
      });
    return true; // 异步 sendResponse
  }

  if (message.type === "TRANSLATE_WORD") {
    // 调用词典 API
    fetchDictionaryData(message.word)
      .then(sendResponse)
      .catch((error) => {
        console.error("Translation error:", error);
        sendResponse({ error: "翻译失败" });
      });
    return true; // 表示异步响应
  }
  
  if (message.type === "TRANSLATE_DETAIL") {
    // 调用模型 API（预留）
    translateWithModel(message.word)
      .then(sendResponse)
      .catch((error) => {
        console.error("Detail translation error:", error);
        sendResponse({ error: "详细翻译失败" });
      });
    return true;
  }
  
  if (message.type === "GET_SETTINGS") {
    // 返回设置
    getSettings()
      .then(sendResponse)
      .catch((error) => {
        console.error("Get settings error:", error);
        sendResponse({ error: "获取设置失败" });
      });
    return true;
  }
  
  return false;
});

// ==================== Port 连接监听（流式翻译） ====================

/**
 * 监听来自 content script 的 Port 连接
 * 用于处理详细翻译的流式通信
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'translate-detail') {
    console.log('[Smart Hover Translator] Port 连接已建立: translate-detail');
    
    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'TRANSLATE_DETAIL') {
        console.log('[Smart Hover Translator] 收到详细翻译请求:', msg.word);
        
        // 调用模型 API 进行流式翻译
        await callModelAPI(msg.word, (chunk) => {
          try {
            port.postMessage(chunk);
          } catch (error) {
            // Port 可能已断开
            console.warn('[Smart Hover Translator] Port 发送失败:', error);
          }
        });
        
        // 发送完成标记
        try {
          port.postMessage({ type: 'done' });
        } catch (error) {
          console.warn('[Smart Hover Translator] Port 发送完成标记失败:', error);
        }
      }
    });
    
    port.onDisconnect.addListener(() => {
      console.log('[Smart Hover Translator] Port 连接已断开: translate-detail');
    });
  }
});

// 扩展安装或更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("Smart Hover Translator 已安装");
    // 初始化默认设置（使用新字段集合）
    chrome.storage.sync.set({
      enabled: true,
      blacklist: [],
      apiProvider: 'alibaba',
      customBaseUrl: '',
      modelName: '',
      hoverDelay: 300
    });
  } else if (details.reason === "update") {
    console.log("Smart Hover Translator 已更新到版本", chrome.runtime.getManifest().version);
  }
});
