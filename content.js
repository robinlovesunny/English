/**
 * Smart Hover Translator - Content Script
 * 实现鼠标悬停英文单词即时翻译功能
 */

(function() {
  'use strict';

  // ==================== 配置常量 ====================
  const POPUP_CLOSE_DELAY = 200;     // 浮窗关闭延迟（毫秒）
  const POPUP_MAX_WIDTH = 380;       // 浮窗最大宽度
  const POPUP_MAX_HEIGHT = 450;      // 浮窗最大高度
  const POPUP_Z_INDEX = 2147483647;  // 最高层级

  // 有效英文单词的正则表达式
  const WORD_REGEX = /^[a-zA-Z][a-zA-Z'-]*[a-zA-Z]$|^[a-zA-Z]$/;
  // 单词字符（用于边界检测）
  const WORD_CHAR_REGEX = /[a-zA-Z0-9'-]/;

  // 需要忽略的元素标签
  const IGNORE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'SVG'];
  // 需要忽略的可编辑元素
  const EDITABLE_ATTRS = ['contenteditable'];

  // ==================== 状态变量 ====================
  let settings = {
    enabled: true,
    blacklist: [],
    hoverDelay: 300  // 悬停防抖延迟（毫秒）
  };
  let popupHost = null;       // Shadow DOM 宿主元素
  let shadowRoot = null;      // Shadow Root
  let popupElement = null;    // 浮窗元素
  let debounceTimer = null;   // 防抖定时器
  let closeTimer = null;      // 关闭定时器
  let currentWord = null;     // 当前显示的单词
  let isMouseInPopup = false; // 鼠标是否在浮窗内
  let currentRequestId = 0;   // 当前翻译请求 ID（用于处理竞态条件）

  // ==================== 初始化 ====================
  
  /**
   * 初始化扩展
   */
  async function init() {
    // 获取设置
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      if (response && !response.error) {
        settings = { ...settings, ...response };
      }
    } catch (error) {
      console.error("获取设置失败:", error);
    }

    // 检查是否在黑名单中
    if (isBlacklisted()) {
      return;
    }

    // 创建 Shadow DOM
    createShadowDOM();

    // 绑定事件
    bindEvents();
  }

  /**
   * 检查当前网站是否在黑名单中
   */
  function isBlacklisted() {
    const hostname = window.location.hostname;
    return settings.blacklist.some(pattern => {
      if (pattern.startsWith('*.')) {
        return hostname.endsWith(pattern.slice(1)) || hostname === pattern.slice(2);
      }
      return hostname === pattern;
    });
  }

  /**
   * 创建 Shadow DOM 容器
   */
  function createShadowDOM() {
    popupHost = document.createElement('div');
    popupHost.id = 'smart-hover-translator-host';
    popupHost.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      z-index: ${POPUP_Z_INDEX};
      pointer-events: none;
    `;
    document.body.appendChild(popupHost);
    
    shadowRoot = popupHost.attachShadow({ mode: 'closed' });
    
    // 注入样式
    const style = document.createElement('style');
    style.textContent = getPopupStyles();
    shadowRoot.appendChild(style);
  }

  /**
   * 获取浮窗样式
   */
  function getPopupStyles() {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .translator-popup {
        position: fixed;
        max-width: ${POPUP_MAX_WIDTH}px;
        max-height: ${POPUP_MAX_HEIGHT}px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #333;
        overflow: hidden;
        pointer-events: auto;
        animation: fadeInUp 0.2s ease-out;
        z-index: ${POPUP_Z_INDEX};
      }

      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .popup-content {
        max-height: ${POPUP_MAX_HEIGHT - 20}px;
        overflow-y: auto;
        padding: 16px;
      }

      /* 自定义滚动条 */
      .popup-content::-webkit-scrollbar {
        width: 6px;
      }
      .popup-content::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
      }
      .popup-content::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 3px;
      }
      .popup-content::-webkit-scrollbar-thumb:hover {
        background: #a1a1a1;
      }

      .popup-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-bottom: 12px;
        border-bottom: 1px solid #eee;
        margin-bottom: 12px;
      }

      .word {
        font-size: 18px;
        font-weight: 600;
        color: #1a1a1a;
      }

      .phonetic {
        font-size: 14px;
        color: #666;
        font-family: "Lucida Sans Unicode", "Arial Unicode MS", sans-serif;
      }

      .audio-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.2s;
        margin-left: auto;
      }
      .audio-btn:hover {
        background: #f0f0f0;
      }
      .audio-btn:active {
        transform: scale(0.95);
      }

      .popup-body {
        margin-bottom: 12px;
      }

      .meaning {
        margin-bottom: 12px;
      }
      .meaning:last-child {
        margin-bottom: 0;
      }

      .pos {
        display: inline-block;
        padding: 2px 8px;
        background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
        color: #fff;
        font-size: 12px;
        font-weight: 500;
        border-radius: 4px;
        margin-bottom: 6px;
      }

      .def {
        font-size: 15px;
        color: #333;
        margin-bottom: 4px;
        padding-left: 8px;
        border-left: 2px solid #e0e0e0;
      }

      .example-sentence {
        font-size: 13px;
        color: #888;
        font-style: italic;
        padding-left: 8px;
        margin-top: 4px;
      }

      .popup-footer {
        padding-top: 12px;
        border-top: 1px solid #eee;
      }

      .detail-btn {
        width: 100%;
        padding: 10px 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .detail-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      .detail-btn:active {
        transform: translateY(0);
      }
      .detail-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }

      .detail-content {
        margin-top: 12px;
        padding: 12px;
        background: #f8f9fa;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.6;
        color: #444;
        white-space: pre-wrap;
      }

      /* 详细翻译区域的错误样式 */
      .detail-content .error {
        color: #e74c3c;
        font-size: 13px;
        margin: 0;
      }

      /* 详细翻译区域的强调样式 */
      .detail-content strong {
        color: #2c3e50;
        font-weight: 600;
      }

      /* 详细翻译区域的斜体样式（例句） */
      .detail-content em {
        color: #7f8c8d;
        font-style: italic;
      }

      .error-message {
        color: #e74c3c;
        text-align: center;
        padding: 20px;
      }

      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: #666;
      }
      .loading::after {
        content: '';
        width: 20px;
        height: 20px;
        border: 2px solid #ddd;
        border-top-color: #4a90d9;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-left: 10px;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
  }

  // ==================== 事件绑定 ====================

  /**
   * 绑定事件监听器
   */
  function bindEvents() {
    // 鼠标悬停事件（使用防抖）
    document.addEventListener('mouseover', handleMouseOver, true);
    
    // 鼠标移出事件
    document.addEventListener('mouseout', handleMouseOut, true);
    
    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hidePopup();
      }
    });
    
    // 页面滚动关闭
    document.addEventListener('scroll', () => {
      hidePopup();
    }, true);

    // 监听设置变化
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        if (changes.enabled !== undefined) {
          settings.enabled = changes.enabled.newValue;
        }
        if (changes.blacklist !== undefined) {
          settings.blacklist = changes.blacklist.newValue;
        }
        if (changes.hoverDelay !== undefined) {
          settings.hoverDelay = changes.hoverDelay.newValue;
        }
      }
    });
  }

  /**
   * 处理鼠标悬停事件
   */
  function handleMouseOver(event) {
    // 检查功能是否启用
    if (!settings.enabled) return;
    
    // 清除之前的防抖定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // 设置防抖，使用用户配置的 hoverDelay
    debounceTimer = setTimeout(() => {
      processHover(event);
    }, settings.hoverDelay || 300);
  }

  /**
   * 处理鼠标移出事件
   */
  function handleMouseOut(event) {
    // 如果移出的不是当前悬停的元素，忽略
    if (!popupElement) return;
    
    // 设置延迟关闭
    startCloseTimer();
  }

  /**
   * 启动关闭定时器
   */
  function startCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
    }
    closeTimer = setTimeout(() => {
      if (!isMouseInPopup) {
        hidePopup();
      }
    }, POPUP_CLOSE_DELAY);
  }

  /**
   * 取消关闭定时器
   */
  function cancelCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  // ==================== 单词提取 ====================

  /**
   * 处理悬停，提取单词并翻译
   */
  function processHover(event) {
    const target = event.target;
    
    // 检查是否应该忽略该元素
    if (shouldIgnoreElement(target)) {
      return;
    }
    
    // 获取光标位置的单词
    const word = getWordAtPoint(event.clientX, event.clientY);
    
    if (!word || word === currentWord) {
      return;
    }
    
    // 验证是否为有效英文单词
    if (!WORD_REGEX.test(word)) {
      return;
    }
    
    // 翻译单词
    translateWord(word, event.clientX, event.clientY);
  }

  /**
   * 检查元素是否应该被忽略
   */
  function shouldIgnoreElement(element) {
    if (!element) return true;
    
    // 检查是否是浮窗元素
    if (popupHost && popupHost.contains(element)) {
      return true;
    }
    
    // 检查标签名
    const tagName = element.tagName?.toUpperCase();
    if (IGNORE_TAGS.includes(tagName)) {
      return true;
    }
    
    // 检查可编辑属性
    for (const attr of EDITABLE_ATTRS) {
      if (element.hasAttribute && element.hasAttribute(attr)) {
        return true;
      }
    }
    
    // 检查祖先元素
    let parent = element.parentElement;
    while (parent) {
      const parentTag = parent.tagName?.toUpperCase();
      if (IGNORE_TAGS.includes(parentTag)) {
        return true;
      }
      for (const attr of EDITABLE_ATTRS) {
        if (parent.hasAttribute && parent.hasAttribute(attr)) {
          return true;
        }
      }
      parent = parent.parentElement;
    }
    
    return false;
  }

  /**
   * 获取指定坐标处的单词
   */
  function getWordAtPoint(x, y) {
    let range;
    
    // 使用 caretRangeFromPoint（Chrome）或 caretPositionFromPoint（Firefox）
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    }
    
    if (!range) return null;
    
    const node = range.startContainer;
    const offset = range.startOffset;
    
    // 确保是文本节点
    if (node.nodeType !== Node.TEXT_NODE) {
      return null;
    }
    
    const text = node.textContent;
    if (!text) return null;
    
    // 向左扩展找到单词开始
    let start = offset;
    while (start > 0 && WORD_CHAR_REGEX.test(text[start - 1])) {
      start--;
    }
    
    // 向右扩展找到单词结束
    let end = offset;
    while (end < text.length && WORD_CHAR_REGEX.test(text[end])) {
      end++;
    }
    
    // 提取单词
    const word = text.slice(start, end).trim();
    
    // 去除开头和结尾的连字符和撇号
    return word.replace(/^['-]+|['-]+$/g, '');
  }

  // ==================== 翻译功能 ====================

  /**
   * 翻译单词
   */
  async function translateWord(word, x, y) {
    // 递增请求 ID，用于处理竞态条件
    const requestId = ++currentRequestId;
    currentWord = word;
    
    // 显示加载状态
    showPopup(x, y, createLoadingContent());
    
    try {
      // 发送消息给 background script
      const result = await chrome.runtime.sendMessage({
        type: "TRANSLATE_WORD",
        word: word
      });
      
      // 检查是否仍是最新请求，避免旧请求覆盖新结果
      if (requestId !== currentRequestId) return;
      
      if (result.error) {
        showPopup(x, y, createErrorContent(result.error));
      } else {
        showPopup(x, y, createPopupContent(result));
      }
    } catch (error) {
      // 检查是否仍是最新请求
      if (requestId !== currentRequestId) return;
      
      console.error("翻译失败:", error);
      showPopup(x, y, createErrorContent("翻译失败，请重试"));
    }
  }

  // ==================== 浮窗管理 ====================

  /**
   * 创建加载中内容
   */
  function createLoadingContent() {
    return '<div class="loading">加载中</div>';
  }

  /**
   * 创建错误内容
   */
  function createErrorContent(message) {
    return `<div class="error-message">${escapeHtml(message)}</div>`;
  }

  /**
   * 创建浮窗内容
   */
  function createPopupContent(data) {
    let html = '<div class="popup-content">';
    
    // 头部：单词、音标、发音按钮
    html += '<div class="popup-header">';
    html += `<span class="word">${escapeHtml(data.word)}</span>`;
    if (data.phonetic) {
      html += `<span class="phonetic">${escapeHtml(data.phonetic)}</span>`;
    }
    html += `<button class="audio-btn" data-audio="${escapeHtml(data.audioUrl || '')}" data-word="${escapeHtml(data.word)}" title="发音">🔊</button>`;
    html += '</div>';
    
    // 主体：词义
    html += '<div class="popup-body">';
    if (data.meanings && data.meanings.length > 0) {
      for (const meaning of data.meanings) {
        html += '<div class="meaning">';
        html += `<span class="pos">${escapeHtml(meaning.partOfSpeech)}</span>`;
        for (const def of meaning.definitions) {
          html += `<p class="def">${escapeHtml(def.definition)}</p>`;
          if (def.example) {
            html += `<p class="example-sentence">"${escapeHtml(def.example)}"</p>`;
          }
        }
        html += '</div>';
      }
    } else {
      html += '<p class="def">暂无释义</p>';
    }
    html += '</div>';
    
    // 底部：详细翻译按钮
    html += '<div class="popup-footer">';
    html += `<button class="detail-btn" data-word="${escapeHtml(data.word)}">✨ 详细翻译</button>`;
    html += '<div class="detail-content" style="display:none;"></div>';
    html += '</div>';
    
    html += '</div>';
    
    return html;
  }

  /**
   * HTML 转义
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 格式化详细翻译文本为 HTML
   * 处理换行符、emoji 标题行和例句
   * @param {string} text - 模型返回的纯文本
   * @returns {string} - 格式化后的 HTML
   */
  function formatDetailText(text) {
    if (!text) return '';
    
    // 先进行 HTML 转义
    let html = escapeHtml(text);
    
    // 处理换行符
    html = html.replace(/\n/g, '<br>');
    
    // 处理 emoji 标题行（📖、🔤、📝、💡 开头的行加粗）
    html = html.replace(/(📖|🔤|📝|💡)([^<]*?)(<br>|$)/g, '<strong>$1$2</strong>$3');
    
    // 处理例句（带引号的英文句子用斜体）
    html = html.replace(/"([^"]+)"/g, '<em>"$1"</em>');
    
    return html;
  }

  /**
   * 显示浮窗
   */
  function showPopup(x, y, content) {
    // 移除旧的浮窗
    if (popupElement) {
      popupElement.remove();
    }
    
    // 创建新浮窗
    popupElement = document.createElement('div');
    popupElement.className = 'translator-popup';
    popupElement.innerHTML = content;
    
    // 添加到 Shadow DOM
    shadowRoot.appendChild(popupElement);
    
    // 绑定浮窗事件
    bindPopupEvents();
    
    // 计算位置
    positionPopup(x, y);
  }

  /**
   * 绑定浮窗内部事件
   */
  function bindPopupEvents() {
    if (!popupElement) return;
    
    // 鼠标进入浮窗
    popupElement.addEventListener('mouseenter', () => {
      isMouseInPopup = true;
      cancelCloseTimer();
    });
    
    // 鼠标离开浮窗
    popupElement.addEventListener('mouseleave', () => {
      isMouseInPopup = false;
      hidePopup();
    });
    
    // 发音按钮点击
    const audioBtn = popupElement.querySelector('.audio-btn');
    if (audioBtn) {
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const audioUrl = audioBtn.dataset.audio;
        const word = audioBtn.dataset.word;
        playAudio(audioUrl, word);
      });
    }
    
    // 详细翻译按钮点击
    const detailBtn = popupElement.querySelector('.detail-btn');
    if (detailBtn) {
      detailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = detailBtn.dataset.word;
        const detailContent = popupElement.querySelector('.detail-content');
        
        // 禁用按钮并显示加载状态
        detailBtn.disabled = true;
        detailBtn.textContent = '⏳ 翻译中...';
        
        // 显示详细翻译区域并清空内容
        if (detailContent) {
          detailContent.style.display = 'block';
          detailContent.innerHTML = '';
        }
        
        // 使用 Port 连接 background 进行流式通信
        let port;
        try {
          port = chrome.runtime.connect({ name: 'translate-detail' });
        } catch (error) {
          console.error('[Smart Hover Translator] 创建 Port 连接失败:', error);
          if (detailContent) {
            detailContent.innerHTML = '<p class="error">连接失败，请重试</p>';
          }
          detailBtn.textContent = '✨ 详细翻译';
          detailBtn.disabled = false;
          return;
        }
        
        let fullText = '';
        
        // 监听来自 background 的消息
        port.onMessage.addListener((msg) => {
          if (msg.type === 'chunk') {
            // 收到流式数据块，追加到完整文本
            fullText += msg.content;
            // 实时渲染到详细翻译区域
            if (detailContent) {
              detailContent.innerHTML = formatDetailText(fullText);
            }
          } else if (msg.type === 'done') {
            // 翻译完成
            detailBtn.textContent = '✨ 详细翻译';
            detailBtn.disabled = false;
            port.disconnect();
          } else if (msg.type === 'error') {
            // 发生错误
            if (detailContent) {
              detailContent.innerHTML = `<p class="error">${escapeHtml(msg.message)}</p>`;
            }
            detailBtn.textContent = '✨ 详细翻译';
            detailBtn.disabled = false;
            port.disconnect();
          }
        });
        
        // Port 断开时的处理
        port.onDisconnect.addListener(() => {
          // 如果按钮还在加载状态，说明是异常断开
          if (detailBtn.disabled) {
            detailBtn.textContent = '✨ 详细翻译';
            detailBtn.disabled = false;
          }
        });
        
        // 发送详细翻译请求
        port.postMessage({ type: 'TRANSLATE_DETAIL', word: word });
      });
    }
  }

  /**
   * 计算并设置浮窗位置
   */
  function positionPopup(x, y) {
    if (!popupElement) return;
    
    const padding = 10;
    const offsetY = 20; // 距离光标的垂直偏移
    
    // 获取视口尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 获取浮窗尺寸
    const popupRect = popupElement.getBoundingClientRect();
    const popupWidth = popupRect.width || POPUP_MAX_WIDTH;
    const popupHeight = popupRect.height || 200;
    
    // 计算位置
    let left = x + padding;
    let top = y + offsetY;
    
    // 右侧空间不足，向左偏移
    if (left + popupWidth > viewportWidth - padding) {
      left = viewportWidth - popupWidth - padding;
    }
    
    // 左侧边界检查
    if (left < padding) {
      left = padding;
    }
    
    // 下方空间不足，显示在上方
    if (top + popupHeight > viewportHeight - padding) {
      top = y - popupHeight - padding;
    }
    
    // 上方边界检查
    if (top < padding) {
      top = padding;
    }
    
    popupElement.style.left = `${left}px`;
    popupElement.style.top = `${top}px`;
  }

  /**
   * 隐藏浮窗
   */
  function hidePopup() {
    if (popupElement) {
      popupElement.remove();
      popupElement = null;
    }
    currentWord = null;
    isMouseInPopup = false;
    cancelCloseTimer();
  }

  // ==================== 发音功能 ====================

  /**
   * 播放发音
   */
  function playAudio(audioUrl, word) {
    if (audioUrl) {
      // 使用 Audio API 播放
      const audio = new Audio(audioUrl);
      audio.play().catch((error) => {
        console.error("播放音频失败:", error);
        // 回退到 SpeechSynthesis
        speakWord(word);
      });
    } else {
      // 使用 SpeechSynthesis API
      speakWord(word);
    }
  }

  /**
   * 使用语音合成朗读单词
   */
  function speakWord(word) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  }

  // ==================== 启动 ====================
  
  // 等待 DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
