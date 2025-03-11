import { Contract, Wallet, Provider, Address, DateTime, bn } from 'fuels';
import * as fs from 'fs';
import * as path from 'path';
require('dotenv').config();

const filePath = path.join(__dirname, '../out/release/fuel-abi.json');
const contractAbi = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
const contractAddressString = process.env.CONTRACT as string;

async function commit(): Promise<void> {
  const providerUrl = process.env.PROVIDER?.trim();
  if (!providerUrl || !providerUrl.startsWith('http')) {
    throw new Error('Invalid PROVIDER URL. Please check your .env file.');
  }

  const provider = new Provider(providerUrl);
  const mnemonic = process.env.MNEMONIC as string;
  const wallet = Wallet.fromMnemonic(mnemonic);
  wallet.connect(provider);

    const hopChains = [
      'TON'.padEnd(64, ' '),
      'TON'.padEnd(64, ' '),
      'TON'.padEnd(64, ' '),
      'TON'.padEnd(64, ' '),
      'TON'.padEnd(64, ' '),
    ];
    const hopAssets = [
      'Toncoin'.padEnd(64, ' '),
      'Toncoin'.padEnd(64, ' '),
      'Toncoin'.padEnd(64, ' '),
      'Toncoin'.padEnd(64, ' '),
      'Toncoin'.padEnd(64, ' '),
    ];
    const hopAddresses = [
      '0QAS8JNB0G4zVkdxABCLVG-Vy3KXE3W3zz1yxpnfu4J-B40y'.padEnd(64, ' '),
      '0QAS8JNB0G4zVkdxABCLVG-Vy3KXE3W3zz1yxpnfu4J-B40y'.padEnd(64, ' '),
      '0QAS8JNB0G4zVkdxABCLVG-Vy3KXE3W3zz1yxpnfu4J-B40y'.padEnd(64, ' '),
      '0QAS8JNB0G4zVkdxABCLVG-Vy3KXE3W3zz1yxpnfu4J-B40y'.padEnd(64, ' '),
      '0QAS8JNB0G4zVkdxABCLVG-Vy3KXE3W3zz1yxpnfu4J-B40y'.padEnd(64, ' '),
    ];
    const dstChain = 'TON'.padEnd(64, ' ');
    const dstAsset = 'Toncoin'.padEnd(64, ' ');
    const dstAddress = '0QAS8JNB0G4zVkdxABCLVG-Vy3KXE3W3zz1yxpnfu4J-B40y'.padEnd(64, ' ');
    const srcAsset = 'ETH'.padEnd(64, ' ');
    const srcReceiver = { bits: '0x6364b23e8c34d46d0b68d20e0c1463230a9243a1dd710a7dd8b32dfb927af53a' };
    const currentUnixTime = Math.floor(Date.now() / 1000) + 901;
    const timelock = DateTime.fromUnixSeconds(currentUnixTime).toTai64();
    const id = 59943134349793186014852117031609194998356693162420944899250311160443274393177n;

    const contractAddress = Address.fromB256(contractAddressString);
    const contractInstance = new Contract(contractAddress, contractAbi, wallet);

    try {
      const { transactionId, waitForResult } = await contractInstance.functions
        .commit(hopChains, hopAssets, hopAddresses, dstChain, dstAsset, dstAddress, srcAsset,id, srcReceiver, timelock)
        .callParams({
          forward: [1,await provider.getBaseAssetId()],
        })
        .call();

      const { logs, value } = await waitForResult();

      console.log('tx id: ', transactionId);
      console.log('Commit function logs:', logs);
      console.log('Commit function result:', value);
    } catch (error) {
      console.error('Error calling commit function:', error);
    }
}

commit().catch(console.error);
