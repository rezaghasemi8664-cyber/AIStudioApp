const express = require('express');

const router = express.Router();

const WORDPRESS_BASE_URL = process.env.WORDPRESS_FARAZ_URL || 'http://127.0.0.1:8090';

router.get('/status', async (_req, res) => {
  try {
    const response = await fetch(`${WORDPRESS_BASE_URL}/wp-json/`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    res.json({
      success: true,
      data: {
        reachable: response.ok,
        wordpressUrl: WORDPRESS_BASE_URL,
        status: response.status,
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'اتصال به WordPress داخلی برقرار نشد.',
      data: { reachable: false, wordpressUrl: WORDPRESS_BASE_URL },
    });
  }
});

module.exports = router;
