import { Contract, Wallet, Provider, Address, DateTime, WalletUnlocked, Signer, sha256, arrayify, hexlify } from 'fuels';
import * as fs from 'fs';
import * as path from 'path';
require('dotenv').config();

const filePath = path.join(__dirname, '../out/release/fuel-abi.json');
const contractAbi = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
const contractAddressString = process.env.CONTRACT as string;

async function addLockSig() {
  const providerUrl = process.env.PROVIDER?.trim();
  if (!providerUrl || !providerUrl.startsWith('http')) {
    throw new Error('Invalid PROVIDER URL. Please check your .env file.');
  }

  const provider = new Provider(providerUrl);
  const signerMnemonic = process.env.MNEMONIC as string;
  const signerWallet: WalletUnlocked = Wallet.fromMnemonic(signerMnemonic);
  signerWallet.connect(provider);
  
  const senderMnemonic = process.env.MNEMONIC2 as string;
  const senderWallet: WalletUnlocked = Wallet.fromMnemonic(senderMnemonic);
  senderWallet.connect(provider);

  const contractAddress = Address.fromB256(contractAddressString);
  const contractInstance = new Contract(contractAddress, contractAbi, senderWallet);
  const Id = 3n;
  const hashlock = '0xd25c96a5a03ec5f58893c6e3d23d31751a1b2f0e09792631d5d2463f5a147187';
  const currentUnixTime = Math.floor(Date.now() / 1000) + 900;
  const timelock = DateTime.fromUnixSeconds(currentUnixTime).toTai64();

  const IdHex = '0x' + Id.toString(16).padStart(64, '0');
  const timelockHex = '0x' + BigInt(timelock).toString(16).padStart(64, '0');

  const msg = [IdHex,hashlock,timelockHex];

  const msgBytes = Uint8Array.from(
  msg.flatMap(hexStr => Array.from(arrayify(hexStr)))
);
  let signedmessage = signerWallet.signer().sign(sha256(msgBytes))
  const signature  = hexlify(signedmessage) 
  console.log('signiature verifeid off chain: ',signerWallet.address.toB256() == Signer.recoverAddress(sha256(msgBytes),signature).toB256());

  try {
    const { transactionId, waitForResult } = await contractInstance.functions
      .add_lock_sig(signature,IdHex,hashlock,timelock)
      .call();

    const { logs,value } = await waitForResult();

    console.log('tx id: ', transactionId);
    console.log('add_lock function logs: ',logs[0]);
    console.log('add_lock function result:', value);
  } catch (error) {
    console.error('Error calling add_lock function:', error);
  }
}

addLockSig().catch(console.error);


