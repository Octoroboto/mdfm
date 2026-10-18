// electron-builder afterPack hook (macOS):
//  1. Electron fuses — switches baked into the Electron binary that close common ways to tamper
//     with or hijack an installed Electron app (https://www.electronjs.org/docs/latest/tutorial/fuses):
//       RunAsNode off, NODE_OPTIONS off, --inspect off, load the app only from app.asar, and
//       (when electron-builder recorded the archive's hash in Info.plist) check app.asar's integrity.
//  2. Ad-hoc signature ("Sign to Run Locally"). Without an Apple Developer ID the app can't be
//     notarized, but Apple Silicon refuses unsigned code. Recipients allow it once (install guide).
// When RentVision has a Developer ID: keep the fuses, replace step 2 with real signing + notarization.
// Runs in Node at build time (electron-builder calls it after packing, before the .dmg is made). Not shipped in the app.
const { execFileSync } = require('child_process');
const path = require('path');

// context: electron-builder's afterPack context (platform, output folder, app info). Throws (failing the build) if signing fails.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const plist = path.join(app, 'Contents', 'Info.plist');
  let asarHashRecorded = false;
  try { execFileSync('plutil', ['-extract', 'ElectronAsarIntegrity', 'xml1', '-o', '-', plist], { stdio: 'ignore' }); asarHashRecorded = true; } catch {}   // plutil exits non-zero when the key is missing; that just means no integrity hash

  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
  const fuses = {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  };
  if (asarHashRecorded) fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] = true;
  console.log(`  • Electron fuses: RunAsNode off, NODE_OPTIONS off, inspect off, asar only${asarHashRecorded ? ', asar integrity on' : ' (asar integrity: no hash in Info.plist, left off)'}`);
  await flipFuses(app, fuses);

  console.log(`  • ad-hoc signing ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });   // --deep signs the nested helper apps and frameworks too
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
