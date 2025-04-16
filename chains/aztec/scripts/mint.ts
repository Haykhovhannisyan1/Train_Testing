import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import {
  Contract,
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { updateData } from './utils.ts';

const TokenContractArtifact = TokenContract.artifact;
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main(): Promise<void> {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [recipientWallet, deployerWallet]: any[] =
    await getInitialTestAccountsWallets(pxe);
  const deployerAddress: string = deployerWallet.getAddress();
  console.log(`Using wallet: ${deployerAddress}`);

  console.log('Deploying token contract...');
  const token = await Contract.deploy(deployerWallet, TokenContractArtifact, [
    deployerAddress,
    'TRAIN',
    'TRN',
    18,
  ])
    .send()
    .deployed();
  console.log(`Token deployed at ${token.address.toString()}`);

  const amount = 9876543210n;
  console.log(`Minting ${amount} tokens...`);
  const contract = await Contract.at(
    token.address,
    TokenContractArtifact,
    deployerWallet,
  );
  const mintTx = await contract.methods
    .mint_to_public(deployerAddress, amount)
    .send()
    .wait();
  console.log(`Public mint successful in block ${mintTx.blockNumber}`);

  const balanceResult = await contract.methods
    .balance_of_public(deployerAddress)
    .simulate();
  console.log(`Public balance of ${deployerAddress}: ${balanceResult}`);

  const mintTx2 = await contract.methods
    .transfer_to_private(recipientWallet.getAddress(), amount / 2n)
    .send()
    .wait();
  await contract.methods
    .transfer_to_private(deployerWallet.getAddress(), amount / 2n)
    .send()
    .wait();
  console.log(`Private transfer successful in block ${mintTx2.blockNumber}`);

  const contract2 = await Contract.at(
    token.address,
    TokenContractArtifact,
    recipientWallet,
  );
  const balanceResult2 = await contract2.methods
    .balance_of_private(recipientWallet.getAddress())
    .simulate();
  console.log(`Balance of ${recipientWallet.getAddress()}: ${balanceResult2}`);
  console.log(
    `Balance of ${deployerAddress}: ${await contract.methods.balance_of_private(deployerAddress).simulate()}`,
  );

  updateData({
    token: token.address.toString(),
    tokenOwner: deployerWallet.getAddress(),
  });
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
