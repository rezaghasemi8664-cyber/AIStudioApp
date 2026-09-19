// backend/config/paths.cjs - ????? ???
'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // Backend Root
const AISTUDIO_ROOT = path.resolve(__dirname, '../..'); // AIStudioApp Root

// Frontend Build Paths (Multiple Possible Locations)
const POSSIBLE_FRONTEND_PATHS = [
  path.join(AISTUDIO_ROOT, 'AIStudioApp/build'),
  path.join(AISTUDIO_ROOT, 'frontend/build'), 
  path.join(AISTUDIO_ROOT, 'build'),
  path.join(ROOT, 'build'), // Backend local build
];

const FRONTEND_BUILD_DIR = process.env.FRONTEND_BUILD_DIR || 
  POSSIBLE_FRONTEND_PATHS.find(p => require('fs').existsSync(p)) ||
  path.join(AISTUDIO_ROOT, 'AIStudioApp/build');

const ASSETS_PATH = path.join(FRONTEND_BUILD_DIR, 'assets');
const FONTS_PATH = path.join(FRONTEND_BUILD_DIR, 'fonts');

console.log('?? Frontend Build:', FRONTEND_BUILD_DIR);

module.exports = {
  ROOT,
  AISTUDIO_ROOT,
  FRONTEND_BUILD_DIR,
  ASSETS_PATH,
  FONTS_PATH,
};
