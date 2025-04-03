import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TokenContractJson from "../contracts/token/target/token-Token.json" assert { type: "json" };
import { writeFileSync } from 'fs';

const TokenContractArtifact = loadContractArtifact(TokenContractJson);
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [ownerWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();
  console.log(`Using wallet: ${ownerAddress}`);

  console.log("Deploying token contract...");
  const token = await Contract.deploy(ownerWallet, TokenContractArtifact, [ownerAddress, 'TRAIN', 'TRN', 18])
    .send()
    .deployed();
  console.log(`Token deployed at ${token.address.toString()}`);

  const amount = 1234n;
  console.log(`Minting ${amount} tokens...`);
  const contract = await Contract.at(token.address, TokenContractArtifact, ownerWallet);
  const mintTx = await contract.methods.mint_to_public(ownerAddress, amount).send().wait();
  console.log(`Mint successful in block ${mintTx.blockNumber}`);

  const balanceResult = await contract.methods.balance_of_public(ownerAddress).simulate();
  console.log(`Balance of ${ownerAddress} : ${balanceResult}`);
  const tokenData = { token: token.address.toString(), owner: ownerAddress.toString() };
  writeFileSync('tokenData.json', JSON.stringify(tokenData, null, 2));
}

main().catch((err) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
