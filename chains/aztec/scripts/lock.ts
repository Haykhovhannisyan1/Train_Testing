import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AztecAddress,
  Contract,
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import {
  updateData,
  readData,
  generateSecretAndHashlock,
  generateId,
  publicLogs,
  getHTLCDetails,
  simulateBlockPassing,
  connectPXE,
} from './utils.ts';
import { CheatCodes } from '@aztec/aztec.js/testing';

const TrainContractArtifact = TrainContract.artifact;
const ethRpcUrl = 'http://localhost:8545';

async function main(): Promise<void> {
  const pxe = await connectPXE(8080);
  const cc = await CheatCodes.create([ethRpcUrl], pxe);

  const [solverWallet, recipientWallet]: any[] =
    await getInitialTestAccountsWallets(pxe);
  const solver: string = solverWallet.getAddress();
  console.log(`Using wallet: ${solver}`);

  const data = readData();
  const Id = generateId();
  const pair = generateSecretAndHashlock();
  const hashlock = pair[1];
  const amount = 7n;
  // const now = BigInt(Math.floor(Date.now() / 1000));
  const now = await cc.eth.timestamp();
  // await cc.eth.warp(now);
  const timelock = now + 2701;
  const token: string = data.token;
  const randomness = generateId();
  const dst_chain = 'TON'.padEnd(8, ' ');
  const dst_asset = 'Toncoin'.padEnd(8, ' ');
  const dst_address = 'TONAddress'.padEnd(48, ' ');

  // Token contract operations using auth witness
  const TokenContractArtifact = TokenContract.artifact;
  const asset = await Contract.at(
    AztecAddress.fromString(token),
    TokenContractArtifact,
    solverWallet,
  );

  const transfer = asset
    .withWallet(solverWallet.getAddress())
    .methods.transfer_to_public(
      solverWallet.getAddress(),
      AztecAddress.fromString(data.train),
      amount,
      randomness,
    );

  const witness = await solverWallet.createAuthWit({
    caller: AztecAddress.fromString(data.train),
    action: transfer,
  });

  const privateBalanceBefore = await asset.methods
    .balance_of_private(solverWallet.getAddress())
    .simulate();
  console.log('private balance of solver: ', privateBalanceBefore);
  console.log(
    'public balance of Train: ',
    await asset.methods.balance_of_public(data.train).simulate(),
  );

  const contract = await Contract.at(
    data.train,
    TrainContractArtifact,
    solverWallet,
  );
  const is_contract_initialized = await contract.methods
    .is_contract_initialized(Id)
    .simulate();
  if (is_contract_initialized) throw new Error('HTLC Exsists');
  const lockTx = await contract.methods
    .lock_private_solver(
      Id,
      hashlock,
      amount,
      timelock,
      token,
      randomness,
      dst_chain,
      dst_asset,
      dst_address,
    )
    .send({ authWitnesses: [witness] })
    .wait();
  console.log('tx : ', lockTx);

  const privateBalanceAfter = await asset.methods
    .balance_of_private(solverWallet.getAddress())
    .simulate();
  console.log('private balance of solver: ', privateBalanceAfter);
  console.log(
    'public balance of Train: ',
    await asset.methods.balance_of_public(data.train).simulate(),
  );
  publicLogs(pxe);

  updateData({
    lockId: Id.toString(),
    hashlock: pair[1].toString(),
    secret: pair[0].toString(),
  });
  const assetMinter = await TokenContract.at(data.token, recipientWallet);
  await simulateBlockPassing(pxe, assetMinter, recipientWallet, 3);
  await getHTLCDetails(contract, Id);
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
