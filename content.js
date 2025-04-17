//version 1.0.0
// 在页面加载完成后立即执行，确保脚本已加载
console.log('Pixiv小说导出工具: content.js 已加载');

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到消息:', request);
  
  if (request.action === 'extractNovel') {
    console.log('开始提取小说内容...');
    try {
      // 提取小说数据
      const novelData = extractNovelContent();
      console.log('小说提取成功:', novelData.title);
      sendResponse({ success: true, data: novelData });
    } catch (error) {
      console.error('提取小说内容时出错:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // 保持消息通道开放，以便异步响应
});

// 发送一个测试消息，确认content script已正确加载
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' }, function(response) {
  console.log('Content script加载确认:', response || '无响应');
});

/**
 * 从Pixiv小说页面提取小说内容
 * @returns {Object} 包含小说标题、作者和内容的对象
 */
function extractNovelContent() {
  console.log('开始分析页面DOM结构...');
  
  // 提取小说标题
  const titleElement = document.querySelector('h1[class^="sc-"]') ||
                     document.querySelector('h1') ||
                     document.querySelector('div[class*="title"]');
  const title = titleElement ? titleElement.textContent.trim() : '未知标题';
  console.log('找到标题:', title);
  console.log('标题编码检查:', Array.from(title).map(c => c.charCodeAt(0).toString(16)).join(' '));
  
  // 提取作者名称
  const authorElement = document.querySelector('a[class^="sc-"][href^="/users/"]') ||
                       document.querySelector('a[href^="/users/"]') ||
                       document.querySelector('div[class*="author"] a');
  const author = authorElement ? authorElement.textContent.trim() : '未知作者';
  console.log('找到作者:', author);
  
  // 提取小说ID
  const novelId = window.location.href.match(/id=(\d+)/)?.[1] || '';
  console.log('小说ID:', novelId);
  
  // 记录页面结构，帮助调试
  console.log('页面URL:', window.location.href);
  console.log('页面标题:', document.title);
  
  // 提取小说内容
  // 尝试多种可能的选择器来匹配Pixiv的DOM结构
  let contentElement = document.querySelector('div[class^="sc-"][class*="content"]');
  if (contentElement) console.log('找到内容元素: div[class^="sc-"][class*="content"]');
  
  if (!contentElement) {
    contentElement = document.querySelector('div[class^="sc-"][class*="novel"]');
    if (contentElement) console.log('找到内容元素: div[class^="sc-"][class*="novel"]');
  }
  
  if (!contentElement) {
    contentElement = document.querySelector('div[role="presentation"] > div > div > div');
    if (contentElement) console.log('找到内容元素: div[role="presentation"] > div > div > div');
  }
  
  if (!contentElement) {
    contentElement = document.querySelector('main article');
    if (contentElement) console.log('找到内容元素: main article');
  }
  
  if (!contentElement) {
    contentElement = document.querySelector('div[class*="gtm-novel-work-content"]');
    if (contentElement) console.log('找到内容元素: div[class*="gtm-novel-work-content"]');
  }
  
  // 针对Pixiv新版页面结构的选择器
  if (!contentElement) {
    contentElement = document.querySelector('.novelskeleton-content');
    if (contentElement) console.log('找到内容元素: .novelskeleton-content');
  }
  
  if (!contentElement) {
    contentElement = document.querySelector('main');
    if (contentElement) console.log('找到内容元素: main');
  }
  
  // 针对Pixiv最新版本的选择器
  if (!contentElement) {
    contentElement = document.querySelector('div[class*="novel-content"]');
    if (contentElement) console.log('找到内容元素: div[class*="novel-content"]');
  }
  
  if (!contentElement) {
    contentElement = document.querySelector('div[class*="gtm-novel-viewer-content"]');
    if (contentElement) console.log('找到内容元素: div[class*="gtm-novel-viewer-content"]');
  }
  
  if (!contentElement) {
    contentElement = document.querySelector('div[class*="viewer"] div[class*="content"]');
    if (contentElement) console.log('找到内容元素: div[class*="viewer"] div[class*="content"]');
  }
  
  if (!contentElement) {
    // 记录页面HTML结构，帮助调试
    console.error('无法找到小说内容元素，记录页面结构:');
    console.log('Body HTML:', document.body.innerHTML.substring(0, 500) + '...');
    throw new Error('无法找到小说内容元素');
  }
  
  console.log('找到内容元素:', contentElement);
  
  // 获取所有段落并合并
  // 使用更广泛的选择器来捕获所有可能的文本节点
  // 获取所有段落并去重
  const paragraphs = Array.from(contentElement.querySelectorAll('p, span, div > span, div > p, div[class*="text"], [class*="paragraph"], div[class*="content"] > div, div[class*="novel"] > div, div[class*="viewer"] > div'));
  
  // 记录找到的段落内容，帮助调试
  if (paragraphs.length > 0) {
    console.log('段落示例:', paragraphs.slice(0, 3).map(p => p.textContent.substring(0, 30)));
  }
  console.log('找到段落数量:', paragraphs.length);
  
  let content = '';
  
  // 如果没有找到段落，尝试直接获取内容元素的文本
  if (paragraphs.length === 0) {
    console.log('未找到段落，尝试直接获取内容元素文本');
    // 尝试获取所有文本节点
    const textNodes = [];
    const walker = document.createTreeWalker(contentElement, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      const text = node.nodeValue.trim();
      if (text.length > 0) {
        textNodes.push(text);
      }
    }
    
    if (textNodes.length > 0) {
      console.log('通过文本节点提取内容，找到节点数:', textNodes.length);
      content = textNodes.join('\n\n');
    } else {
      content = contentElement.textContent.trim()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n');
    }
  } else {
    // 使用Set去重
    const uniqueParagraphs = new Set();
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text.length > 0) {
        uniqueParagraphs.add(text);
      }
    });
    
    content = Array.from(uniqueParagraphs).join('\n\n');
  }
  
  console.log('提取的内容长度:', content.length);
  
  if (!content) {
    console.error('提取的小说内容为空');
    throw new Error('小说内容为空');
  }
  
  // 获取小说描述/简介
  const descriptionElement = document.querySelector('div[class^="sc-"][class*="description"]') ||
                           document.querySelector('div[class*="description"]') ||
                           document.querySelector('div[class*="caption"]') ||
                           document.querySelector('[class*="description"]');
  const description = descriptionElement ? descriptionElement.textContent.trim() : '';
  console.log('找到描述:', description ? '是' : '否');
  
  // 获取小说封面图片URL（如果有）
  const coverImgElement = document.querySelector('img[class^="sc-"][alt*="' + title + '"]') ||
                        document.querySelector('div[role="presentation"] img') ||
                        document.querySelector('main article img') ||
                        document.querySelector('img[class*="cover"]') ||
                        document.querySelector('main img');
  const coverUrl = coverImgElement ? coverImgElement.src : '';
  console.log('找到封面图片:', coverUrl ? '是' : '否');
  
  return {
    title,
    author,
    novelId,
    content,
    description,
    coverUrl,
    url: window.location.href,
    extractedAt: new Date().toISOString()
  };
}