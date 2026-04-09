import { ref, computed, Ref } from 'vue';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { EncryptedObject, SealClient, SessionKey } from '@mysten/seal';
import { Zstd } from '@hpcc-js/wasm-zstd';

const PACKAGE_ID = '0xdff6123817e00fb83e319311f53866d58bbadb4eb209d0bcf308c75616b66adb';
const MESSAGE_INDEX_ID = '0x59a387f1d8339c74f434a73b57b95e75b6afbcfefb96cea40742b698178c5fdc';
const CLOCK_ID = '0x6';
const SEAL_TTL_MIN = 30;
const ZSTD_LEVEL = 3;
const HARD_CODED_SEAL_SERVERS = [
  {
    objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
    weight: 1,
  },
  {
    objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
    weight: 1,
  },
];

export interface SealedMessage {
  id: string;
  sender: string;
  recipient: string;
  ciphertext: Uint8Array;
  timestamp_ms: number;
}

function decodeMoveBytes(value: any): Uint8Array {
  if (!value) return new Uint8Array();
  const bytes = value.bytes || value.value?.bytes || value || [];
  return new Uint8Array(Array.isArray(bytes) ? bytes : []);
}

function decodeMoveAddress(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.value) return value.value;
  return '';
}

function decodeMoveNumber(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  if (typeof value === 'object' && value.value) return Number(value.value);
  return 0;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  const full = normalized.length % 2 === 0 ? normalized : `0${normalized}`;
  const bytes = new Uint8Array(full.length / 2);
  for (let i = 0; i < full.length; i += 2) {
    bytes[i / 2] = Number.parseInt(full.slice(i, i + 2), 16);
  }
  return bytes;
}

function isSealEncryptedObject(bytes: Uint8Array): boolean {
  try {
    EncryptedObject.parse(bytes);
    return true;
  } catch {
    return false;
  }
}

function decodeMessageId(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.value === 'string') return value.value;
  if (typeof value.id === 'string') return value.id;
  if (typeof value.bytes === 'string') return value.bytes;
  if (typeof value.fields?.id?.id === 'string') return value.fields.id.id;
  return '';
}

function decodeMessageIdVector(value: any): string[] {
  const raw =
    value?.fields?.vec ??
    value?.vec ??
    value?.value?.fields?.vec ??
    value?.value ??
    value;

  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    const id = decodeMessageId(item);
    if (id) ids.push(id);
  }
  return ids;
}

function decodeMessageTableId(indexField: any): string {
  return (
    indexField?.fields?.id?.id ||
    indexField?.id?.id ||
    indexField?.id ||
    ''
  );
}

interface MessageIndexEntry {
  keyAddr: string;
  messageIds: string[];
}

function normalizeMessageObject(data: any, id: string): SealedMessage | null {
  const isMoveObject = data?.dataType === 'moveObject' || data?.content?.dataType === 'moveObject';
  if (!data || !isMoveObject) return null;
  const fields = data.content?.fields || {};
  return {
    id,
    sender: decodeMoveAddress(fields.sender),
    recipient: decodeMoveAddress(fields.recipient),
    ciphertext: decodeMoveBytes(fields.ciphertext),
    timestamp_ms: decodeMoveNumber(fields.timestamp_ms),
  };
}

export function useMessages(
  getClient: () => SuiClient,
  getKeypair: () => Ed25519Keypair | null,
  address: Ref<string>,
) {
  const myMessages = ref<SealedMessage[]>([]);  // 我收到的消息
  const poolMessages = ref<SealedMessage[]>([]);  // 消息池里的所有消息
  const loading = ref(false);
  const error = ref('');
  let cachedZstd: Zstd | null = null;
  let cachedSealClient: SealClient | null = null;
  let cachedSealConfigKey = '';
  let cachedSessionKey: SessionKey | null = null;
  let cachedSessionAddress = '';

  const signAndExecuteTransaction = async (tx: Transaction) => {
    const signer = getKeypair();
    if (!signer) throw new Error('请先加载钱包并导入私钥');
    return await getClient().signAndExecuteTransaction({ signer, transaction: tx });
  };

  const getZstd = async (): Promise<Zstd> => {
    if (!cachedZstd) cachedZstd = await Zstd.load();
    return cachedZstd;
  };

  const getSealServerConfigs = () => {
    return HARD_CODED_SEAL_SERVERS;
  };

  const getSealThreshold = () => {
    const raw = Number(import.meta.env.VITE_SEAL_THRESHOLD ?? 1);
    if (!Number.isInteger(raw) || raw < 1) return 1;
    return raw;
  };

  const getSealClient = () => {
    const serverConfigs = getSealServerConfigs();
    if (serverConfigs.length === 0) {
      throw new Error(
        '未配置 Seal key server。请在 .env 设置 VITE_SEAL_SERVER_CONFIGS（JSON 数组）。',
      );
    }
    const configKey = JSON.stringify(serverConfigs);
    if (!cachedSealClient || cachedSealConfigKey !== configKey) {
      cachedSealClient = new SealClient({
        suiClient: getClient() as any,
        serverConfigs: serverConfigs as any,
      });
      cachedSealConfigKey = configKey;
    }
    return cachedSealClient;
  };

  const getSessionKey = async () => {
    const signer = getKeypair();
    if (!signer || !address.value) throw new Error('请先加载钱包并导入私钥');
    if (
      cachedSessionKey &&
      cachedSessionAddress === address.value &&
      !cachedSessionKey.isExpired()
    ) {
      return cachedSessionKey;
    }
    cachedSessionKey = await SessionKey.create({
      address: address.value,
      packageId: PACKAGE_ID,
      ttlMin: SEAL_TTL_MIN,
      signer,
      suiClient: getClient() as any,
    });
    cachedSessionAddress = address.value;
    return cachedSessionKey;
  };

  const fetchMessageObject = async (msgId: string): Promise<SealedMessage | null> => {
    try {
      const obj: any = await getClient().getObject({ id: msgId, options: { showContent: true } });
      return normalizeMessageObject(obj.data, msgId);
    } catch (e) {
      console.warn('读取消息对象失败', msgId, e);
      return null;
    }
  };

  const loadIndexEntries = async (): Promise<MessageIndexEntry[]> => {
    const indexObj: any = await getClient().getObject({
      id: MESSAGE_INDEX_ID,
      options: { showContent: true },
    });

    const isMoveObject =
      indexObj?.data?.dataType === 'moveObject' ||
      indexObj?.data?.content?.dataType === 'moveObject';
    if (!indexObj?.data || !isMoveObject || !indexObj?.data?.content?.fields) {
      const detail = indexObj?.error?.code || indexObj?.error || 'unknown';
      throw new Error(`消息索引对象不存在或格式错误 (${String(detail)})`);
    }

    const fields = indexObj.data.content?.fields || {};
    const indexTable = fields.index || {};
    const entries: MessageIndexEntry[] = [];

    // 兼容历史结构：可直接读取 table contents
    const legacyContents = indexTable.contents || [];
    if (Array.isArray(legacyContents) && legacyContents.length > 0) {
      for (const entry of legacyContents) {
        const entryFields = entry.fields || entry;
        const keyAddr = decodeMoveAddress(entryFields.key);
        const messageIds = decodeMessageIdVector(entryFields.value);
        entries.push({ keyAddr, messageIds });
      }
      return entries;
    }

    // 标准结构：Table 通过动态字段存储条目
    const tableId = decodeMessageTableId(indexTable);
    if (!tableId) return entries;

    let cursor: string | null | undefined = null;
    do {
      const page: any = await getClient().getDynamicFields({
        parentId: tableId,
        cursor,
        limit: 50,
      });

      const dynamicFields = page?.data || [];
      const objects = await Promise.all(
        dynamicFields.map(async (field: any) => {
          try {
            return await getClient().getObject({
              id: field.objectId,
              options: { showContent: true },
            });
          } catch {
            return null;
          }
        }),
      );

      for (let i = 0; i < dynamicFields.length; i++) {
        const field = dynamicFields[i];
        const obj = objects[i];
        const entryFields = obj?.data?.content?.fields || {};
        const keyAddr = decodeMoveAddress(entryFields.name ?? field?.name?.value);
        const messageIds = decodeMessageIdVector(entryFields.value);
        entries.push({ keyAddr, messageIds });
      }

      cursor = page?.hasNextPage ? page?.nextCursor : null;
    } while (cursor);

    return entries;
  };

  // 获取我收到的消息
  const fetchMyMessages = async () => {
    if (!address.value) return;

    loading.value = true;
    error.value = '';

    try {
      const entries = await loadIndexEntries();
      let messageIds: string[] = [];

      for (const entry of entries) {
        const keyAddr = decodeMoveAddress(entry.keyAddr);
        if (keyAddr.toLowerCase() === address.value.toLowerCase()) {
          messageIds = entry.messageIds;
          break;
        }
      }

      const fetchedMessages = await Promise.all(
        messageIds.map(async (msgId) => await fetchMessageObject(msgId)),
      );
      myMessages.value = fetchedMessages.filter((m): m is SealedMessage => m !== null)
        .sort((a, b) => b.timestamp_ms - a.timestamp_ms);
    } catch (e) {
      error.value = `获取消息失败: ${e}`;
      console.error('fetchMyMessages error:', e);
    } finally {
      loading.value = false;
    }
  };

  // 获取消息池里所有消息（最新优先）
  const fetchPoolMessages = async () => {
    loading.value = true;
    error.value = '';

    try {
      const entries = await loadIndexEntries();
      const allMessageIds: string[] = [];

      for (const entry of entries) {
        allMessageIds.push(...entry.messageIds);
      }

      const fetchedMessages = await Promise.all(
        allMessageIds.map(async (msgId) => await fetchMessageObject(msgId)),
      );

      poolMessages.value = fetchedMessages.filter((m): m is SealedMessage => m !== null)
        .sort((a, b) => b.timestamp_ms - a.timestamp_ms);
    } catch (e) {
      error.value = `获取消息池失败: ${e}`;
      console.error('fetchPoolMessages error:', e);
    } finally {
      loading.value = false;
    }
  };

  // 兼容旧的 fetchMessages 接口
  const fetchMessages = async () => {
    await fetchMyMessages();
    await fetchPoolMessages();
  };

  const sendMessage = async (recipient: string, plaintext: string) => {
    if (!address.value) {
      error.value = '请先连接钱包';
      return;
    }

    loading.value = true;
    error.value = '';
    try {
      const zstd = await getZstd();
      const sealClient = getSealClient();
      const recipientAddress = normalizeSuiAddress(recipient);
      const plaintextBytes = new TextEncoder().encode(plaintext);
      const compressed = zstd.compress(plaintextBytes, ZSTD_LEVEL);
      const { encryptedObject } = await sealClient.encrypt({
        threshold: getSealThreshold(),
        packageId: PACKAGE_ID,
        id: recipientAddress,
        data: compressed,
      });

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::message::send_message`,
        arguments: [
          tx.object(MESSAGE_INDEX_ID),
          tx.pure.address(recipientAddress),
          tx.pure.vector('u8', Array.from(encryptedObject)),
          tx.object(CLOCK_ID),
        ],
      });
      await signAndExecuteTransaction(tx);
    } catch (e) {
      error.value = `发送失败: ${e}`;
    } finally {
      loading.value = false;
    }
  };

  const decryptMessage = async (message: SealedMessage): Promise<string> => {
    try {
      // 兼容历史未加密消息：若不是 Seal EncryptedObject 结构，直接 UTF-8 解码
      if (!isSealEncryptedObject(message.ciphertext)) {
        return new TextDecoder().decode(message.ciphertext);
      }

      const sealClient = getSealClient();
      const sessionKey = await getSessionKey();
      const zstd = await getZstd();
      const idBytes = hexToBytes(normalizeSuiAddress(message.recipient));

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::message::seal_approve`,
        arguments: [tx.pure.vector('u8', Array.from(idBytes))],
      });

      const txBytes = await tx.build({ client: getClient(), onlyTransactionKind: true });
      const decryptedCompressed = await sealClient.decrypt({
        data: message.ciphertext,
        sessionKey,
        txBytes,
      });
      const plaintextBytes = zstd.decompress(decryptedCompressed);
      return new TextDecoder().decode(plaintextBytes);
    } catch (e) {
      return '[解密失败]';
    }
  };

  const clearIndex = async () => {
    if (!address.value) return;
    loading.value = true;
    error.value = '';

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::message::clear_my_index`,
        arguments: [tx.object(MESSAGE_INDEX_ID)],
      });
      await signAndExecuteTransaction(tx);
      myMessages.value = [];
    } catch (e) {
      error.value = `清空失败: ${e}`;
    } finally {
      loading.value = false;
    }
  };

  return {
    myMessages: computed(() => myMessages.value),
    poolMessages: computed(() => poolMessages.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    sendMessage,
    fetchMessages,
    fetchMyMessages,
    fetchPoolMessages,
    decryptMessage,
    clearIndex,
  };
}
