const ethers = require('ethers');
const { toCompactSignature } = require('../utils/compactSignature.js');
require('dotenv').config();

async function signHTLC() {
  const domain = {
    name: 'TRAIN Protocol',
    version: '1',
    chainId: 9889,
    verifyingContract: '0xe26b951b5a0c48c8a4780ba113c239c78de810d3',
  };

  const domainSeparator = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes'],
      [
        ethers.keccak256(
          ethers.toUtf8Bytes('SRC16Domain(string name,string version,uint256 chainId,contractId verifyingContract)')
        ),
        ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
        ethers.keccak256(ethers.toUtf8Bytes(domain.version)),
        domain.chainId,
        domain.verifyingContract,
      ]
    )
  );

  console.log('Computed Domain Separator:', domainSeparator);

  const types = {
    addLockMsg: [
      { name: 'Id', type: 'uint256' },
      { name: 'hashlock', type: 'bytes32' },
      { name: 'timelock', type: 'uint64' },
    ],
  };

  const message = {
    Id: '0x84869c9a37a4772401786b5a79ab9dae738685ea7f3825c6a2ae01d15d0df659',
    hashlock: '0xe6edfc9189e2db427d7b7ce83118722729021e125569c3eb76b6700804533ad4',
    timelock: 1741673832,
  };

  const privateKey = process.env.MNEMONIC;
  const wallet = ethers.Wallet.fromPhrase(privateKey);

  const signature = await wallet.signTypedData(domain, types, message);

  console.log('Signature:', signature);
  console.log('Compact Signature:', toCompactSignature(signature));

  const sig = ethers.Signature.from(signature);
  console.log({
    r: sig.r,
    s: sig.s,
    v: sig.v,
  });
}

signHTLC().catch(console.error);
