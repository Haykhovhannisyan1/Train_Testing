import { existsSync, readFileSync, writeFileSync } from 'fs';
import crypto from 'crypto';

const dataFile = 'data.json';

export function updateData(newData) {
  let data = {};
  if (existsSync(dataFile)) {
    try {
      data = JSON.parse(readFileSync(dataFile, 'utf8'));
    } catch (error) {
      console.error('Error reading data file, starting fresh.');
    }
  }
  Object.assign(data, newData);
  writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

export function readData() {
  if (!existsSync(dataFile)) {
    console.error(`File ${dataFile} does not exist.`);
    return {};
  }
  try {
    const data = readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return {};
  }
}

export function generateSecretAndHashlock() {
  const secret = crypto.randomBytes(32);
  const hashlock = crypto.createHash('sha256').update(secret).digest();
  return [new Uint8Array(secret), new Uint8Array(hashlock)];
}

export function generateId() {
  const bytes = crypto.randomBytes(24);
  return BigInt('0x' + bytes.toString('hex'));
}

export async function publicLogs(pxe) {
  const fromBlock = await pxe.getBlockNumber();
  const logFilter = { fromBlock, toBlock: fromBlock + 1 };
  const { logs } = await pxe.getPublicLogs(logFilter);
  console.log("Public logs: ", logs);
  return logs;
}

export function stringToUint8Array(str) {
  return new Uint8Array(
    str.split(',').map(num => Number(num.trim()))
  );
}
