//version 1.0.1
// 在页面加载完成后立即执行，确保脚本已加载
console.log('Pixiv小说导出工具: content.js v1.0.1 已加载');

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[Content Script] 收到消息:', request);

  if (request.action === 'extractNovel') {
    console.log('[Content Script] 开始提取小说内容...');
    try {
      // 提取小说数据
      const novelData = extractNovelContent();
      if (!novelData.content || novelData.content.trim().length === 0) {
        throw new Error('提取到的小说内容为空，请检查页面结构或选择器。');
      }
      console.log(`[Content Script] 小说提取成功: ${novelData.title} (内容长度: ${novelData.content.length})`);
      sendResponse({ success: true, data: novelData });
    } catch (error) {
      console.error('[Content Script] 提取小说内容时出错:', error);
      sendResponse({ success: false, error: `提取失败: ${error.message}` });
    }
  }
  return true; // 保持消息通道开放，以便异步响应
});

// 发送一个测试消息，确认content script已正确加载
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' }, function(response) {
  if (chrome.runtime.lastError) {
    console.warn('[Content Script] 无法连接到 background script:', chrome.runtime.lastError.message);
  } else {
    console.log('[Content Script] 加载确认响应:', response || '无响应');
  }
});

/**
 * 从Pixiv小说页面提取小说内容
 * @returns {Object} 包含小说标题、作者、内容等的对象
 */
function extractNovelContent() {
  console.log('[Content Script] 开始分析页面DOM结构...');

  // --- 提取元数据 --- 
  const metadata = extractMetadata();
  console.log('[Content Script] 提取的元数据:', metadata);

  // --- 提取主要内容 --- 
  const contentElement = findContentElement();
  if (!contentElement) {
    console.error('[Content Script] 无法找到小说内容容器元素。');
    // 记录页面HTML结构，帮助调试
    console.log('[Content Script] Body HTML (前500字符):', document.body.innerHTML.substring(0, 500) + '...');
    throw new Error('无法找到小说内容容器元素，请检查页面结构或更新选择器。');
  }
  console.log('[Content Script] 找到内容容器元素:', contentElement.tagName, contentElement.className);

  const content = extractTextFromElement(contentElement);
  console.log(`[Content Script] 提取的内容初步长度: ${content.length}`);

  if (!content || content.trim().length === 0) {
    console.warn('[Content Script] 从主要容器提取的内容为空，尝试后备方法。');
    // 可以添加后备的提取逻辑，例如直接获取 body 的 textContent，但这通常效果不佳
  }

  return {
    ...metadata,
    content: cleanContent(content), // 清理和格式化内容
  };
}

/**
 * 提取小说的元数据（标题、作者、描述、封面等）
 */
function extractMetadata() {
  const data = {
    title: '未知标题',
    author: '未知作者',
    description: '',
    coverUrl: '',
    novelId: window.location.href.match(/id=(d+)/)?.[1] || '',
    sourceUrl: window.location.href
  };

  // 标题选择器 (优先级从高到低)
  const titleSelectors = [
    'h1[class^="sc-"]', // 通用 sc- 开头 h1
    'main h1',           // main 内的 h1
    'h1',                // 页面主 h1
    'div[class*="title"]' // 类名包含 title 的 div
  ];
  data.title = findElementText(titleSelectors) || data.title;

  // 作者选择器
  const authorSelectors = [
    'a[class^="sc-"][href^="/users/"]', // 通用 sc- 开头用户链接
    'aside a[href^="/users/"]',         // 侧边栏用户链接
    'a[href^="/users/"]',               // 任意用户链接
    'div[class*="author"] a',          // 类名包含 author 的 div 内的链接
    'div[class*="user-name"]'          // 类名包含 user-name 的 div
  ];
  data.author = findElementText(authorSelectors) || data.author;

  // 描述选择器
  const descriptionSelectors = [
    'div[class^="sc-"][class*="description"]', // sc- 开头且包含 description
    'div[class*="description"]',               // 类名包含 description
    'div[class*="caption"]',                   // 类名包含 caption
    'meta[name="description"]'                 // meta description 标签 (取 content)
  ];
  data.description = findElementText(descriptionSelectors, 'content') || data.description;

  // 封面图片选择器
  const coverSelectors = [
    `img[class^="sc-"][alt*="${data.title}"]`, // sc- 开头且 alt 包含标题
    'div[role="presentation"] img',             // presentation 角色的 div 内图片
    'main article img',                         // main article 内图片
    'figure img',                               // figure 内图片
    'img[class*="cover"]',                     // 类名包含 cover 的图片
    'main img'                                  // main 内任意图片 (较低优先级)
  ];
  data.coverUrl = findElementAttribute(coverSelectors, 'src') || data.coverUrl;

  return data;
}

/**
 * 查找并返回第一个匹配选择器的元素
 * @param {string[]} selectors CSS选择器数组 (按优先级排列)
 * @returns {HTMLElement | null} 找到的元素或null
 */
function findElement(selectors) {
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`[Content Script] 找到元素匹配: ${selector}`);
        return element;
      }
    } catch (e) {
      console.warn(`[Content Script] 无效的选择器: ${selector}`, e);
    }
  }
  console.warn(`[Content Script] 未找到匹配任何选择器的元素: ${selectors.join(', ')}`);
  return null;
}

/**
 * 查找并返回第一个匹配选择器的元素的文本内容
 * @param {string[]} selectors CSS选择器数组
 * @param {string} attribute 如果是 meta 标签等，指定要获取的属性名 (例如 'content')
 * @returns {string} 元素的文本内容或空字符串
 */
function findElementText(selectors, attribute = null) {
  const element = findElement(selectors);
  if (!element) return '';
  if (attribute && element.hasAttribute(attribute)) {
    return element.getAttribute(attribute).trim();
  }
  return element.textContent.trim();
}

/**
 * 查找并返回第一个匹配选择器的元素的指定属性值
 * @param {string[]} selectors CSS选择器数组
 * @param {string} attribute 要获取的属性名 (例如 'src', 'href')
 * @returns {string} 属性值或空字符串
 */
function findElementAttribute(selectors, attribute) {
  const element = findElement(selectors);
  return element && element.hasAttribute(attribute) ? element.getAttribute(attribute) : '';
}

/**
 * 查找小说主要内容容器元素
 * @returns {HTMLElement | null} 内容容器元素或null
 */
function findContentElement() {
  const contentSelectors = [
    // --- 高优先级选择器 (通常是主要内容区域) ---
    'main div[id^="gtm-novel-work-scroll-main"]', // 新版 Pixiv ID
    'main div[class*="gtm-novel-work-content"]', // GTM 类名
    'main div[class*="novel-body"]',             // 类名包含 novel-body
    'main div[class*="novel-content"]',          // 类名包含 novel-content
    'main div[class*="viewer-container"]',       // 类名包含 viewer-container
    'div[class^="sc-"][class*="content"]',      // sc- 开头且包含 content
    'div[class^="sc-"][class*="novel"]',       // sc- 开头且包含 novel
    'div[role="presentation"] > div > div > div', // 基于角色的深层嵌套
    'main article',                              // main 内的 article
    '.novelskeleton-content',                    // 骨架屏内容
    'div[class*="gtm-novel-viewer-content"]',    // 另一个 GTM 类名
    'div[class*="viewer"] div[class*="content"]', // viewer 内的 content
    // --- 低优先级选择器 (可能包含非正文内容) ---
    'main'                                       // 整个 main 区域 (作为最后手段)
  ];
  return findElement(contentSelectors);
}

/**
 * 从指定元素中提取文本内容，尝试保留段落结构
 * @param {HTMLElement} element 容器元素
 * @returns {string} 提取的文本内容
 */
function extractTextFromElement(element) {
  let content = '';
  // 优先尝试按段落提取 (p, div 等块级元素)
  const blockElements = element.querySelectorAll('p, div[class*="paragraph"], div[class*="text"], h2, h3, h4');

  if (blockElements.length > 5) { // 如果找到足够多的块级元素，认为这是主要结构
    console.log(`[Content Script] 通过 ${blockElements.length} 个块级元素提取内容`);
    const uniqueParagraphs = new Set();
    blockElements.forEach(el => {
      const text = el.textContent.trim();
      // 过滤掉过短或可能无意义的文本块
      if (text.length > 5) {
        uniqueParagraphs.add(text);
      }
    });
    content = Array.from(uniqueParagraphs).join('\n\n');
  } else {
    console.log('[Content Script] 块级元素不足，使用 TreeWalker 提取所有文本节点');
    // 如果块级元素不多，使用 TreeWalker 遍历所有文本节点
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      // 过滤掉脚本、样式和完全空白的节点
      if (node.parentElement.tagName.toLowerCase() === 'script' ||
          node.parentElement.tagName.toLowerCase() === 'style' ||
          !node.nodeValue.trim()) {
        continue;
      }
      const text = node.nodeValue.trim();
      if (text.length > 0) {
        textNodes.push(text);
      }
    }
    // 尝试用换行符合并，模拟段落
    content = textNodes.join('\n'); // 先用单换行连接
    console.log(`[Content Script] TreeWalker 找到 ${textNodes.length} 个文本节点`);
  }

  // 如果上述方法结果为空，尝试直接获取 textContent 作为最后手段
  if (!content || content.trim().length === 0) {
    console.warn('[Content Script] 提取内容仍为空，尝试直接获取容器 textContent');
    content = element.textContent || '';
  }

  return content;
}

/**
 * 清理和格式化提取的文本内容
 * @param {string} rawContent 原始提取内容
 * @returns {string} 清理后的内容
 */
function cleanContent(rawContent) {
  if (!rawContent) return '';

  // 替换特殊空白字符
  let cleaned = rawContent.replace(/[\u200B-\u200D\uFEFF]/g, ''); // 移除零宽空格等

  // 处理换行符：将多个连续换行符合并为两个，单个换行符保留（或视情况处理）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // 3个及以上换行变2个
  // cleaned = cleaned.replace(/\n{2}/g, '\n\n'); // 确保至少是双换行（如果需要强制段落）

  // 移除行首行尾多余空格
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

  // 再次合并可能产生的连续空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 去除开头和结尾的空白
  cleaned = cleaned.trim();

  console.log(`[Content Script] 清理后内容长度: ${cleaned.length}`);
  return cleaned;
}