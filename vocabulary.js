/**
 * Smart Hover Translator - Vocabulary Script
 * 生词本页面交互逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  // ==================== 状态变量 ====================
  let allWords = [];
  let dueWords = [];
  let currentReviewIndex = 0;
  let reviewStats = { remembered: 0, forgotten: 0 };
  let wordToDelete = null;

  // ==================== DOM 元素 ====================
  const tabs = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const backBtn = document.getElementById('backBtn');

  // 统计元素
  const totalCountEl = document.getElementById('totalCount');
  const dueCountEl = document.getElementById('dueCount');
  const masteredCountEl = document.getElementById('masteredCount');
  const reviewBadgeEl = document.getElementById('reviewBadge');

  // 复习相关元素
  const reviewIntro = document.getElementById('reviewIntro');
  const reviewCard = document.getElementById('reviewCard');
  const reviewComplete = document.getElementById('reviewComplete');
  const startReviewBtn = document.getElementById('startReviewBtn');
  const showAnswerBtn = document.getElementById('showAnswerBtn');
  const reviewButtons = document.getElementById('reviewButtons');
  const rememberedBtn = document.getElementById('rememberedBtn');
  const forgottenBtn = document.getElementById('forgottenBtn');
  const finishReviewBtn = document.getElementById('finishReviewBtn');

  // 单词列表相关元素
  const wordList = document.getElementById('wordList');
  const pendingList = document.getElementById('pendingList');
  const searchInput = document.getElementById('searchInput');
  const familiarityFilter = document.getElementById('familiarityFilter');
  const stageFilter = document.getElementById('stageFilter');
  const emptyState = document.getElementById('emptyState');
  const pendingEmptyState = document.getElementById('pendingEmptyState');

  // 删除确认弹窗
  const deleteModal = document.getElementById('deleteModal');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  // ==================== 初始化 ====================

  await loadData();
  setupEventListeners();

  // ==================== 数据加载 ====================

  async function loadData() {
    try {
      // 获取所有生词
      const vocabResponse = await chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' });
      if (vocabResponse.success) {
        allWords = vocabResponse.words;
      }

      // 获取今日待复习
      const reviewResponse = await chrome.runtime.sendMessage({ type: 'GET_TODAY_REVIEW' });
      if (reviewResponse.success) {
        dueWords = reviewResponse.words;
      }

      // 获取统计信息
      const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_VOCABULARY_STATS' });
      if (statsResponse.success) {
        updateStats(statsResponse);
      }

      // 更新 UI
      updateReviewIntro();
      renderWordList();
      renderPendingList();
    } catch (error) {
      console.error('[Smart Hover Translator] 加载数据失败:', error);
    }
  }

  function updateStats(stats) {
    totalCountEl.textContent = stats.total || 0;
    dueCountEl.textContent = stats.dueToday || 0;
    masteredCountEl.textContent = stats.mastered || 0;
    reviewBadgeEl.textContent = stats.dueToday || 0;

    // 如果没有待复习单词，隐藏徽章
    if (!stats.dueToday) {
      reviewBadgeEl.style.display = 'none';
    }
  }

  function updateReviewIntro() {
    const reviewCountEl = document.getElementById('reviewCount');
    reviewCountEl.textContent = dueWords.length;

    if (dueWords.length === 0) {
      startReviewBtn.disabled = true;
      startReviewBtn.textContent = '今日无复习任务';
    } else {
      startReviewBtn.disabled = false;
      startReviewBtn.textContent = '开始复习';
    }
  }

  // ==================== 事件监听 ====================

  function setupEventListeners() {
    // 标签页切换
    tabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // 返回按钮
    backBtn.addEventListener('click', () => {
      window.location.href = 'options.html';
    });

    // 复习功能
    startReviewBtn.addEventListener('click', startReview);
    showAnswerBtn.addEventListener('click', showAnswer);
    rememberedBtn.addEventListener('click', () => submitReview('remembered'));
    forgottenBtn.addEventListener('click', () => submitReview('forgotten'));
    finishReviewBtn.addEventListener('click', finishReview);

    // 搜索和筛选
    searchInput.addEventListener('input', debounce(renderWordList, 300));
    familiarityFilter.addEventListener('change', renderWordList);
    stageFilter.addEventListener('change', renderWordList);

    // 删除确认
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDelete);

    // 点击弹窗外部关闭
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });
  }

  // ==================== 标签页切换 ====================

  function switchTab(tabName) {
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
  }

  // ==================== 复习功能 ====================

  function startReview() {
    if (dueWords.length === 0) return;

    currentReviewIndex = 0;
    reviewStats = { remembered: 0, forgotten: 0 };

    reviewIntro.style.display = 'none';
    reviewCard.style.display = 'block';
    reviewComplete.style.display = 'none';

    showCurrentWord();
  }

  function showCurrentWord() {
    const word = dueWords[currentReviewIndex];

    // 更新进度
    const progress = ((currentReviewIndex) / dueWords.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('progressText').textContent =
      `${currentReviewIndex + 1} / ${dueWords.length}`;

    // 更新单词信息
    document.getElementById('reviewWord').textContent = word.word;
    document.getElementById('reviewPhonetic').textContent = word.phonetic || '';
    document.getElementById('contextText').textContent = word.context || '无上下文';
    document.getElementById('definitionText').textContent = word.definition || '暂无释义';

    // 重置显示状态
    document.getElementById('definitionSection').style.display = 'none';
    showAnswerBtn.style.display = 'block';
    reviewButtons.style.display = 'none';

    // 绑定发音按钮
    const audioBtn = document.getElementById('reviewAudioBtn');
    audioBtn.onclick = () => speakWord(word.word);
  }

  function showAnswer() {
    document.getElementById('definitionSection').style.display = 'block';
    showAnswerBtn.style.display = 'none';
    reviewButtons.style.display = 'flex';
  }

  async function submitReview(result) {
    const word = dueWords[currentReviewIndex];

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_REVIEW',
        wordId: word.id,
        result: result
      });

      if (response.success) {
        reviewStats[result]++;
        currentReviewIndex++;

        if (currentReviewIndex >= dueWords.length) {
          showReviewComplete();
        } else {
          showCurrentWord();
        }
      } else {
        console.error('[Smart Hover Translator] 提交复习失败:', response.message);
      }
    } catch (error) {
      console.error('[Smart Hover Translator] 提交复习错误:', error);
    }
  }

  function showReviewComplete() {
    reviewCard.style.display = 'none';
    reviewComplete.style.display = 'block';

    document.getElementById('rememberedCount').textContent = reviewStats.remembered;
    document.getElementById('forgottenCount').textContent = reviewStats.forgotten;

    // 刷新数据
    loadData();
  }

  function finishReview() {
    reviewComplete.style.display = 'none';
    reviewIntro.style.display = 'block';
  }

  // ==================== 单词列表渲染 ====================

  function renderWordList() {
    const searchTerm = searchInput.value.toLowerCase();
    const familiarityValue = familiarityFilter.value;
    const stageValue = stageFilter.value;

    let filteredWords = allWords.filter(word => {
      // 搜索筛选
      if (searchTerm && !word.word.toLowerCase().includes(searchTerm)) {
        return false;
      }

      // 熟悉度筛选
      if (familiarityValue && word.familiarity !== parseInt(familiarityValue)) {
        return false;
      }

      // 阶段筛选
      if (stageValue) {
        const stage = word.stage;
        if (stageValue === '0' && stage !== 0) return false;
        if (stageValue === '1-3' && (stage < 1 || stage > 3)) return false;
        if (stageValue === '4-6' && (stage < 4 || stage > 6)) return false;
        if (stageValue === '7' && stage !== 7) return false;
      }

      return true;
    });

    if (filteredWords.length === 0) {
      wordList.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    wordList.style.display = 'block';
    emptyState.style.display = 'none';

    wordList.innerHTML = filteredWords.map(word => `
      <div class="word-item" data-id="${word.id}">
        <div class="word-main">
          <div class="word-header">
            <span class="word-text">${escapeHtml(word.word)}</span>
            <span class="word-phonetic">${escapeHtml(word.phonetic || '')}</span>
            <span class="word-stage stage-${word.stage}">${getStageLabel(word.stage)}</span>
          </div>
          <div class="word-definition">${escapeHtml(word.definition || '暂无释义')}</div>
          <div class="word-meta">
            <span class="word-context" title="${escapeHtml(word.context || '')}">
              📖 ${truncateText(word.context || '无上下文', 50)}
            </span>
            <span class="word-source" title="${escapeHtml(word.sourceTitle || word.source || '')}">
              🔗 ${truncateText(word.sourceTitle || '未知来源', 30)}
            </span>
          </div>
        </div>
        <div class="word-actions">
          <select class="familiarity-select" data-id="${word.id}">
            <option value="1" ${word.familiarity === 1 ? 'selected' : ''}>🆕 陌生</option>
            <option value="2" ${word.familiarity === 2 ? 'selected' : ''}>🤔 模糊</option>
            <option value="3" ${word.familiarity === 3 ? 'selected' : ''}>✅ 认识</option>
          </select>
          <button class="delete-btn" data-id="${word.id}" title="删除">🗑️</button>
        </div>
      </div>
    `).join('');

    // 绑定熟悉度选择事件
    wordList.querySelectorAll('.familiarity-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const wordId = e.target.dataset.id;
        const familiarity = parseInt(e.target.value);

        try {
          const response = await chrome.runtime.sendMessage({
            type: 'UPDATE_FAMILIARITY',
            wordId,
            familiarity
          });

          if (!response.success) {
            console.error('[Smart Hover Translator] 更新熟悉度失败:', response.message);
          }
        } catch (error) {
          console.error('[Smart Hover Translator] 更新熟悉度错误:', error);
        }
      });
    });

    // 绑定删除按钮事件
    wordList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        wordToDelete = e.target.dataset.id;
        deleteModal.style.display = 'flex';
      });
    });
  }

  function renderPendingList() {
    const now = Date.now();
    const pendingWords = allWords
      .filter(word => word.nextReviewAt > now)
      .sort((a, b) => a.nextReviewAt - b.nextReviewAt);

    if (pendingWords.length === 0) {
      pendingList.style.display = 'none';
      pendingEmptyState.style.display = 'block';
      return;
    }

    pendingList.style.display = 'block';
    pendingEmptyState.style.display = 'none';

    pendingList.innerHTML = pendingWords.map(word => {
      const daysUntil = Math.ceil((word.nextReviewAt - now) / (24 * 60 * 60 * 1000));
      const dateStr = new Date(word.nextReviewAt).toLocaleDateString('zh-CN');

      return `
        <div class="word-item pending-item">
          <div class="word-main">
            <div class="word-header">
              <span class="word-text">${escapeHtml(word.word)}</span>
              <span class="word-phonetic">${escapeHtml(word.phonetic || '')}</span>
              <span class="word-stage stage-${word.stage}">${getStageLabel(word.stage)}</span>
            </div>
            <div class="word-definition">${escapeHtml(word.definition || '暂无释义')}</div>
          </div>
          <div class="pending-info">
            <span class="pending-date">${dateStr}</span>
            <span class="pending-days">${daysUntil === 0 ? '今天' : `${daysUntil}天后`}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ==================== 删除功能 ====================

  function closeDeleteModal() {
    deleteModal.style.display = 'none';
    wordToDelete = null;
  }

  async function confirmDelete() {
    if (!wordToDelete) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_WORD',
        wordId: wordToDelete
      });

      if (response.success) {
        // 从本地数据中移除
        allWords = allWords.filter(w => w.id !== wordToDelete);
        dueWords = dueWords.filter(w => w.id !== wordToDelete);

        // 刷新 UI
        renderWordList();
        renderPendingList();
        updateReviewIntro();

        // 刷新统计
        const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_VOCABULARY_STATS' });
        if (statsResponse.success) {
          updateStats(statsResponse);
        }
      } else {
        console.error('[Smart Hover Translator] 删除失败:', response.message);
      }
    } catch (error) {
      console.error('[Smart Hover Translator] 删除错误:', error);
    }

    closeDeleteModal();
  }

  // ==================== 工具函数 ====================

  function getStageLabel(stage) {
    const labels = ['🌱 新词', '📚 阶段1', '📚 阶段2', '📚 阶段3', '🎯 阶段4', '🎯 阶段5', '🎯 阶段6', '🏆 已掌握'];
    return labels[stage] || '🌱 新词';
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function speakWord(word) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  }
});
