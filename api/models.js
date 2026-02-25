const axios = require('axios');

module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base_url, api_key } = req.body;
    if (!base_url || !api_key) {
      return res.status(400).json({ error: '缺少 base_url 或 api_key' });
    }

    // 辅助函数：智能拼接 URL
    function buildApiUrl(baseUrl, endpoint) {
      let cleanBase = baseUrl.replace(/\/+$/, '');
      if (cleanBase.endsWith('/v1')) {
        return `${cleanBase}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
      } else {
        const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        return `${cleanBase}/v1${path}`;
      }
    }

    const url = buildApiUrl(base_url, 'models');
    console.log('请求模型列表 URL:', url);

    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${api_key}` }
    });

    let models = [];
    if (response.data && response.data.data) {
      models = response.data.data.map(item => ({ id: item.id, name: item.id }));
    } else if (Array.isArray(response.data)) {
      models = response.data.map(item => ({ id: item.id || item, name: item.id || item }));
    } else if (response.data && response.data.models) {
      models = response.data.models.map(item => ({ id: item.id || item, name: item.id || item }));
    } else {
      return res.json({ raw: response.data });
    }

    res.json({ models });
  } catch (error) {
    console.error('获取模型列表失败:', error.response?.data || error.message);
    res.status(500).json({ error: '获取模型列表失败', details: error.response?.data || error.message });
  }
};