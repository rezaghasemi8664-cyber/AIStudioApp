// PATCH: add the following route mount immediately after the admin routes.
mountRoute('/api/admin/faraz-sms', './routes/wordpress-farazsms.cjs', 'Faraz SMS WordPress Bridge');
