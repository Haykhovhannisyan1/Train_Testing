require('dotenv').config()
import { HttpClient, Api } from 'tonapi-sdk-js';
import { Cell } from '@ton/core';
import { Address } from 'ton';
import { hexToBase64 } from '../utils/utils';
import { loadTokenCommitted,loadTokenRedeemed,loadTokenLocked } from '../wrappers/HashedTimeLockTON';

async function parseEmit(address: string, token: string, index: number) {
    const httpClient = new HttpClient({
        baseUrl: 'https://testnet.tonapi.io',
        baseApiParams: {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-type': 'application/json'
            }
        }
    });

    const client = new Api(httpClient);

    try {
        const tx = await client.blockchain.getBlockchainAccountTransactions(Address.parse(address).toString());
        for (let i = 0; i < tx.transactions[index].out_msgs.length; i++) {
            if (tx.transactions[index].out_msgs[i].msg_type === 'ext_out_msg') {
                let rawBody = tx.transactions[index].out_msgs[i].raw_body??"";
                let slc = Cell.fromBase64(hexToBase64(rawBody)).beginParse();
                let opCode = tx.transactions[index].out_msgs[i].op_code;
                switch (opCode) {
                    case "0x6564cfc9":
                        return loadTokenRedeemed(slc);
                    case "0x95b0219d":
                        return loadTokenLocked(slc);
                    case "0x71f9f7aa":
                        return loadTokenCommitted(slc);
                    default:
                        return "No op code match";
                }
            }
        }
    } catch (error) {
        console.error("Error fetching data from TON API:", error);
    }
}

const address = process.env.CONTRACT!; 
const token = process.env.TOKEN!; 

parseEmit(address, token, 0)
    .then(result => console.log(result))
    .catch(error => console.error("Error processing request:", error));




