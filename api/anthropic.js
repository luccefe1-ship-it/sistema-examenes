// api/anthropic.js
export default async function handler(req, res) {
  console.log('🚀 Endpoint anthropic.js llamado');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  
  // Configurar CORS más permisivo
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('✅ Respondiendo a preflight OPTIONS');
    return res.status(200).end();
  }

  // Solo permitir POST
  if (req.method !== 'POST') {
    console.log('❌ Método no permitido:', req.method);
    return res.status(405).json({ 
      error: 'Method not allowed',
      method: req.method,
      allowedMethods: ['POST']
    });
  }

  // Verificar API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    console.log('❌ API key faltante');
    return res.status(400).json({ error: 'API key requerida en header x-api-key' });
  }

  if (!apiKey.startsWith('sk-ant-')) {
    console.log('❌ API key inválida');
    return res.status(400).json({ error: 'API key inválida' });
  }

  console.log('✅ API key válida:', apiKey.substring(0, 20) + '...');

  try {
    console.log('📡 Llamando a API de Anthropic...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    console.log('📨 Respuesta de Anthropic:', response.status, response.statusText);

    const data = await response.json();
    
    if (!response.ok) {
      console.log('❌ Error de Anthropic:', data);
      return res.status(response.status).json(data);
    }

    console.log('✅ Respuesta exitosa de Anthropic');
    return res.status(200).json(data);

  } catch (error) {
    console.error('💥 Error del servidor:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
