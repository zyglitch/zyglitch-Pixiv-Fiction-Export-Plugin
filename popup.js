// version 1.0.1
document.addEventListener('DOMContentLoaded', function() {
  const extractBtn = document.getElementById('extract-btn');
  const statusDiv = document.getElementById('status');
  const formatRadios = document.querySelectorAll('input[name="format"]');

  // Function to update status message
  function updateStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = isError ? 'status error' : 'status';
    console.log(`[Popup] Status: ${message}${isError ? ' (Error)' : ''}`);
  }

  // Function to set button state
  function setButtonState(enabled) {
    extractBtn.disabled = !enabled;
    extractBtn.textContent = enabled ? '提取并下载' : '处理中...';
    extractBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    extractBtn.style.opacity = enabled ? '1' : '0.7';
  }

  extractBtn.addEventListener('click', async function() {
    setButtonState(false);
    updateStatus('正在准备提取...'); // Initial status

    try {
      // 获取当前选中的格式
      const selectedFormat = document.querySelector('input[name="format"]:checked');
      if (!selectedFormat) {
        updateStatus('请先选择一种导出格式。', true);
        setButtonState(true);
        return;
      }
      const format = selectedFormat.value;
      updateStatus(`准备提取 ${format.toUpperCase()} 格式...`);

      // 获取当前活动标签页
      let tab;
      try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      } catch (queryError) {
        console.error('[Popup] 查询标签页时出错:', queryError);
        updateStatus(`无法获取当前标签页: ${queryError.message}`, true);
        setButtonState(true);
        return;
      }

      // 检查是否是Pixiv小说页面
      if (!tab || !tab.url || !tab.url.includes('pixiv.net/novel/show.php')) {
        updateStatus('请在Pixiv小说页面使用此插件。', true);
        setButtonState(true);
        return;
      }

      updateStatus('正在向页面注入脚本并提取内容...');

      // 向内容脚本发送消息，请求提取小说内容
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'extractNovel' });
      } catch (sendMessageError) {
        console.error('[Popup] 发送消息到 content script 时出错:', sendMessageError);
        // Check if the error is due to no receiving end (content script not injected/loaded)
        if (sendMessageError.message.includes('Could not establish connection') || sendMessageError.message.includes('Receiving end does not exist')) {
          updateStatus('无法连接到页面脚本。请尝试刷新页面或确保插件已正确加载。', true);
        } else {
          updateStatus(`提取内容时出错: ${sendMessageError.message}`, true);
        }
        setButtonState(true);
        return;
      }

      // 处理来自 content script 的响应
      if (!response || !response.success) {
        const errorMsg = response?.error || '未能从页面获取有效响应。';
        console.error('[Popup] Content script 提取失败:', errorMsg);
        updateStatus(`提取失败: ${errorMsg}`, true);
        setButtonState(true);
        return;
      }

      updateStatus('内容提取成功，正在准备下载...');
      console.log('[Popup] 收到的 NovelData:', response.data);

      // 发送数据到背景脚本进行格式转换和下载
      let downloadResponse;
      try {
        downloadResponse = await chrome.runtime.sendMessage({
          action: 'convertAndDownload',
          novelData: response.data,
          format: format
        });
      } catch (downloadError) {
        console.error('[Popup] 发送下载请求到 background script 时出错:', downloadError);
        updateStatus(`请求下载时出错: ${downloadError.message}`, true);
        setButtonState(true);
        return;
      }

      // 处理来自 background script 的下载响应
      if (downloadResponse && downloadResponse.success) {
        updateStatus(downloadResponse.message || '下载任务已启动！'); // Show success or specific message (like HTML hint)
      } else {
        const errorMsg = downloadResponse?.error || '未知的下载错误。';
        console.error('[Popup] Background script 下载失败:', errorMsg);
        updateStatus(`下载失败: ${errorMsg}`, true);
      }

    } catch (error) {
      // Catch any unexpected errors in the main try block
      console.error('[Popup] 发生意外错误:', error);
      updateStatus(`发生意外错误: ${error.message}`, true);
    } finally {
      // Always re-enable the button, regardless of success or failure
      setButtonState(true);
    }
  });

  // Initial state setup
  updateStatus('请选择格式并点击按钮开始提取。');
  setButtonState(true);
});