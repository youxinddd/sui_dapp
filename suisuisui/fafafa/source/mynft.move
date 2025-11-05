// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

module fafafa::my_nft;

use sui::random::{Random, new_generator, generate_u64_in_range};
use std::string;
use sui::event;
use sui::url::{Self, Url};

/// An example NFT that can be minted by anybody
public struct MyNFT has key, store {
    id: UID,
    /// Name for the token
    name: string::String,
    /// Description of the token
    description: string::String,
    /// URL for the token
    url: Url,
    // TODO: allow custom attributes
    detail: Url,
}

// ===== Events =====

public struct NFTMinted has copy, drop {
    object_id: ID,
    creator: address,
    name: string::String,
}

// ===== Public view functions =====

/// Get the NFT's `name`
public fun name(nft: &MyNFT): &string::String {
    &nft.name
}

/// Get the NFT's `description`
public fun description(nft: &MyNFT): &string::String {
    &nft.description
}

/// Get the NFT's `url`
public fun url(nft: &MyNFT): &Url {
    &nft.url
}

/// Get the NFT's `url`
public fun detail(nft: &MyNFT): &Url {
    &nft.detail
}

const VARIANT_COUNT: u64 = 9;

fun metadata_tables(): (
    vector<vector<u8>>,
    vector<vector<u8>>,
    vector<vector<u8>>,
    vector<vector<u8>>,
) {
    (
        vector[
            b"惊恐猫",
            b"暗黑鲲",
            b"大马猩",
            b"暴恐龙",
            b"小屁猴",
            b"萝莉马",
            b"蓝影邪龙",
            b"卖报兔",
            b"小奶虎",
        ],
        vector[
            b"一只惊恐的猫",
            b"神秘的暗黑鲲",
            b"强壮的大马猩",
            b"凶猛的暴恐龙",
            b"调皮的小屁猴",
            b"可爱的萝莉马",
            b"神秘的蓝影邪龙",
            b"勤劳的卖报兔",
            b"可爱的小奶虎",
        ],
        vector[
            b"https://gateway.pinata.cloud/ipfs/QmW79JHmt469hvDNmXXWyTF6GUXCAX9qgDGi9yi1Jq5AAT",
            b"https://gateway.pinata.cloud/ipfs/QmNsiA97LGvY35wQUESFJaTPNrw7MkuBiuurbs1SRLB1qA",
            b"https://gateway.pinata.cloud/ipfs/QmZEnFhGbbmome1G74AZ5bufxWTChEh2sVcxyqRDaYpjct",
            b"https://gateway.pinata.cloud/ipfs/QmfH4HbzhSPsRVf8JgjyothMEvFWdWL4LgFQh1ogdtwXRD",
            b"https://gateway.pinata.cloud/ipfs/QmSBv7zuSwRUtLzEXGaxefRJrVXNEVhx455zPwa8ZxPt5Z",
            b"https://gateway.pinata.cloud/ipfs/QmddXBKirzLRx94gGkMqNqwruEDiBjRJ3ZJLhzdxeZ9uWR",
            b"https://gateway.pinata.cloud/ipfs/QmfJFF3btXaeHupLx5oGJLDYExuMmRCtTbbbaqFi2m91jd",
            b"https://gateway.pinata.cloud/ipfs/QmTx2T9dndWvsv3ZRJwiBarLC685UTtEgQGp1dSUkVC55g",
            b"https://gateway.pinata.cloud/ipfs/QmSPPHkoEM7Ey7wdr5p6HfYXHcg1vsxo2LKjdpnQyLMc26",
        ],
        vector[
            b"https://gateway.pinata.cloud/ipfs/QmXddfFBpWTZjA5YjB6P3dLTxTESr97iaRDPByakyY797V",
            b"https://gateway.pinata.cloud/ipfs/QmPZor53ZukMihxcnWx2Vnr1L9qDYmR26A6XG9WsXYtLp5",
            b"https://gateway.pinata.cloud/ipfs/QmQXiTtTembcXPptU8TWxEjpr9hnPEJTTvDyiA2GvLU2uP",
            b"https://gateway.pinata.cloud/ipfs/QmZiKyKujgZNVLzGa1aFXuertUThMdafL2zAXPF6fArLfe",
            b"https://gateway.pinata.cloud/ipfs/QmYYNuAqX5nyUsezc1cGgXEi8retEzjhLpa5cBWUva9AtJ",
            b"https://gateway.pinata.cloud/ipfs/QmTqe3subbkYPEcfSEQvhJDDJewTSUwoJ74zRJBUS8bBHe",
            b"https://gateway.pinata.cloud/ipfs/QmcfEqMfjFvwRzDN4okTC6u2EysRzr9Me5G9Pa9ntJff2J",
            b"https://gateway.pinata.cloud/ipfs/QmeWDUWavgsvnZRfyUaKjfhpdc6GHckJZ8ywMHQqps2jY3",
            b"https://gateway.pinata.cloud/ipfs/QmfMrUgR92PFziRQVquhmLZqgyRgUpFkBQQvTQrn7PjufW",
        ],
    )
}

fun random_variant_index(r: &Random, ctx: &mut TxContext): u64 {
    let mut generator = new_generator(r, ctx);
    generate_u64_in_range(&mut generator, 0, VARIANT_COUNT - 1)
}

fun build_nft(r: &Random, ctx: &mut TxContext): MyNFT {
    let (names, descriptions, urls, details) = metadata_tables();
    let idx = random_variant_index(r, ctx);
    let name = *vector::borrow(&names, idx);
    let description = *vector::borrow(&descriptions, idx);
    let url = *vector::borrow(&urls, idx);
    let detail = *vector::borrow(&details, idx);

    MyNFT {
        id: object::new(ctx),
        name: string::utf8(name),
        description: string::utf8(description),
        url: url::new_unsafe_from_bytes(url),
        detail: url::new_unsafe_from_bytes(detail),
    }
}

fun emit_and_transfer(nft: MyNFT, recipient: address, creator: address) {
    let name_copy = copy nft.name;
    event::emit(NFTMinted {
        object_id: object::id(&nft),
        creator,
        name: name_copy,
    });
    transfer::public_transfer(nft, recipient);
}

// ===== Entrypoints =====

#[allow(lint(public_random))]
/// Mint a random NFT and return it to the caller for custom handling.
public fun mint_nft(r: &Random, ctx: &mut TxContext): MyNFT {
    build_nft(r, ctx)
}

#[allow(lint(public_random))]
/// Mint a random NFT directly to the transaction sender.
public fun mint_to_sender(r: &Random, ctx: &mut TxContext) {
    let recipient = ctx.sender();
    let nft = build_nft(r, ctx);
    emit_and_transfer(nft, recipient, recipient);
}

#[allow(lint(public_random))]
/// Mint a random NFT to a specific address (creator is the transaction sender).
public fun mint_to_address(r: &Random, recipient: address, ctx: &mut TxContext) {
    let creator = ctx.sender();
    let nft = build_nft(r, ctx);
    emit_and_transfer(nft, recipient, creator);
}

#[allow(lint(self_transfer))]
/// Entry wrapper so users can call `mint_to_sender` directly in PTBs.
entry fun mint_to_sender_entry(r: &Random, ctx: &mut TxContext) {
    mint_to_sender(r, ctx)
}

/// Entry wrapper that forwards to `mint_to_address`.
entry fun mint_to_address_entry(r: &Random, recipient: address, ctx: &mut TxContext) {
    mint_to_address(r, recipient, ctx)
}

/// Transfer `nft` to `recipient`
entry fun transfer(nft: MyNFT, recipient: address, _: &mut TxContext) {
    transfer::public_transfer(nft, recipient)
}

/// Update the `description` of `nft` to `new_description`
entry fun update_description(
    nft: &mut MyNFT,
    new_description: vector<u8>,
    _: &mut TxContext,
) {
    nft.description = string::utf8(new_description)
}

/// Permanently delete `nft`
entry fun burn(nft: MyNFT, _: &mut TxContext) {
    let MyNFT { id, name: _, description: _, url: _ ,detail:_,} = nft;
    object::delete(id)
}
