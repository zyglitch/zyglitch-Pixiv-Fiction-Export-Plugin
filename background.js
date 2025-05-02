  // version 1.0.1

// --- Helper Functions ---

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} unsafe The potentially unsafe string.
 * @returns {string} The escaped string.
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Event Listeners ---

// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[Background] Received message:', request, 'from:', sender.tab ? sender.tab.url : sender.id);

  // 处理content script加载确认消息
  if (request.action === 'contentScriptLoaded') {
    console.log('[Background] Content script confirmed loaded from:', sender.tab ? sender.tab.url : 'Popup/Other');
    sendResponse({ success: true, message: 'Background script acknowledged content script loading.' });
    return true; // Keep message channel open for async response
  }

  // 处理小说转换和下载请求
  if (request.action === 'convertAndDownload') {
    const { novelData, format } = request;
    console.log(`[Background] Received request to convert and download: ${novelData?.title} as ${format}`);

    // Validate incoming data
    if (!novelData || typeof novelData !== 'object' || !novelData.title || !novelData.content) {
      const errorMsg = 'Invalid or incomplete novel data received.';
      console.error('[Background] Error:', errorMsg, novelData);
      sendResponse({ success: false, error: errorMsg });
      return true; // Indicate async response (even though it's an error)
    }

    try {
      // 根据选择的格式处理数据
      if (format === 'txt') {
        downloadAsTxt(novelData)
          .then(() => {
            console.log(`[Background] Successfully initiated TXT download for: ${novelData.title}`);
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error(`[Background] Error during TXT download for ${novelData.title}:`, error);
            sendResponse({ success: false, error: `TXT下载失败: ${error.message}` });
          });
      } else if (format === 'epub') {
        // 当前实现是下载HTML，提示用户转换
        downloadAsHtml(novelData)
          .then(() => {
            console.log(`[Background] Successfully initiated HTML (for EPUB) download for: ${novelData.title}`);
            sendResponse({ success: true, message: '已下载为HTML格式，请使用Calibre等工具转换为EPUB。' });
          })
          .catch(error => {
            console.error(`[Background] Error during HTML download for ${novelData.title}:`, error);
            sendResponse({ success: false, error: `HTML下载失败: ${error.message}` });
          });
      } else {
        const errorMsg = `Unsupported format requested: ${format}`;
        console.warn('[Background]', errorMsg);
        sendResponse({ success: false, error: errorMsg });
      }
    } catch (error) {
      // Catch synchronous errors during initial processing
      console.error('[Background] Unexpected error during convertAndDownload processing:', error);
      sendResponse({ success: false, error: `处理下载请求时发生意外错误: ${error.message}` });
    }
    return true; // Indicate that the response will be sent asynchronously
  }

  // Handle other potential message types if needed
  console.log('[Background] Received unhandled message action:', request.action);
  // sendResponse({ success: false, error: 'Unknown action' }); // Optional: respond for unknown actions
  return false; // No async response planned for unknown actions
});

// --- Download Functions ---

/**
 * Converts Blob to Data URL using a Promise.
 * @param {Blob} blob The blob to convert.
 * @returns {Promise<string>} A promise that resolves with the Data URL.
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => {
      console.error('[Background] FileReader error:', error);
      reject(new Error('无法读取文件内容'));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Initiates a download using chrome.downloads API.
 * @param {string} dataUrl The Data URL of the content to download.
 * @param {string} filename The suggested filename for the download.
 * @returns {Promise<void>} A promise that resolves when the download starts or rejects on error.
 */
function triggerDownload(dataUrl, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true // Prompt user for save location
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] chrome.downloads.download error:', chrome.runtime.lastError);
        reject(new Error(`启动下载失败: ${chrome.runtime.lastError.message}`));
      } else if (downloadId === undefined) {
        // This case might happen if the download is blocked or cancelled immediately
        console.warn('[Background] Download did not start (downloadId undefined). User might have cancelled.');
        reject(new Error('下载未启动或已被取消'));
      } else {
        console.log(`[Background] Download started with ID: ${downloadId}`);
        resolve();
      }
    });
  });
}

/**
 * 将小说下载为TXT格式 (Async version)
 * @param {Object} novelData 小说数据
 * @returns {Promise<void>}
 */
async function downloadAsTxt(novelData) {
  const { title, author, content, description, sourceUrl } = novelData;
  const safeTitle = title.replace(/[\/\\:*?"<>|]/g, '_'); // Sanitize filename

  // 创建TXT内容
  let txtContent = `标题：${title}\n作者：${author}\n来源：${sourceUrl || '未知'}\n\n`;
  if (description) {
    txtContent += `简介：\n${description}\n\n`;
  }
  txtContent += `正文：\n\n${content}`;

  console.log('[Background] Generating TXT Blob...');
  const encoder = new TextEncoder();
  const encodedContent = encoder.encode(txtContent);
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), encodedContent], { type: 'text/plain;charset=utf-8' });

  console.log('[Background] Converting TXT Blob to Data URL...');
  const dataUrl = await blobToDataURL(blob);

  console.log('[Background] Triggering TXT download...');
  await triggerDownload(dataUrl, `${safeTitle}.txt`);
}

/**
 * 将小说下载为HTML格式 (Async version)
 * @param {Object} novelData 小说数据
 * @returns {Promise<void>}
 */
async function downloadAsHtml(novelData) {
  const { title, author, content, description, coverUrl, sourceUrl } = novelData;
  const safeTitle = title.replace(/[\/\\:*?"<>|]/g, '_'); // Sanitize filename

  // 创建HTML内容
  let htmlContent = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: 'Georgia', 'Times New Roman', 'Songti SC', 'SimSun', serif;
      line-height: 1.7;
      max-width: 800px;
      margin: 20px auto;
      padding: 20px;
      background-color: #fdfdfd;
      color: #333;
    }
    h1 {
      text-align: center;
      margin-bottom: 0.5em;
      color: #111;
    }
    .author {
      text-align: center;
      margin-bottom: 2em;
      font-style: italic;
      color: #555;
    }
    .source-link {
      text-align: center;
      font-size: 0.9em;
      margin-bottom: 2em;
    }
    .source-link a {
      color: #0078d7;
      text-decoration: none;
    }
    .source-link a:hover {
      text-decoration: underline;
    }
    .cover {
      text-align: center;
      margin-bottom: 2em;
    }
    .cover img {
      max-width: 90%;
      max-height: 500px;
      height: auto;
      border: 1px solid #eee;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .description {
      background-color: #f5f5f5;
      padding: 1em 1.5em;
      border-radius: 5px;
      margin-bottom: 2.5em;
      border-left: 4px solid #0078d7;
    }
    .description h3 {
      margin-top: 0;
      color: #005a9e;
    }
    .content {
      text-indent: 2em;
    }
    .content p {
      margin: 0 0 1em 0;
      text-align: justify;
    }
    /* Add page break hints for printing/EPUB conversion */
    h1, .author, .cover, .description {
      page-break-after: avoid;
    }
    .content p {
       page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="author">作者：${escapeHtml(author)}</div>
`;

  if (sourceUrl) {
    htmlContent += `  <div class="source-link">来源: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a></div>\n`;
  }

  if (coverUrl) {
    htmlContent += `  <div class="cover">
    <img src="${escapeHtml(coverUrl)}" alt="封面图片">
  </div>
`;
  }

  if (description) {
    htmlContent += `  <div class="description">
    <h3>简介</h3>
    <p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  htmlContent += `  <div class="content">
    <h2>正文</h2>
`;

  // 将内容按换行符分割成段落，并过滤空行
  const paragraphs = content.split(/\n\s*\n+/).filter(p => p.trim().length > 0);
  paragraphs.forEach(paragraph => {
    // 对每个段落内的单换行符替换为 <br>，以保留可能的诗歌或对话格式
    const processedParagraph = escapeHtml(paragraph.trim()).replace(/\n/g, '<br>');
    htmlContent += `    <p>${processedParagraph}</p>\n`;
  });

  htmlContent += `  </div>
</body>
</html>`;

  console.log('[Background] Generating HTML Blob...');
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });

  console.log('[Background] Converting HTML Blob to Data URL...');
  const dataUrl = await blobToDataURL(blob);

  console.log('[Background] Triggering HTML download...');
  await triggerDownload(dataUrl, `${safeTitle}.html`);
}

// --- Initialization & Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Pixiv Novel Exporter extension installed/updated.');
  // Perform any setup tasks here if needed
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Browser startup, extension is running.');
});

console.log('[Background] Service worker started.');