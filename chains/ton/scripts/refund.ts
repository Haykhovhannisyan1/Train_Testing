require('dotenv').config();
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { mnemonicToWalletKey } from 'ton-crypto';
import { TonClient4, WalletContractV5R1, Address } from '@ton/ton';
import { Refund, Train } from '../build/train/tact_Train';
import { sleep, toNano } from '../utils/utils';

export async function run() {
    const endpoint = await getHttpV4Endpoint({ network: 'testnet' });
    const client = new TonClient4({ endpoint });

    const mnemonic = process.env.MNEMONIC!;
    const key = await mnemonicToWalletKey(mnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });

    const walletContract = client.open(wallet);
    const walletSender = walletContract.sender(key.secretKey);
    const seqno = await walletContract.getSeqno();

    const contractAddress = Address.parse(process.env.JETTONCONTRACT!);
    const newContract = Train.fromAddress(contractAddress);
    const contractProvider = client.open(newContract);

    const Id = BigInt(process.env.id!);

    const unlockMessage: Refund = {
        $$type: 'Refund',
        Id: Id,
    };

    console.log('Sending Refund message...');
    await contractProvider.send(walletSender, { value: toNano('0.3'), bounce: true }, unlockMessage);

    let currentSeqno = seqno;
    while (currentSeqno == seqno) {
        console.log('Waiting for transaction to confirm...');
        await sleep(1500);
        currentSeqno = await walletContract.getSeqno();
    }
    console.log('Transaction confirmed!');
}

run().catch(console.error);
