use dep::aztec::prelude::AztecAddress;
use dep::aztec::protocol_types::traits::{Packable, Serialize};

#[derive(Serialize)]
pub struct TokenCommitted {
    pub Id: Field,
    pub amount: u128,
    pub token: AztecAddress,
    pub timelock: u64,
    pub dst_chain: str<8>,
    pub dst_asset: str<8>,
    pub dst_address: str<48>,
    pub src_receiver: AztecAddress,
}

impl Packable<9> for TokenCommitted {
    fn pack(self) -> [Field; 9] {
        let zero: Field = 0;
        let mut out = [zero; 9];
        out[0] = self.Id;
        out[1] = self.amount as Field;
        out[2] = self.token.inner;
        out[3] = self.timelock as Field;

        let dst_chain_byte_array = self.dst_chain.as_bytes();
        let mut dst_chain_byte_array_filled = [0 as u8; 31];
        for i in 0..dst_chain_byte_array.len() {
            dst_chain_byte_array_filled[i] = dst_chain_byte_array[i];
        }

        out[4] = Field::from_be_bytes::<31>(dst_chain_byte_array_filled);

        let dst_asset_byte_array = self.dst_asset.as_bytes();
        let mut dst_asset_byte_array_filled = [0 as u8; 31];
        for i in 0..dst_asset_byte_array.len() {
            dst_asset_byte_array_filled[i] = dst_asset_byte_array[i];
        }

        out[5] = Field::from_be_bytes::<31>(dst_asset_byte_array_filled);

        let dst_address_byte_array = self.dst_address.as_bytes();
        let mut dst_address_byte_array_filled_1 = [0 as u8; 31];
        let mut dst_address_byte_array_filled_2 = [0 as u8; 31];

        for i in 0..31 {
            dst_address_byte_array_filled_1[i] = dst_address_byte_array[i];
        }

        for i in 31..48 {
            dst_address_byte_array_filled_2[i - 31] = dst_address_byte_array[i];
        }

        out[6] = Field::from_be_bytes::<31>(dst_address_byte_array_filled_1);
        out[7] = Field::from_be_bytes::<31>(dst_address_byte_array_filled_2);

        out[8] = self.src_receiver.inner;
        out
    }

    fn unpack(fields: [Field; 9]) -> Self {
        assert(false, "unpack not implemented");
        TokenCommitted {
            Id: fields[0] as Field,
            amount: 0 as u128,
            token: AztecAddress::zero(),
            timelock: 0 as u64,
            dst_chain: "00000000",
            dst_asset: "00000000",
            dst_address: "000000000000000000000000000000000000000000000000",
            src_receiver: AztecAddress::zero(),
        }
    }
}

#[derive(Serialize)]
pub struct TokenLockAdded {
    pub Id: Field,
    pub hashlock: [u8; 32],
    pub timelock: u64,
}

impl Packable<4> for TokenLockAdded {
    fn pack(self) -> [Field; 4] {
        let mut out = [0 as Field; 4];
        out[0] = self.Id;

        let hb = self.hashlock;
        let mut h1 = [0 as u8; 31];
        for i in 0..31 {
            h1[i] = hb[i];
        }
        out[1] = Field::from_be_bytes::<31>(h1);

        let mut h2 = [0 as u8; 31];
        h2[0] = hb[31];
        out[2] = Field::from_be_bytes::<31>(h2);

        out[3] = self.timelock as Field;
        out
    }

    fn unpack(fields: [Field; 4]) -> Self {
        let Id = fields[0];

        let b1 = fields[1].to_be_bytes();
        let b2 = fields[2].to_be_bytes();
        let mut hash = [0 as u8; 32];
        for i in 0..31 {
            hash[i] = b1[i];
        }
        hash[31] = b2[0];

        let timelock = fields[3] as u64;

        TokenLockAdded { Id, hashlock: hash, timelock }
    }
}

#[derive(Serialize)]
pub struct TokenRefunded {
    pub Id: Field,
}

#[derive(Serialize)]
pub struct TokenRedeemed {
    pub Id: Field,
    pub hashlock: [u8; 32],
    pub secret: [u8; 32],
}

impl Packable<5> for TokenRedeemed {
    fn pack(self) -> [Field; 5] {
        let mut out = [0 as Field; 5];
        out[0] = self.Id;

        let hb = self.hashlock;
        let mut h1 = [0 as u8; 31];
        for i in 0..31 {
            h1[i] = hb[i];
        }
        out[1] = Field::from_be_bytes::<31>(h1);
        let mut h2 = [0 as u8; 31];
        h2[0] = hb[31];
        out[2] = Field::from_be_bytes::<31>(h2);

        let sb = self.secret;
        let mut s1 = [0 as u8; 31];
        for i in 0..31 {
            s1[i] = sb[i];
        }
        out[3] = Field::from_be_bytes::<31>(s1);
        let mut s2 = [0 as u8; 31];
        s2[0] = sb[31];
        out[4] = Field::from_be_bytes::<31>(s2);

        out
    }

    fn unpack(fields: [Field; 5]) -> Self {
        let Id = fields[0];

        let b1 = fields[1].to_be_bytes();
        let b2 = fields[2].to_be_bytes();
        let mut hashlock = [0 as u8; 32];
        for i in 0..31 {
            hashlock[i] = b1[i];
        }
        hashlock[31] = b2[0];

        let b3 = fields[3].to_be_bytes();
        let b4 = fields[4].to_be_bytes();
        let mut secret = [0 as u8; 32];
        for i in 0..31 {
            secret[i] = b3[i];
        }
        secret[31] = b4[0];

        TokenRedeemed { Id, hashlock, secret }
    }
}

#[derive(Serialize)]
pub struct TokenLocked {
    pub Id: Field,
    pub hashlock: [u8; 32],
    pub amount: u128,
    pub token: AztecAddress,
    pub timelock: u64,
    pub dst_chain: str<8>,
    pub dst_asset: str<8>,
    pub dst_address: str<48>,
}

impl Packable<10> for TokenLocked {
    fn pack(self) -> [Field; 10] {
        let mut out = [0 as Field; 10];
        out[0] = self.Id;

        let hb = self.hashlock;
        let mut h1 = [0 as u8; 31];
        for i in 0..31 {
            h1[i] = hb[i];
        }
        out[1] = Field::from_be_bytes::<31>(h1);

        let mut h2 = [0 as u8; 31];
        h2[0] = hb[31];
        out[2] = Field::from_be_bytes::<31>(h2);

        out[3] = self.amount as Field;
        out[4] = self.token.inner;
        out[5] = self.timelock as Field;

        let dst_chain_byte_array = self.dst_chain.as_bytes();
        let mut dst_chain_byte_array_filled = [0 as u8; 31];
        for i in 0..dst_chain_byte_array.len() {
            dst_chain_byte_array_filled[i] = dst_chain_byte_array[i];
        }
        out[6] = Field::from_be_bytes::<31>(dst_chain_byte_array_filled);

        let dst_asset_byte_array = self.dst_asset.as_bytes();
        let mut dst_asset_byte_array_filled = [0 as u8; 31];
        for i in 0..dst_asset_byte_array.len() {
            dst_asset_byte_array_filled[i] = dst_asset_byte_array[i];
        }
        out[7] = Field::from_be_bytes::<31>(dst_asset_byte_array_filled);

        let addr = self.dst_address.as_bytes();
        let mut dst_address_byte_array_filled_1 = [0 as u8; 31];
        let mut dst_address_byte_array_filled_2 = [0 as u8; 31];
        for i in 0..31 {
            dst_address_byte_array_filled_1[i] = addr[i];
        }
        for i in 31..48 {
            dst_address_byte_array_filled_2[i - 31] = addr[i];
        }
        out[8] = Field::from_be_bytes::<31>(dst_address_byte_array_filled_1);
        out[9] = Field::from_be_bytes::<31>(dst_address_byte_array_filled_2);

        out
    }

    fn unpack(fields: [Field; 10]) -> Self {
        assert(false, "unpack not implemented");
        TokenLocked {
            Id: fields[0] as Field,
            hashlock: [0 as u8; 32],
            amount: 0 as u128,
            token: AztecAddress::zero(),
            timelock: 0 as u64,
            dst_chain: "00000000",
            dst_asset: "00000000",
            dst_address: "000000000000000000000000000000000000000000000000",
        }
    }
}
