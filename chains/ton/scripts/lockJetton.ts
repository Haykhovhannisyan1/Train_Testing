require('dotenv').config();
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { mnemonicToWalletKey } from 'ton-crypto';
import { TonClient4, WalletContractV5R1, Address, Cell, beginCell } from '@ton/ton';
import { toNano, sleep } from '../utils/utils';
import { TokenTransfer, JettonDefaultWallet } from '../build/SampleJetton/tact_JettonDefaultWallet';
import { Builder } from '../build/jetton_train/tact_TrainJetton';

export async function run() {
    const endpoint = await getHttpV4Endpoint({ network: 'testnet' });
    const client = new TonClient4({ endpoint });

    const mnemonic = process.env.MNEMONIC!;
    const key = await mnemonicToWalletKey(mnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });

    const walletContract = client.open(wallet);
    const walletSender = walletContract.sender(key.secretKey);
    const seqno = await walletContract.getSeqno();

    // jetton wallet address of lp
    const contractAddress = Address.parse(process.env.userJettonWallet!);

    const newContract = JettonDefaultWallet.fromAddress(contractAddress);
    const contractProvider = client.open(newContract);

    const queryId = BigInt(Date.now());
    const amount = 19n;
    const destination = Address.parse(process.env.destination!);
    const response_destination = Address.parse(process.env.sender!);
    const custom_payload: Cell | null = beginCell().storeInt(0, 32).storeStringTail('Success').endCell();
    const forward_ton_amount = toNano('0.1');

    const hashlock = BigInt(process.env.hashlock!);
    const Id = BigInt(process.env.id2!);
    const dstChain: string = 'STARKNET_SEPOLIA';
    const dstAsset: string = 'ETH';
    const dstAddress: string = '0x0430a74277723D1EBba7119339F0F8276ca946c1B2c73DE7636Fd9EBA31e1c1f';
    const srcAsset: string = 'Abr Jbr';
    const srcReceiver: Address = Address.parse(process.env.srcReceiver!);
    const timelock = BigInt(Math.floor(Date.now() / 1000) + 18005);
    const reward = 3n;
    const rewardTimelock = BigInt(Math.floor(Date.now() / 1000) + 305);
    const jettonMasterAddress = Address.parse(process.env.jettonMasterAddress!);
    const htlcJettonWalletAddress = Address.parse(process.env.htlcJettonWalletAddress!);

    let b_0 = new Builder();
    b_0.storeInt(Id, 257);
    b_0.storeInt(timelock, 257);
    b_0.storeInt(reward, 257);
    let b_1 = new Builder();
    b_1.storeInt(rewardTimelock, 257);
    b_1.storeAddress(srcReceiver);
    b_1.storeStringRefTail(srcAsset);
    b_1.storeStringRefTail(dstChain);
    b_1.storeStringRefTail(dstAddress);
    let b_2 = new Builder();
    b_2.storeStringRefTail(dstAsset);
    b_2.storeInt(hashlock, 257);
    b_2.storeAddress(jettonMasterAddress);
    b_2.storeAddress(htlcJettonWalletAddress);
    b_1.storeRef(b_2.endCell());
    b_0.storeRef(b_1.endCell());
    const forward_payload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(317164721, 32).storeBuilder(b_0).endCell())
        .endCell()
        .asSlice();

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
