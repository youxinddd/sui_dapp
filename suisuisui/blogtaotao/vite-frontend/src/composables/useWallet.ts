import { ref } from 'vue';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bech32, bech32m } from 'bech32';

const STORAGE_KEY = 'sui_wallet_v2';
const LEGACY_STORAGE_KEY = 'sui_wallet_v1';
const STORAGE_AES_KEY = 'sui_wallet_aes_key_v1';

function normalizeSeed(bytes: Uint8Array): Uint8Array {
	if (bytes.length === 32) return new Uint8Array(bytes);
	if (bytes.length === 33 && bytes[0] === 0x00) return bytes.slice(1);
	if (bytes.length === 64) return bytes.slice(0, 32);
	if (bytes.length === 65 && bytes[0] === 0x00) return bytes.slice(1, 33);
	if (bytes.length > 65 && bytes[0] === 0x00) return bytes.slice(1, 33);
	if (bytes.length > 32) return bytes.slice(bytes.length - 32);
	const padded = new Uint8Array(32);
	padded.set(bytes, 32 - bytes.length);
	return padded;
}

function toB64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function fromB64(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function getOrCreateAesKeyMaterial(): Uint8Array {
	const stored = localStorage.getItem(STORAGE_AES_KEY);
	if (stored) {
		try {
			const bytes = fromB64(stored);
			if (bytes.length === 32) return bytes;
		} catch {
			// ignore bad data and regenerate
		}
	}
	const next = crypto.getRandomValues(new Uint8Array(32));
	localStorage.setItem(STORAGE_AES_KEY, toB64(next));
	return next;
}

async function importAesKey(): Promise<CryptoKey> {
	return await crypto.subtle.importKey(
		'raw',
		getOrCreateAesKeyMaterial(),
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt'],
	);
}

async function encryptForStorage(plain: string): Promise<string> {
	const key = await importAesKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const payload = new TextEncoder().encode(plain);
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
	return JSON.stringify({
		v: 1,
		alg: 'AES-GCM',
		iv: toB64(iv),
		ct: toB64(new Uint8Array(encrypted)),
	});
}

async function decryptFromStorage(raw: string): Promise<string> {
	const parsed = JSON.parse(raw);
	if (parsed?.v !== 1 || parsed?.alg !== 'AES-GCM' || !parsed?.iv || !parsed?.ct) {
		throw new Error('invalid encrypted wallet payload');
	}
	const key = await importAesKey();
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: fromB64(parsed.iv) },
		key,
		fromB64(parsed.ct),
	);
	return new TextDecoder().decode(plain);
}

function encodeSuipriv(seed: Uint8Array): string {
	if (seed.length !== 32) throw new Error('suiprivkey 需要 32 字节种子');
	const flagged = new Uint8Array(33);
	flagged[0] = 0x00;
	flagged.set(seed, 1);
	try {
		return bech32.encode('suiprivkey', bech32.toWords(flagged));
	} catch {
		return bech32m.encode('suiprivkey', bech32m.toWords(flagged));
	}
}

function decodeSuipriv(raw: string): Uint8Array {
	const input = raw.trim();
	if (!/^suiprivkey1[0-9a-z]+$/.test(input)) throw new Error('suiprivkey 格式错误');
	for (const codec of [bech32, bech32m]) {
		try {
			const decoded = codec.decode(input);
			if (decoded.prefix !== 'suiprivkey') continue;
			const bytes = new Uint8Array(codec.fromWords(decoded.words));
			if (bytes.length === 33 && bytes[0] === 0x00) return bytes.slice(1);
			if (bytes.length === 32) return bytes;
		} catch {
			// ignore and try next codec
		}
	}
	throw new Error('无法解析 suiprivkey');
}

export function useWallet() {
	const privateKeyRaw = ref<string>('');
	const address = ref<string>('');
	const keyAnalysis = ref<string>('');
	let keypair: Ed25519Keypair | null = null;

	function secretBytes(kp: Ed25519Keypair): Uint8Array {
		const anyKp: any = kp;
		if (typeof anyKp.export === 'function') {
			try {
				const exported = anyKp.export();
				if (exported?.privateKey) {
					const data = fromB64(exported.privateKey);
					if (data?.length) return data;
				}
			} catch (e) {
				console.warn('[wallet] export() failed, fallback to internal secrets', e);
			}
		}
		if (typeof anyKp.getSecretKey === 'function') {
			const secret = anyKp.getSecretKey();
			if (typeof secret === 'string') {
				return normalizeSeed(decodeSuipriv(secret));
			}
			if (secret instanceof Uint8Array) {
				return secret;
			}
		}
		if (anyKp.secretKey instanceof Uint8Array) return anyKp.secretKey;
		if (anyKp._secretKey instanceof Uint8Array) return anyKp._secretKey;
		throw new Error('当前密钥对不支持导出私钥');
	}

	async function applyWallet(kp: Ed25519Keypair, seed: Uint8Array, message?: string) {
		keypair = kp;
		address.value = kp.getPublicKey().toSuiAddress();
		const raw = encodeSuipriv(seed);
		privateKeyRaw.value = raw;
		localStorage.setItem(STORAGE_KEY, await encryptForStorage(raw));
		keyAnalysis.value = message ?? keyAnalysis.value;
		return raw;
	}

	async function generateNewWallet() {
		const kp = Ed25519Keypair.generate();
		const seed = normalizeSeed(secretBytes(kp));
		return await applyWallet(kp, seed, '已生成新钱包');
	}

	async function importSuiprivKey(raw: string) {
		const seed = normalizeSeed(decodeSuipriv(raw));
		const kp = Ed25519Keypair.fromSecretKey(seed);
		return await applyWallet(kp, seed, '导入成功');
	}

	function exportSuiprivKey() {
		if (!keypair) throw new Error('没有可导出的钱包');
		// 使用 SDK 的标准导出，保证导入导出一致
		const raw = keypair.getSecretKey();
		privateKeyRaw.value = raw;
		keyAnalysis.value = '已导出 suiprivkey';
		return raw;
	}

	function clearWallet() {
		keypair = null;
		address.value = '';
		privateKeyRaw.value = '';
		localStorage.removeItem(STORAGE_KEY);
		localStorage.removeItem(LEGACY_STORAGE_KEY);
		keyAnalysis.value = '已清空钱包';
	}

	async function loadExistingFromStorage() {
		const encryptedStored = localStorage.getItem(STORAGE_KEY);
		if (encryptedStored) {
			try {
				const raw = await decryptFromStorage(encryptedStored);
				await importSuiprivKey(raw);
				keyAnalysis.value = '已加载本地钱包';
				return true;
			} catch (e) {
				console.warn('[wallet] encrypted wallet invalid, clearing', e);
				clearWallet();
				keyAnalysis.value = '本地钱包数据无效，已清空';
				return false;
			}
		}

		// 兼容老版本明文存储：自动迁移到加密存储
		const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY);
		if (!legacyStored) return false;
		try {
			await importSuiprivKey(legacyStored);
			localStorage.removeItem(LEGACY_STORAGE_KEY);
			keyAnalysis.value = '已加载本地钱包（已升级为加密存储）';
			return true;
		} catch (e) {
			console.warn('[wallet] legacy wallet invalid, clearing', e);
			clearWallet();
			keyAnalysis.value = '本地钱包数据无效，已清空';
			return false;
		}
	}

	async function ensureWallet() {
		if (!(await loadExistingFromStorage())) {
			await generateNewWallet();
		}
	}

	function getKeypair(): Ed25519Keypair | null {
		return keypair;
	}

	return {
		privateKeyRaw,
		address,
		keyAnalysis,
		generateNewWallet,
		importSuiprivKey,
		exportSuiprivKey,
		loadExistingFromStorage,
		ensureWallet,
		clearWallet,
		getKeypair,
	};
}
