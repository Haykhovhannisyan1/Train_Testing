const ethers = require("ethers");
require("dotenv").config();

async function signHTLC() {
    const domain = {
      name: 'Train',
      version: '1',
      chainId: 11155111,
      verifyingContract: '0xeb9B3351a095647dee460AD483DcC2c5D21487CE',
    };

    const domainSeparator = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
            [
                ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
                ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
                ethers.keccak256(ethers.toUtf8Bytes(domain.version)),
                domain.chainId,
                domain.verifyingContract
            ]
        )
    );

    console.log('Computed Domain Separator:', domainSeparator);

    const types = {
        addLockMsg: [
            { name: "Id", type: "bytes32" },
            { name: "hashlock", type: "bytes32" },
            { name: "timelock", type: "uint48" },
        ],
    };

    const message = {
      Id: '0x21cca7f40cb32536e5b648b51d4ea800a107fce6c98c393dbea187ba8c4dca4a',
      hashlock: '0x3b7674662e6569056cef73dab8b7809085a32beda0e8eb9e9b580cfc2af22a55',
      timelock: 99999999999,
    };

    const privateKey =  process.env.PRIV_KEY;
    const wallet = new ethers.Wallet(privateKey);

    const signature = await wallet.signTypedData(domain, types, message);

    console.log("Signature:", signature);    

    const sig = ethers.Signature.from(signature);
    console.log({
        r: sig.r,
        s: sig.s,
        v: sig.v
    });
}

signHTLC().catch(console.error);