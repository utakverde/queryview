import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';

const exec = promisify(execFile);
const maxBytes = 512 * 1024 * 1024;
const profiles = {
  powerread: { label: 'PowerRead', package: 'com.powerread.mobile', import: 'files/Import/database.db', download: 'files/Download/database.db' },
  legacy: { label: 'Legacy RAM', import: '/sdcard/Android/data/appinventor.ai_ramcompany10152022.RAM/files/Import/database.db', download: '/sdcard/Android/data/appinventor.ai_ramcompany10152022.RAM/files/Download/database.db' },
};

function executable() { return process.env.ADB_EXE || 'adb'; }
function profileFor(value) { const profile = profiles[value]; if (!profile) throw new Error('Choose a supported FUBCS Android app.'); return profile; }
async function command(args, timeout = 30000) {
  try { return (await exec(executable(), args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch (error) { throw new Error(`ADB failed: ${String(error.stderr || error.message).trim().slice(0, 400)}`); }
}
export async function listFubcsDevices() {
  const output = await command(['devices', '-l']);
  return output.split(/\r?\n/).slice(1).map(line => {
    const match = line.match(/^([^\s]+)\s+(device|unauthorized|offline)\b/);
    return match ? { serial: match[1], state: match[2] } : null;
  }).filter(Boolean);
}
async function checkedDevice(serial) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(serial)) throw new Error('Choose a connected Android device.');
  const device = (await listFubcsDevices()).find(item => item.serial === serial);
  if (!device || device.state !== 'device') throw new Error('The Android device is unavailable or has not authorized USB debugging.');
  return serial;
}
async function streamAdb(args, { inputFile, outputFile } = {}) {
  const child = spawn(executable(), args, { windowsHide: true, stdio: [inputFile ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let stderr = '', stdout = '', sizeBytes = 0, hash = createHash('sha256'), handle;
  const timer = setTimeout(() => child.kill(), 5 * 60 * 1000);
  child.stderr.on('data', chunk => { stderr += chunk.toString('utf8').slice(0, 4096); });
  const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`ADB failed: ${stderr.trim().slice(0, 400) || `exit ${code}`}`))); });
  closed.catch(() => {});
  if (inputFile) { const input = createReadStream(inputFile); input.on('error', error => child.stdin.destroy(error)); child.stdin.on('error', () => {}); input.pipe(child.stdin); }
  try {
    if (outputFile) handle = await fs.open(outputFile, 'wx');
    for await (const chunk of child.stdout) {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) { child.kill(); throw new Error('Phone database exceeds the 512 MB transfer limit.'); }
      hash.update(chunk);
      if (handle) await handle.writeFile(chunk);
      else if (inputFile) stdout += chunk.toString('utf8').slice(0, 4096);
    }
    await closed;
    return { sizeBytes, sha256: hash.digest('hex'), stdout: stdout.trim() };
  } catch (error) { child.kill(); throw error; }
  finally { clearTimeout(timer); if (handle) await handle.close(); }
}
function deviceReadArgs(serial, profile, direction) {
  return profile.package ? ['-s', serial, 'exec-out', 'run-as', profile.package, 'cat', profile[direction]] : ['-s', serial, 'exec-out', 'cat', profile[direction]];
}
export async function pullFubcsDatabase(serial, profileName, folder, store) {
  await checkedDevice(serial);
  const profile = profileFor(profileName), temp = path.join(folder, `${randomUUID()}.adb-part`);
  await fs.mkdir(folder, { recursive: true });
  try {
    await streamAdb(deviceReadArgs(serial, profile, 'download'), { outputFile: temp });
    return await store.receive(createReadStream(temp), folder, `USB ${profile.label} · ${serial}`);
  } finally { await fs.unlink(temp).catch(() => {}); }
}
export async function pushFubcsDatabase(serial, profileName, filePath, expectedSha256) {
  await checkedDevice(serial);
  const profile = profileFor(profileName);
  if (profile.package) {
    await command(['-s', serial, 'shell', 'run-as', profile.package, 'mkdir', '-p', 'files/Import']);
    await streamAdb(['-s', serial, 'exec-in', 'run-as', profile.package, 'sh', '-c', `cat > ${profile.import}`], { inputFile: filePath });
  } else {
    await command(['-s', serial, 'shell', 'mkdir', '-p', path.posix.dirname(profile.import)]);
    await command(['-s', serial, 'push', filePath, profile.import], 5 * 60 * 1000);
  }
  const verified = await streamAdb(deviceReadArgs(serial, profile, 'import'));
  if (verified.sha256 !== expectedSha256) throw new Error('The file on the Android device did not match the staged database.');
  return { ok: true, profile: profileName, serial, sizeBytes: verified.sizeBytes, sha256: verified.sha256 };
}
