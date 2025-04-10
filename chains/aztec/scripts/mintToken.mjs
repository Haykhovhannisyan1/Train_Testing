import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TokenContractJson from "../contracts/token/target/token-Token.json" assert { type: "json" };
import { updateData } from './utils.mjs';

const TokenContractArtifact = loadContractArtifact(TokenContractJson);
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [recipientWallet , deployerWallet] = await getInitialTestAccountsWallets(pxe);
  const deployerAddress = deployerWallet .getAddress();
  console.log(`Using wallet: ${deployerAddress}`);

  console.log("Deploying token contract...");
  const token = await Contract.deploy(deployerWallet , TokenContractArtifact, [deployerAddress, 'TRAIN', 'TRN', 18])
    .send()
    .deployed();
  console.log(`Token deployed at ${token.address.toString()}`);

  const amount = 9876543210n;
  console.log(`Minting ${amount} tokens...`);
  const contract = await Contract.at(token.address, TokenContractArtifact, deployerWallet );
  const mintTx = await contract.methods.mint_to_public(deployerAddress, amount).send().wait();
  console.log(`Public mint successful in block ${mintTx.blockNumber}`);

  const balanceResult = await contract.methods.balance_of_public(deployerAddress).simulate();
  console.log(`Balance of ${deployerAddress} : ${balanceResult}`);

  const mintTx2 = await contract.methods.transfer_to_private(recipientWallet.getAddress(), amount/2n).send().wait();
  console.log(`Private transfer successful in block ${mintTx2.blockNumber}`);

  const balanceResult2 = await contract.methods.balance_of_private(recipientWallet.getAddress()).simulate();
  console.log(`Balance of ${recipientWallet.getAddress()} : ${balanceResult2}`);

  updateData({
    token: token.address.toString(),
    tokenOwner: deployerWallet.getAddress(),
});
}

main().catch((err) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
