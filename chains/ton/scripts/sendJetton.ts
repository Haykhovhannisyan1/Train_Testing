require('dotenv').config();
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { mnemonicToWalletKey } from 'ton-crypto';
import { TonClient4, WalletContractV5R1, Address, Cell, beginCell } from '@ton/ton';
import { toNano, sleep } from '../utils/utils';
import { TokenTransfer, JettonDefaultWallet } from '../build/SampleJetton/tact_JettonDefaultWallet';

export async function run() {
    const endpoint = await getHttpV4Endpoint({ network: 'testnet' });
    const client = new TonClient4({ endpoint });

    const mnemonic = process.env.MNEMONIC!;

    const key = await mnemonicToWalletKey(mnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });
    const walletContract = client.open(wallet);
    const walletSender = walletContract.sender(key.secretKey);
    const seqno = await walletContract.getSeqno();

    const contractAddress = Address.parse(process.env.userJettonWallet!);
    const newContract = JettonDefaultWallet.fromAddress(contractAddress);
    const contractProvider = client.open(newContract);

    const queryId = BigInt(Date.now());
    const amount = 100n;
    const destination = Address.parse('0QB5P3olLpEOqfnQAYFCrTNIT2gemPV8dfooGwjloJWsoAhf');
    const response_destination = Address.parse(process.env.sender!);
    const custom_payload: Cell | null = beginCell().storeInt(0, 32).storeStringTail('Success').endCell();
    const forward_ton_amount = toNano('0.1');
    const forward_payload = beginCell().storeStringTail('yuhu').endCell().asSlice();

    const tokenTransferMessage: TokenTransfer = {
        $$type: 'TokenTransfer',
        queryId,
        amount,
        destination,
        response_destination,
        custom_payload,
        forward_ton_amount,
        forward_payload,
    };

    console.log('Sending TokenTransfer message...');
    await contractProvider.send(walletSender, { value: toNano('0.2'), bounce: true }, tokenTransferMessage);

    let currentSeqno = seqno;
    while (currentSeqno == seqno) {
        console.log('Waiting for transaction to confirm...');
        await sleep(1500);
        currentSeqno = await walletContract.getSeqno();
    }
    console.log('Transaction confirmed!');
}

run().catch(console.error);
