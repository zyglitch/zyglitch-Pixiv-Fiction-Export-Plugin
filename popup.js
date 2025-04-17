document.addEventListener('DOMContentLoaded', function() {
  const extractBtn = document.getElementById('extract-btn');
  const statusDiv = document.getElementById('status');

  extractBtn.addEventListener('click', async function() {
    try {
      statusDiv.textContent = '正在提取小说内容...';
      statusDiv.className = 'status';
      
      // 获取当前选中的格式
      const format = document.querySelector('input[name="format"]:checked').value;
      
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 检查是否是Pixiv小说页面
      if (!tab.url.includes('pixiv.net/novel/show.php')) {
        statusDiv.textContent = '请在Pixiv小说页面使用此插件';
        statusDiv.className = 'status error';
        return;
      }
      
      // 向内容脚本发送消息，请求提取小说内容
      chrome.tabs.sendMessage(tab.id, { action: 'extractNovel' }, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = '提取失败: ' + chrome.runtime.lastError.message;
          statusDiv.className = 'status error';
          return;
        }
        
        if (!response || !response.success) {
          statusDiv.textContent = '提取失败: ' + (response?.error || '未知错误');
          statusDiv.className = 'status error';
          return;
        }
        
        // 发送数据到背景脚本进行格式转换和下载
        chrome.runtime.sendMessage({
          action: 'convertAndDownload',
          novelData: response.data,
          format: format
        }, function(downloadResponse) {
          if (chrome.runtime.lastError) {
            statusDiv.textContent = '下载失败: ' + chrome.runtime.lastError.message;
            statusDiv.className = 'status error';
            return;
          }
          
          if (downloadResponse && downloadResponse.success) {
            statusDiv.textContent = '下载成功！';
          } else {
            statusDiv.textContent = '下载失败: ' + (downloadResponse?.error || '未知错误');
            statusDiv.className = 'status error';
          }
        });
      });
    } catch (error) {
      statusDiv.textContent = '发生错误: ' + error.message;
      statusDiv.className = 'status error';
    }
  });
});