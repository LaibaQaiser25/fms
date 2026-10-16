const pool = require('../db/pool');

// Offline Setup settings (T1.2): the setup name and logo the main factory PC
// shows. Stored in offline_setup (one row). The factory gets them from
// POST /sync/register and GET /sync/config (SyncController).

const MAX_NAME_LENGTH = 60;
const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_SIZE = 256;

class SetupInputError extends Error {}

// What the factory app and the Offline Setup page need. The logo goes out as
// a data URL: a 256 x 256 PNG is small, and an <img> can't send the JWT.
async function getSetup(db = pool) {
  const { rows: [row] } = await db.query(
    'SELECT setup_name, logo, updated_at FROM offline_setup WHERE id = 1'
  );
  return {
    name: row?.setup_name || null,
    logo: row?.logo ? `data:image/png;base64,${row.logo.toString('base64')}` : null,
    updatedAt: row?.updated_at || null,
  };
}

async function setSetupName(name, db = pool) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (clean.length > MAX_NAME_LENGTH) {
    throw new SetupInputError(`The setup name can be at most ${MAX_NAME_LENGTH} characters.`);
  }
  await db.query(
    'UPDATE offline_setup SET setup_name = $1, updated_at = now() WHERE id = 1',
    [clean || null]
  );
}

// The file type comes from its first bytes, never from its name or the
// Content-Type the browser claims.
function imageTypeOf(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

// Shrinks the image to 256 x 256 (whole image kept, transparent padding) and
// stores that PNG in place of the old logo. Throws SetupInputError with a message
// for the Owner when the upload isn't acceptable.
async function setLogo(buf, db = pool) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new SetupInputError('No image was received.');
  if (buf.length > MAX_LOGO_BYTES) throw new SetupInputError('The logo must be 1 MB or smaller.');
  if (!imageTypeOf(buf)) throw new SetupInputError('The logo must be a PNG or JPG image.');

  // Loaded here, not at the top: only the Offline Setup routes need it.
  const sharp = require('sharp');
  let png;
  try {
    png = await sharp(buf, { limitInputPixels: 50_000_000 })
      .rotate() // honour the JPG orientation flag
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    throw new SetupInputError('That image could not be read. Try saving it again as PNG or JPG.');
  }
  await db.query('UPDATE offline_setup SET logo = $1, updated_at = now() WHERE id = 1', [png]);
}

async function clearLogo(db = pool) {
  await db.query('UPDATE offline_setup SET logo = NULL, updated_at = now() WHERE id = 1');
}

module.exports = {
  SetupInputError,
  MAX_LOGO_BYTES,
  getSetup,
  setSetupName,
  setLogo,
  clearLogo,
};
