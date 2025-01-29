import { toNano, Cell } from '@ton/core';
import { SampleJetton } from '../wrappers/SampleJetton';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from "@ton/ton";

export async function run(provider: NetworkProvider) {
    const owner = Address.parse('0QBWRYE3_suXo4Ihtii5ZP4KTgY8bJ5ZRgCvxi5LqpJ7UO_H'); 
    const content = new Cell(); 
    const maxSupply = 1000000000000000000n; 

    const sampleJetton = provider.open(await SampleJetton.fromInit(owner, content, maxSupply));

    await sampleJetton.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Mint',
            amount: 10000000000n,
            receiver: Address.parse('0QBWRYE3_suXo4Ihtii5ZP4KTgY8bJ5ZRgCvxi5LqpJ7UO_H'),
        },
    );

    await provider.waitForDeploy(sampleJetton.address);

}
