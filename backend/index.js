const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('AI Chat Backend is running');
});

// 辅助函数：智能拼接 URL，避免重复的 /v1
function buildApiUrl(baseUrl, endpoint) {
  // 移除 baseUrl 末尾的斜杠
  let cleanBase = baseUrl.replace(/\/+$/, '');
  // 如果 baseUrl 以 /v1 结尾，则 endpoint 应该直接拼接（不加 /v1）
  if (cleanBase.endsWith('/v1')) {
    return `${cleanBase}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  } else {
    // 否则在 endpoint 前加上 /v1（如果 endpoint 不以 /v1 开头）
    const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    return `${cleanBase}/v1${path}`;
  }
}

// 获取模型列表
app.post('/api/models', async (req, res) => {
  try {
    const { base_url, api_key } = req.body;
    if (!base_url || !api_key) {
      return res.status(400).json({ error: '缺少 base_url 或 api_key' });
    }

    // 智能构建 URL
    const url = buildApiUrl(base_url, 'models');
    console.log('请求模型列表 URL:', url); // 打印以便调试

    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${api_key}` }
    });

    // 尝试解析不同格式的模型列表
    let models = [];
    if (response.data && response.data.data) {
      // OpenAI 格式: { data: [ { id: '...' } ] }
      models = response.data.data.map(item => ({ id: item.id, name: item.id }));
    } else if (Array.isArray(response.data)) {
      // 直接返回数组: [ { id: '...' }, ... ]
      models = response.data.map(item => ({ id: item.id || item, name: item.id || item }));
    } else if (response.data && response.data.models) {
      // 自定义格式: { models: [ ... ] }
      models = response.data.models.map(item => ({ id: item.id || item, name: item.id || item }));
    } else {
      // 未知格式，返回原始数据以便调试
      return res.json({ raw: response.data });
    }

    res.json({ models });
  } catch (error) {
    console.error('获取模型列表失败:', error.response?.data || error.message);
    res.status(500).json({ error: '获取模型列表失败', details: error.response?.data || error.message });
  }
});

// 聊天接口
app.post('/api/chat', async (req, res) => {
  try {
    const { base_url, api_key, model, messages } = req.body;
    if (!base_url || !api_key || !model || !messages) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 智能构建 URL
    const url = buildApiUrl(base_url, 'chat/completions');
    console.log('聊天请求 URL:', url);

    const response = await axios.post(
      url,
      { model, messages, stream: false },
      { headers: { 'Authorization': `Bearer ${api_key}`, 'Content-Type': 'application/json' } }
    );

    res.json(response.data);
  } catch (error) {
    console.error('聊天请求失败:', error.response?.data || error.message);
    res.status(500).json({ error: '聊天请求失败', details: error.response?.data || error.message });
  }
});

app.listen(port, () => {
  console.log(`后端服务运行在 http://localhost:${port}`);
});