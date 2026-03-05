'use strict';

const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '..', 'favicon-32.svg');
const dest = path.join(__dirname, '..', 'logo-email.png');

sharp(src)
  .resize(64, 64)
  .png()
  .toFile(dest)
  .then(() => console.log(`Generated ${dest}`))
  .catch(err => { console.error(err); process.exit(1); });
