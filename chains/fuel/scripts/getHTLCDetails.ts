import { Contract, Wallet, Provider, Address,  WalletUnlocked } from 'fuels';
import * as fs from 'fs';
import * as path from 'path';
require('dotenv').config();

const filePath = path.join(__dirname, '../out/release/fuel-abi.json');
const contractAbi = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const contractAddressString = process.env.CONTRACT as string;

async function getHTLCDetials() {
  const providerUrl = process.env.PROVIDER?.trim();
  if (!providerUrl || !providerUrl.startsWith('http')) {
    throw new Error('Invalid PROVIDER URL. Please check your .env file.');
  }
  const provider = new Provider(providerUrl);
  const mnemonic = process.env.MNEMONIC as string;
  const wallet: WalletUnlocked = Wallet.fromMnemonic(mnemonic);
  wallet.connect(provider);

  const contractAddress = Address.fromB256(contractAddressString);
  const contractInstance = new Contract(contractAddress, contractAbi, wallet);
  const id = 2n;

  try {
    const { transactionId, waitForResult } = await contractInstance.functions
      .get_htlc_details(id)
      .call();

    const { value } = await waitForResult();

    console.log('tx id: ', transactionId);
    console.log('get_htlc_details function result:', value);
  } catch (error) {
    console.error('Error calling commit function:', error);
  }
}

getHTLCDetials().catch(console.error);
