import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TrainContractJson from "../contracts/train/target/train-Train.json" with { type: "json" };
import { updateData } from './utils.mjs';

const TrainContractArtifact = loadContractArtifact(TrainContractJson);
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [deployerWallet, src_receiver] = await getInitialTestAccountsWallets(pxe);
  const deployer = deployerWallet.getAddress();
  console.log(`Using wallet: ${deployer}`);

  console.log("Deploying TRAIN Protocol contract...");
  const train = await Contract.deploy(deployerWallet, TrainContractArtifact, [])
    .send()
    .deployed();
  console.log(`TRAIN Protocol contract deployed at ${train.address.toString()}`);

  updateData({
    train: train.address.toString(),
    deployer: deployer.toString(),
    src_receiver: src_receiver.getAddress().toString(),
  });
}

main().catch((err) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
