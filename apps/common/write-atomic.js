// Writes a file in one step: the data goes to a side file first, then is renamed over the real one. A crash or a full
// disk part-way leaves the old file as it was (never half a file). mode (e.g. 0o600) applies to new and existing files.
const fs = require("fs"), path = require("path");
function writeAtomic(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try { fs.writeFileSync(tmp, data, mode ? { mode } : undefined); if (mode) fs.chmodSync(tmp, mode); fs.renameSync(tmp, file); }
  catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} throw e; }
}
module.exports = { writeAtomic };
