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
  generateId,
  publicLogs,
  simulateBlockPassing,
  getHTLCDetails,
} from './utils.ts';

const TrainContractArtifact = TrainContract.artifact;
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main(): Promise<void> {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [senderWallet, recipientWallet, minter]: any[] =
    await getInitialTestAccountsWallets(pxe);
  const sender: string = senderWallet.getAddress();
  console.log(`Using wallet: ${sender}`);

  const data = readData();
  const Id = generateId();
  const src_receiver = data.src_receiver;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timelock = now + 2000n;
  const token = data.token;
  const amount = 3n;
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
  const commitTx = await contract.methods
    .commit_private_user(
      Id,
      AztecAddress.fromString(src_receiver),
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
