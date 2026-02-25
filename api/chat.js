const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base_url, api_key, model, messages } = req.body;
    if (!base_url || !api_key || !model || !messages) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    function buildApiUrl(baseUrl, endpoint) {
      let cleanBase = baseUrl.replace(/\/+$/, '');
      if (cleanBase.endsWith('/v1')) {
        return `${cleanBase}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
      } else {
        const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        return `${cleanBase}/v1${path}`;
      }
    }

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
};