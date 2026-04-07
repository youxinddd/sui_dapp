module blogtaotao::message;

use sui::bcs;
use sui::table::{Self, Table};
use sui::clock::Clock;

// ─── Error codes ─────────────────────────────────────────────────────────────
const ENoAccess: u64 = 0;

// ─── Structs ─────────────────────────────────────────────────────────────────

/// 不可变消息对象，冻结后永久存档，任何人无法修改
public struct SealedMessage has key {
    id: UID,
    sender: address,
    recipient: address,
    /// Seal 加密后的密文字节（@mysten/seal EncryptedObject）
    ciphertext: vector<u8>,
    timestamp_ms: u64,
}

/// 全局共享的消息索引
/// key = recipient address, value = list of SealedMessage object IDs
public struct MessageIndex has key {
    id: sui::object::UID,
    index: Table<address, vector<sui::object::ID>>,
}

// ─── Init ─────────────────────────────────────────────────────────────────────

fun init(ctx: &mut TxContext) {
    let box = MessageIndex {
        id: sui::object::new(ctx),
        index: table::new<address, vector<sui::object::ID>>(ctx),
    };
    sui::transfer::share_object(box);
}

// ─── 发送消息 ─────────────────────────────────────────────────────────────────

/// 发送消息：创建不可变消息对象，并在 Table 中记录其 ID
public fun send_message(
    index: &mut MessageIndex,
    recipient: address,
    ciphertext: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let msg = SealedMessage {
        id: sui::object::new(ctx),
        sender: sui::tx_context::sender(ctx),
        recipient,
        ciphertext,
        timestamp_ms: clock.timestamp_ms(),
    };

    // 记录消息 ID 到收件人的索引列表
    let msg_id = sui::object::id(&msg);
    if (!table::contains(&index.index, recipient)) {
        table::add(&mut index.index, recipient, vector::empty<sui::object::ID>());
    };
    let ids = table::borrow_mut(&mut index.index, recipient);
    vector::push_back(ids, msg_id);

    // 冻结消息对象，永久不可变
    sui::transfer::freeze_object(msg);
}

// ─── 索引管理 ─────────────────────────────────────────────────────────────────

/// 收件人一次性清空自己的全部消息索引，回收存储押金
public fun clear_my_index(
    index: &mut MessageIndex,
    ctx: &mut TxContext,
) {
    let caller = sui::tx_context::sender(ctx);
    if (table::contains(&index.index, caller)) {
        table::remove(&mut index.index, caller);
    };
}


// ─── 只读访问 ─────────────────────────────────────────────────────────────────

/// 获取收件人的消息 ID 列表
public fun get_message_ids(
    index: &MessageIndex,
    recipient: address,
): &vector<sui::object::ID> {
    table::borrow(&index.index, recipient)
}

public fun ciphertext(msg: &SealedMessage): &vector<u8> { &msg.ciphertext }
public fun sender(msg: &SealedMessage): address { msg.sender }
public fun recipient(msg: &SealedMessage): address { msg.recipient }
public fun timestamp_ms(msg: &SealedMessage): u64 { msg.timestamp_ms }

// ─── Seal gatekeeper ─────────────────────────────────────────────────────────

/// seal_approve: 只有 id 对应的收件人才能解密
/// id = BCS 编码的收件人地址（由加密客户端构造）
entry fun seal_approve(id: vector<u8>, ctx: &TxContext) {
    let caller_bytes = bcs::to_bytes(&tx_context::sender(ctx));
    assert!(id == caller_bytes, ENoAccess);
}
