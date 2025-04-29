import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract } from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import {
  updateData,
  readData,
  generateId,
  publicLogs,
  simulateBlockPassing,
  getHTLCDetails,
  connectPXE,
} from './utils.ts';
import { CheatCodes } from '@aztec/aztec.js/testing';

const TrainContractArtifact = TrainContract.artifact;
const ethRpcUrl = 'http://localhost:8545';

async function main(): Promise<void> {
  const pxe = await connectPXE(8080);
  const cc = await CheatCodes.create([ethRpcUrl], pxe);

  const [senderWallet, recipientWallet, minter]: any[] =
    await getInitialTestAccountsWallets(pxe);
  const sender: string = senderWallet.getAddress();
  console.log(`Using wallet: ${sender}`);

  const data = readData();
  const Id = generateId();
  const wallet1 = data.wallet1;
  // const now = BigInt(Math.floor(Date.now() / 1000));
  const now  = await cc.eth.timestamp();
  // await cc.eth.warp(now);
  const timelock = now + 901;
  const token = data.token;
  const amount = 23n;
  const dst_chain = 'TON'.padEnd(8, ' ');
  const dst_asset = 'Toncoin'.padEnd(8, ' ');
  const dst_address = 'TONAddress'.padEnd(48, ' ');
  const randomness = generateId();
  const TokenContractArtifact = TokenContract.artifact;
  const asset = await Contract.at(token, TokenContractArtifact, senderWallet);
  const assetMinter = await TokenContract.at(data.token, recipientWallet);

  const transfer = asset
    .withWallet(senderWallet.getAddress())
    .methods.transfer_in_private(
      senderWallet.getAddress(),
      AztecAddress.fromString(data.train),
      amount,
      randomness,
    );

  const witness = await senderWallet.createAuthWit({
    caller: AztecAddress.fromString(data.train),
    action: transfer,
  });

  console.log(
    `private balance of sender ${senderWallet.getAddress()}: `,
    await assetMinter.methods
      .balance_of_private(senderWallet.getAddress())
      .simulate(),
  );
  const contract = await Contract.at(
    AztecAddress.fromString(data.train),
    TrainContractArtifact,
    senderWallet,
  );
  const is_contract_initialized = await contract.methods
    .is_contract_initialized(Id)
    .simulate();
  if (is_contract_initialized) throw new Error('HTLC Exsists');
  const commitTx = await contract.methods
    .commit_private_user(
      Id,
      AztecAddress.fromString(wallet1),
      timelock,
      AztecAddress.fromString(token),
      amount,
      dst_chain,
      dst_asset,
      dst_address,
      randomness,
    )
    .send({ authWitnesses: [witness] })
    .wait();

  console.log('tx : ', commitTx);
  console.log(
    `private balance of sender ${senderWallet.getAddress()}: `,
    await asset.methods
      .balance_of_private(senderWallet.getAddress())
      .simulate(),
  );

  await publicLogs(pxe);
  updateData({ commitId: Id.toString(), sender: senderWallet.getAddress() });
  await simulateBlockPassing(pxe, assetMinter, minter, 3);
  await getHTLCDetails(contract, Id);
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
