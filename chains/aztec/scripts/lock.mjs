import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TrainContractJson from "../contracts/train/target/train-Train.json" with { type: "json" };
import TokenContractJson from "../contracts/token/target/token-Token.json" with { type: "json" };
import { updateData, readData, generateSecretAndHashlock,generateId, publicLogs} from './utils.mjs';

const TrainContractArtifact = loadContractArtifact(TrainContractJson);
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [solverWallet] = await getInitialTestAccountsWallets(pxe);
  const solver = solverWallet.getAddress();
  console.log(`Using wallet: ${solver}`);

  const data = readData();
  const Id = generateId();
  const pair = generateSecretAndHashlock();
  const hashlock = pair[1];
  const amount = 7n;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timelock = now + 2900n;
  const token = data.token;
  const randomness = generateId();
  const dst_chain = 'TON'.padEnd(8, ' ');
  const dst_asset = 'Toncoin'.padEnd(8, ' ');
  const dst_address = 'TONAddress'.padEnd(48, ' ');

    // Authwit
  const TokenContractArtifact = loadContractArtifact(TokenContractJson);
  const asset = await Contract.at(token, TokenContractArtifact, solverWallet);
  
  const transfer = asset
    .withWallet(solverWallet.getAddress())
    .methods.transfer_in_private(
      solverWallet.getAddress(),
      AztecAddress.fromString(data.train),
      amount,
      randomness
    );
  // console.log("transfer: ", transfer);

  const witness = await solverWallet.createAuthWit({
    caller: AztecAddress.fromString(data.train),
    action: transfer,
  });
  // console.log("witness: ", witness);
  console.log("private balance of solver: ",await asset.methods.balance_of_private(solverWallet.getAddress()).simulate());
  const contract = await Contract.at(data.train, TrainContractArtifact, solverWallet);
  const lockTx = await contract.methods.lock_private_solver(
    Id, hashlock, amount, timelock, token, randomness,
    dst_chain, dst_asset, dst_address
  ).send({ authWitnesses: [witness] }).wait();
  console.log("tx : ", lockTx);
  console.log("private balance of solver: ",await asset.methods.balance_of_private(solverWallet.getAddress()).simulate())
  publicLogs(pxe);
  updateData({lockId: Id.toString(),hashlock: pair[1].toString(),secret: pair[0].toString()})
}

main().catch((err) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
