// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // 处理content script加载确认消息
  if (request.action === 'contentScriptLoaded') {
    console.log('Content script已加载:', sender.tab ? sender.tab.url : '未知页面');
    sendResponse({ success: true, message: 'Background script已确认' });
    return true;
  }
  
  if (request.action === 'convertAndDownload') {
    try {
      const { novelData, format } = request;
      
      if (!novelData || !novelData.title || !novelData.content) {
        sendResponse({ success: false, error: '小说数据不完整' });
        return true;
      }
      
      // 根据选择的格式处理数据
      if (format === 'txt') {
        downloadAsTxt(novelData);
        sendResponse({ success: true });
      } else if (format === 'epub') {
        // 由于浏览器扩展的限制，直接创建EPUB比较复杂
        // 这里我们创建一个简化版的HTML，用户可以用其他工具转换为EPUB
        downloadAsHtml(novelData);
        sendResponse({ success: true, message: '已下载为HTML格式，可使用Calibre等工具转换为EPUB' });
      } else {
        sendResponse({ success: false, error: '不支持的格式: ' + format });
      }
    } catch (error) {
      console.error('转换或下载时出错:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // 保持消息通道开放，以便异步响应
});

/**
 * 将小说下载为TXT格式
 * @param {Object} novelData 小说数据
 */
function downloadAsTxt(novelData) {
  const { title, author, content, description } = novelData;
  
  // 创建TXT内容
  let txtContent = `标题：${title}\n作者：${author}\n\n`;
  
  // 添加描述（如果有）
  if (description) {
    txtContent += `简介：\n${description}\n\n`;
  }
  
  txtContent += `正文：\n\n${content}`;
  
  // 创建Blob对象
  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  
  // 在Service Worker环境中，直接使用chrome.downloads.download API下载Blob数据
  // 避免使用URL.createObjectURL，因为在某些Service Worker环境中可能不可用
  const reader = new FileReader();
  reader.onload = function() {
    const dataUrl = reader.result;
    
    // 使用chrome.downloads API下载文件
    chrome.downloads.download({
      url: dataUrl,
      filename: `${title}.txt`,
      saveAs: true
    });
  };
  reader.onerror = function(error) {
    console.error('读取Blob数据时出错:', error);
    throw new Error('读取Blob数据失败');
  };
  
  // 将Blob转换为Data URL
  reader.readAsDataURL(blob);
}

/**
 * 将小说下载为HTML格式（可以后续转换为EPUB）
 * @param {Object} novelData 小说数据
 */
function downloadAsHtml(novelData) {
  const { title, author, content, description, coverUrl } = novelData;
  
  // 创建HTML内容
  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: 'Noto Serif', 'Noto Serif SC', serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      text-align: center;
    }
    .author {
      text-align: center;
      margin-bottom: 30px;
      font-style: italic;
    }
    .cover {
      text-align: center;
      margin-bottom: 20px;
    }
    .cover img {
      max-width: 100%;
      max-height: 400px;
    }
    .description {
      background-color: #f8f8f8;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 30px;
    }
    .content {
      text-indent: 2em;
    }
    .content p {
      margin-bottom: 1em;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="author">作者：${escapeHtml(author)}</div>
`;

  // 添加封面图片（如果有）
  if (coverUrl) {
    htmlContent += `  <div class="cover">
    <img src="${escapeHtml(coverUrl)}" alt="封面">
  </div>
`;
  }

  // 添加描述（如果有）
  if (description) {
    htmlContent += `  <div class="description">
    <h3>简介</h3>
    <p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  // 添加正文内容
  htmlContent += `  <div class="content">
`;
  
  // 将内容分段
  const paragraphs = content.split('\n\n');
  for (const paragraph of paragraphs) {
    if (paragraph.trim()) {
      htmlContent += `    <p>${escapeHtml(paragraph)}</p>
`;
    }
  }
  
  htmlContent += `  </div>
</body>
</html>`;

  // 创建Blob对象
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  
  // 在Service Worker环境中，直接使用chrome.downloads.download API下载Blob数据
  // 避免使用URL.createObjectURL，因为在某些Service Worker环境中可能不可用
  const reader = new FileReader();
  reader.onload = function() {
    const dataUrl = reader.result;
    
    // 使用chrome.downloads API下载文件
    chrome.downloads.download({
      url: dataUrl,
      filename: `${title}.html`,
      saveAs: true
    });
  };
  reader.onerror = function(error) {
    console.error('读取Blob数据时出错:', error);
    throw new Error('读取Blob数据失败');
  };
  
  // 将Blob转换为Data URL
  reader.readAsDataURL(blob);
}

/**
 * 转义HTML特殊字符
 * @param {string} text 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}