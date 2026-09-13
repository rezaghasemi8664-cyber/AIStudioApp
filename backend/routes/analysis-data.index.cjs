'use strict';

// Route registration helper kept separate so the existing route index remains untouched.
module.exports = function registerAnalysisDataRoute(app) {
  var router = require('./analysis-data.routes.cjs');
  app.use('/api/analysis-data', router);
};
