<template>
  <div class='app'>
    <div class='banner' v-if="errorMessage">
      <strong>错误:</strong> {{ errorMessage }} <button @click="errorMessage=''">关闭</button>
    </div>
    <div v-if="showImportDialog" class='modal-overlay' @click.self="closeImportDialog">
      <div class='modal-card'>
        <h3>导入 suiprivkey</h3>
        <textarea v-model="importPrivateKeyRaw" placeholder='粘贴 suiprivkey1...' />
        <div class='modal-actions'>
          <button @click="confirmImportWallet" :disabled="loading || !importPrivateKeyRaw.trim()">确认导入</button>
          <button @click="closeImportDialog">取消</button>
        </div>
      </div>
    </div>
    <div v-if="showExportDialog" class='modal-overlay' @click.self="closeExportDialog">
      <div class='modal-card'>
        <h3>导出 suiprivkey</h3>
        <textarea :value="exportedPrivateKeyRaw" readonly />
        <div class='modal-actions'>
          <button @click="copyExportedPrivateKey" :disabled="!exportedPrivateKeyRaw">复制私钥</button>
          <button @click="closeExportDialog">关闭</button>
        </div>
      </div>
    </div>
    <div class='tabs'>
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab-btn', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'posts'" class='tab-panel'>
      <div class='panel-header'>
        <h1>{{ blogTitle }}</h1>
        <div class='panel-actions'>
          <button @click="fetchPosts" class='refresh-btn'>刷新帖子</button>
          <span v-if="loading" class='loading-indicator'>加载中...</span>
        </div>
      </div>

      <!-- 新建帖子表单 -->
      <div class='new-post-container'>
        <div class='new-post-card'>
          <div class='new-post-header'>
            <h2>✏️ 新建帖子</h2>
          </div>
          <div class='new-post-form'>
            <div class='form-group'>
              <input v-model="newPost.title" placeholder='帖子标题' class='title-input' />
            </div>
            <div class='form-group'>
              <input v-model="newPost.image" placeholder='图片URL (可选)' class='image-input' />
            </div>
            <div class='form-group'>
              <textarea v-model="newPost.content" placeholder='写下你的想法...' class='content-textarea'></textarea>
            </div>
            <div class='form-actions'>
              <button :disabled="loading" @click="createPost" class='publish-btn'>发布帖子</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 帖子列表 -->
      <div class='posts-container'>
        <div v-if="posts.length === 0 && !loading" class='no-posts'>
          <div class='no-posts-icon'>📝</div>
          <div class='no-posts-text'>还没有帖子，快来发布第一条吧！</div>
        </div>

        <div v-else class='posts-grid'>
          <div class='post-card' v-for="p in pagedPosts" :key="p.id">
            <!-- 帖子头部 -->
            <div class='post-header'>
              <div class='post-title'>
                <h3>{{ p.title }}</h3>
              </div>
              <div class='post-meta'>
                <div class='author-info'>
                  <span class='author-avatar'>👤</span>
                  <span class='author-name' @click="copyToClipboard(p.author)" title="点击复制完整地址">{{ p.author }}</span>
                </div>
                <div class='post-time'>{{ formatTime(p.publish_time) }}</div>
              </div>
            </div>

            <!-- 帖子图片 -->
            <div v-if="p.image" class='post-image'>
              <img :src="normalizeImageUrl(p.image)" :alt="p.title" />
            </div>

            <!-- 帖子内容 -->
            <div class='post-content'>
              <p>{{ expandedPosts[p.id] ? p.content : truncatePostContent(p.content) }}</p>
              <button
                v-if="shouldShowExpandButton(p.content)"
                class='expand-btn'
                @click="togglePostExpand(p.id)"
              >
                {{ expandedPosts[p.id] ? '收起' : '展示更多' }}
              </button>
            </div>

            <!-- 帖子操作 -->
            <div class='post-actions'>
              <div class='action-buttons'>
                <button :disabled="loading" @click="likePost(p.id)" class='like-btn'>
                  👍 {{ p.likes }}
                </button>
              </div>

              <!-- 作者操作 -->
              <div v-if="address && address === p.author" class='owner-actions'>
                <button @click="toggleEdit(p.id)" :disabled="loading" class='edit-btn'>
                  {{ editingPosts[p.id]?.open ? '取消编辑' : '编辑' }}
                </button>
                <button @click="deletePost(p.id)" :disabled="loading" class='delete-btn'>
                  删除
                </button>
              </div>
            </div>

            <!-- 编辑表单 -->
            <div v-if="editingPosts[p.id]?.open" class='edit-form'>
              <div class='form-group'>
                <input v-model="editingPosts[p.id].title" placeholder='新标题' class='edit-input' />
              </div>
              <div class='form-group'>
                <input v-model="editingPosts[p.id].image" placeholder='新图片URL' class='edit-input' />
              </div>
              <div class='form-group'>
                <textarea v-model="editingPosts[p.id].content" placeholder='新内容' class='edit-textarea'></textarea>
              </div>
              <div class='form-actions'>
                <button :disabled="loading" @click="applyEdit(p.id)" class='save-btn'>保存修改</button>
              </div>
            </div>

            <!-- 评论区域 -->
            <div class='comments-section'>
              <div class='comments-header'>
                <h4>💬 评论 ({{ p.comment_count }})</h4>
              </div>

              <div class='comments-list'>
                <div class='comment-item' v-for="c in p.comments" :key="c.id">
                  <div class='comment-content'>
                    <div class='comment-author' @click="copyToClipboard(c.author)" title="点击复制完整地址">{{ c.author }}</div>
                    <div class='comment-text'>{{ c.content }}</div>
                    <div class='comment-meta'>
                      <span class='comment-time'>{{ formatTime(c.created_time) }}</span>
                      <button :disabled="loading" @click="likeComment(c.id)" class='comment-like-btn'>
                        👍 {{ c.likes }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 添加评论 -->
              <div class='add-comment'>
                <div class='comment-input-group'>
                  <input v-model="newComments[p.id]" placeholder='写下你的评论...' class='comment-input' />
                  <button :disabled="loading || !newComments[p.id]?.trim()" @click="addComment(p.id)" class='comment-submit-btn'>
                    评论
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="postsTotalPages > 1" class='message-pagination'>
          <button :disabled="postsPage <= 1" @click="postsPage -= 1">上一页</button>
          <span>第 {{ postsPage }} / {{ postsTotalPages }} 页</span>
          <button :disabled="postsPage >= postsTotalPages" @click="postsPage += 1">下一页</button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'messages'" class='tab-panel'>
      <div class='messages-section'>
        <h2>加密消息</h2>
        <div v-if="!address">请先连接钱包以使用消息功能。</div>
        <div v-else>
          <div v-if="messageToast" class='message-toast'>{{ messageToast }}</div>
          <!-- 发送消息 -->
          <div class='send-message'>
            <h3>发送消息</h3>
            <input v-model="newMessage.recipient" placeholder='接收者地址' />
            <textarea v-model="newMessage.content" placeholder='消息内容'></textarea>
            <button :disabled="messageLoading" @click="sendMessage">发送</button>
          </div>

          <!-- 错误显示 -->
          <div v-if="messageError" class='banner'><strong>消息错误:</strong> {{ messageError }}</div>

          <!-- 我收到的消息 -->
          <div class='my-messages-section'>
            <h3>我收到的消息 ({{ myMessages.length }})</h3>
            <div class='message-controls'>
              <button @click="refreshMessages">刷新</button>
              <button @click="clearMessages">清空我的消息</button>
            </div>
            <div v-if="refreshingMessages" class='loading'>加载中...</div>
            <div v-if="myMessages.length === 0" class='no-messages'>暂无消息</div>
            <div v-else class='message-list'>
              <div class='message' v-for="msg in pagedMyMessages" :key="'my-' + msg.id">
                <div class='message-header'>
                  <span class='sender' @click="copyToClipboard(msg.sender)" title="点击复制完整地址">来自: {{ msg.sender }}</span>
                  <span class='time'>{{ formatTime(msg.timestamp_ms) }}</span>
                </div>
                <div class='message-content'>{{ decryptedMessages[msg.id] || '[点击解密]' }}</div>
                <div class='message-actions'>
                  <button v-if="!decryptedMessages[msg.id]" @click="decryptMessage(msg)">解密</button>
                </div>
              </div>
            </div>
            <div v-if="myMessagesTotalPages > 1" class='message-pagination'>
              <button :disabled="myMessagesPage <= 1" @click="myMessagesPage -= 1">上一页</button>
              <span>第 {{ myMessagesPage }} / {{ myMessagesTotalPages }} 页</span>
              <button :disabled="myMessagesPage >= myMessagesTotalPages" @click="myMessagesPage += 1">下一页</button>
            </div>
          </div>

          <!-- 消息池统计 -->
          <div class='pool-messages-section'>
            <h3>消息池统计</h3>
            <div class='message-controls'>
              <button @click="refreshMessages">刷新</button>
            </div>
            <div v-if="refreshingMessages" class='loading'>加载中...</div>
            <div v-if="poolMessages.length === 0" class='no-messages'>暂无消息</div>
            <div v-else class='pool-stats'>
              <div class='stats-row'>总消息数量: <strong>{{ poolMessages.length }}</strong></div>
              <div class='stats-row'>消息池用户数: <strong>{{ poolMessageUserCount }}</strong></div>
              <div class='user-count-table'>
                <div class='table-header'>
                  <span>用户地址</span>
                  <span>消息数量</span>
                </div>
                <div class='table-row' v-for="item in poolMessageStats" :key="item.address">
                  <span class='user-address' @click="copyToClipboard(item.address)" title="点击复制完整地址">{{ item.address }}</span>
                  <span>{{ item.count }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'profile'" class='tab-panel'>
      <div class='profile-section'>
        <h2>个人资料</h2>
        <div v-if="address">
          <div v-if="profileLoading">资料加载中...</div>
          <div v-else>
            <div>昵称: {{ userProfile.nickname || '未设置' }}</div>
            <div>积分: {{ userProfile.points }}</div>
            <div>简介: {{ userProfile.bio || '暂无' }}</div>
            <img v-if="userProfile.avatar" :src="userProfile.avatar" alt="avatar" class="profile-avatar" />
          </div>
          <div class='profile-form'>
            <input v-model="profileForm.nickname" placeholder='昵称' />
            <input v-model="profileForm.avatar" placeholder='头像URL' />
            <textarea v-model="profileForm.bio" placeholder='个人简介'></textarea>
            <button :disabled="loading" @click="saveProfile">保存资料</button>
          </div>
          <button class='redeem-btn' :disabled="loading || !canRedeem" @click="redeemNft">消耗 {{ POINT_COST }} 积分兑换 NFT</button>
          <div v-if="!canRedeem" class='muted'>需要至少 {{ POINT_COST }} 积分才能兑换</div>
          <div class='nft-list'>
            <h3>我的 NFT</h3>
            <div v-if="nftLoading">加载中...</div>
            <div v-else-if="ownedNfts.length === 0" class='muted'>暂无 NFT</div>
            <div v-else class='nft-grid'>
              <div class='nft-card' v-for="n in ownedNfts" :key="n.id">
                <div class='nft-name'>{{ n.name }}</div>
                <div class='nft-desc'>{{ n.description }}</div>
                <img v-if="n.url" :src="normalizeImageUrl(n.url)" alt="NFT" />
                <a v-if="n.detail" :href="n.detail" target="_blank" rel="noopener">详情</a>
                <div class='nft-id'>ID: {{ n.id }}</div>
              </div>
            </div>
          </div>
        </div>
        <div v-else>请先导入钱包以查看并编辑个人资料。</div>
      </div>
    </section>

    <section v-else class='tab-panel'>
      <div class='project-info'>
        <h2>项目信息</h2>
        <div class='wallet'>
          <div v-if="keyAnalysis" class='wallet-hint'>{{ keyAnalysis }}</div>
          <div class='wallet-actions'>
            <button @click="openImportDialog" :disabled="loading">导入 suiprivkey</button>
            <button @click="generateNewWallet" :disabled="loading">生成新钱包</button>
            <button v-if="address" @click="openExportDialog" :disabled="loading">导出 suiprivkey</button>
            <button v-if="address" @click="fetchBalance" :disabled="loading">刷新余额</button>
            <button
              v-if="address && (isDevnet || isTestnet)"
              @click="requestFaucet"
              :disabled="loading || faucetCooling"
            >
              {{ faucetCooling ? '水龙头冷却中...' : ('领取' + currentNetworkName + '水龙头') }}
            </button>
          </div>
          <div class='wallet-note'>密钥仅保存在当前浏览器中（加密存储）。导入会覆盖本地钱包，确保提前备份。</div>
          <div class='wallet-meta'>
            <div v-if="address">地址: <span class='mono'>{{ address }}</span></div>
            <div v-if="address && suiBalance">余额: {{ suiBalance }}</div>
          </div>
          <div class='wallet-network'>
            <label>
              网络:
              <select v-model="rpc">
                <option v-for="n in networks" :value="n.url" :key="n.url">{{ n.name }}</option>
              </select>
            </label>
            <span v-if="rpc" class='current-network'>当前网络: {{ currentNetworkName }}</span>
          </div>
          <div class='wallet-ids'>
            <label>Blog Object ID<input v-model="editableBlogId" /></label>
            <label>Profile Store Object ID<input v-model="editableProfileStoreId" /></label>
            <label>Random Object ID<input v-model="randomObjectId" /></label>
            <label>NFT Package ID<input v-model="nftPackageId" /></label>
          </div>
          <div class='faucet-links'>
            <span>水龙头入口:</span>
            <a href="https://faucet.n1stake.com/?utm_source=chatgpt.com" target="_blank" rel="noopener">N1Stake Faucet</a>
            <a href="https://faucet.sui.io/" target="_blank" rel="noopener">Sui 官方 Faucet</a>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
// @ts-nocheck
import { ref, reactive, computed, watch } from 'vue';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { useWallet } from './composables/useWallet';
import { useMessages } from './composables/useMessages';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const COMPRESSED_PREFIX = '__COMPRESSED__:';

const DEFAULT_RPC = 'https://fullnode.testnet.sui.io:443';
const BLOG_ID = '0x07aa87a6673d121e721898867e286649fa00866b2ba0bad4508f01af4405c2e6';
const PACKAGE_ID = '0xdff6123817e00fb83e319311f53866d58bbadb4eb209d0bcf308c75616b66adb';
const CLOCK_ID = '0x6';
const DEFAULT_PROFILE_STORE_ID = '0x6f30a4308da2fe2480a6a0991d62fc2bf7002b0a99ea41842576e9b5caf54131';
const DEFAULT_RANDOM_OBJECT_ID = '0x8';
const DEFAULT_NFT_PACKAGE_ID = "0xdb3c3d4aa28006cb3d5c3bc9fbc01679044952613df3cecfb6ec8db16cfbd201";
const POINT_COST = 10;
const GAS_UNITS_MIN = 5_000n;
const GAS_UNITS_FALLBACK = 20_000n;
const GAS_UNITS_MAX = 200_000n;
const GAS_BUDGET_BUFFER_BPS = 13_000n; // 130%
const BPS_BASE = 10_000n;

interface CommentView { id: string; author: string; content: string; likes: any; created_time: any; }
interface PostView { id: string; author: string; title: string; content: string; publish_time: any; image: string; likes: any; comment_count: any; comments: CommentView[]; deleted?: boolean; }

const rpc = ref(DEFAULT_RPC);
const client = computed(() => new SuiClient({ url: rpc.value }));
async function rawRpc(method: string, params: any[]) {
  const body = { jsonrpc: '2.0', id: Date.now(), method, params };
  const res = await fetch(rpc.value, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC Error');
  return json.result;
}
// Integrate composable wallet (auto-load or auto-generate, import/export helpers)
const {
  address,
  keyAnalysis,
  generateNewWallet: generateWalletInternal,
  importSuiprivKey,
  exportSuiprivKey: exportSuiprivKeyInternal,
  ensureWallet,
  getKeypair,
} = useWallet();
let keypair: Ed25519Keypair | null = null;
const {
  myMessages,
  poolMessages,
  loading: messageLoading,
  error: messageError,
  sendMessage: sendMessageInternal,
  fetchMessages,
  decryptMessage: decryptMessageInternal,
  clearIndex,
} = useMessages(() => client.value, () => keypair, address);
const blogTitle = ref('');
const editableBlogId = ref(BLOG_ID);
const editableProfileStoreId = ref(DEFAULT_PROFILE_STORE_ID);
const randomObjectId = ref(DEFAULT_RANDOM_OBJECT_ID);
const nftPackageId = ref(DEFAULT_NFT_PACKAGE_ID);
const posts = ref<PostView[]>([]);
const editingPosts = reactive<Record<string, { title: string; content: string; image: string; open: boolean }>>({});
const newComments = reactive<Record<string, string>>({});
const newPost = reactive({ title: '', content: '', image: '' });
const loading = ref(false);
const errorMessage = ref('');
const suiBalance = ref<string>('');
const profileLoading = ref(false);
const userProfile = reactive({ exists: false, owner: '', nickname: '', avatar: '', bio: '', points: 0 });
const profileForm = reactive({ nickname: '', avatar: '', bio: '' });
const canRedeem = computed(() => userProfile.points >= POINT_COST && !!editableProfileStoreId.value?.trim() && !!randomObjectId.value?.trim());
const poolMessageStats = computed(() => {
  const counts = new Map<string, number>();
  for (const msg of poolMessages.value) {
    for (const user of [msg.sender, msg.recipient]) {
      if (!user) continue;
      const addr = user.toLowerCase();
      counts.set(addr, (counts.get(addr) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
});
const poolMessageUserCount = computed(() => poolMessageStats.value.length);
const ownedNfts = ref<any[]>([]);
const nftLoading = ref(false);
const newMessage = reactive({ recipient: '', content: '' });
const decryptedMessages = reactive<Record<string, string>>({});
const refreshingMessages = ref(false);
const messageToast = ref('');
const showImportDialog = ref(false);
const showExportDialog = ref(false);
const importPrivateKeyRaw = ref('');
const exportedPrivateKeyRaw = ref('');
const expandedPosts = reactive<Record<string, boolean>>({});
const POSTS_PAGE_SIZE = 10;
const POST_PREVIEW_LENGTH = 180;
const postsPage = ref(1);
const MESSAGE_PAGE_SIZE = 5;
const myMessagesPage = ref(1);
let messageToastTimer: number | null = null;
const postsTotalPages = computed(() => Math.max(1, Math.ceil(posts.value.length / POSTS_PAGE_SIZE)));
const pagedPosts = computed(() => {
  const start = (postsPage.value - 1) * POSTS_PAGE_SIZE;
  return posts.value.slice(start, start + POSTS_PAGE_SIZE);
});
const myMessagesTotalPages = computed(() => Math.max(1, Math.ceil(myMessages.value.length / MESSAGE_PAGE_SIZE)));
const pagedMyMessages = computed(() => {
  const start = (myMessagesPage.value - 1) * MESSAGE_PAGE_SIZE;
  return myMessages.value.slice(start, start + MESSAGE_PAGE_SIZE);
});
const tabs = [
  { key: 'posts', label: '帖子列表' },
  { key: 'messages', label: '加密消息' },
  { key: 'profile', label: '个人资料' },
  { key: 'project', label: '项目信息' },
];
const activeTab = ref('posts');
// keyAnalysis now provided by composable
const faucetCooling = ref(false);
const isDevnet = computed(() => rpc.value === 'https://fullnode.devnet.sui.io:443');
const isTestnet = computed(() => rpc.value === 'https://fullnode.testnet.sui.io:443');

function setError(msg: any) {
  console.error(msg);
  errorMessage.value = typeof msg === 'string' ? msg : (msg?.message || JSON.stringify(msg));
}
function clearError() { errorMessage.value = ''; }
function openImportDialog() {
  importPrivateKeyRaw.value = '';
  showImportDialog.value = true;
}

function closeImportDialog() {
  showImportDialog.value = false;
}

async function confirmImportWallet() {
  clearError();
  const raw = importPrivateKeyRaw.value.trim();
  if (!raw) {
    setError('请粘贴 suiprivkey');
    return;
  }
  if (!/^suiprivkey1[0-9a-z]+$/.test(raw)) {
    setError('仅支持 suiprivkey 导入 (格式: suiprivkey1...)');
    return;
  }
  try {
    await importSuiprivKey(raw);
    keypair = getKeypair();
    closeImportDialog();
    fetchBalance();
    fetchProfile();
  } catch (e) {
    setError('无效私钥，请重新粘贴正确的私钥');
    keypair = null;
    address.value = '';
  }
}

async function generateNewWallet() {
  clearError();
  const confirmed = window.confirm('生成新钱包会覆盖当前钱包，是否继续？');
  if (!confirmed) return;
  try {
    await generateWalletInternal();
    keypair = getKeypair();
    fetchBalance();
    fetchProfile();
  } catch (e) {
    setError(e);
  }
}

function openExportDialog() {
  clearError();
  try {
    exportedPrivateKeyRaw.value = exportSuiprivKeyInternal();
    showExportDialog.value = true;
  } catch (e) {
    setError(e);
  }
}

function closeExportDialog() {
  showExportDialog.value = false;
}

async function copyExportedPrivateKey() {
  if (!exportedPrivateKeyRaw.value) return;
  await copyToClipboard(exportedPrivateKeyRaw.value);
}

// 初始加载：优先使用本地存档，没有则自动生成
void (async () => {
  try {
    await ensureWallet();
    keypair = getKeypair();
    await fetchBalance();
    await fetchProfile();
  } catch (e) {
    setError(e);
  }
})();
function formatTime(ts: string) { if (!ts) return ''; const d = new Date(Number(ts)); return d.toLocaleString(); }
function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
function withBuffer(value: bigint, bps: bigint): bigint {
  return (value * bps + (BPS_BASE - 1n)) / BPS_BASE;
}
async function estimateGasBudget(tx: Transaction, sender: string, refGas: bigint): Promise<bigint | null> {
  try {
    const inspect = await client.value.devInspectTransactionBlock({
      sender,
      transactionBlock: tx,
      gasPrice: refGas,
    });
    const gasUsed = inspect?.effects?.gasUsed;
    if (!gasUsed) return null;
    const computationCost = BigInt(gasUsed.computationCost || 0);
    const storageCost = BigInt(gasUsed.storageCost || 0);
    const nonRefundableStorageFee = BigInt(gasUsed.nonRefundableStorageFee || 0);
    const estimatedCharge = computationCost + storageCost + nonRefundableStorageFee;
    if (estimatedCharge <= 0n) return null;
    const minBudget = refGas * GAS_UNITS_MIN;
    const maxBudget = refGas * GAS_UNITS_MAX;
    return clampBigInt(withBuffer(estimatedCharge, GAS_BUDGET_BUFFER_BPS), minBudget, maxBudget);
  } catch (e) {
    console.warn('Gas估算失败，使用默认预算', e);
    return null;
  }
}
async function runTx(
  build: (tx: Transaction) => void,
  after?: () => Promise<void> | void,
  options?: { estimateGas?: boolean },
) {
  if (!keypair) { setError('请先导入或生成钱包'); return; }
  loading.value = true; clearError();
  try {
    const tx = new Transaction();
    build(tx);
    try {
      const refGas = await client.value.getReferenceGasPrice();
      tx.setGasPrice(refGas);
      const minBudget = refGas * GAS_UNITS_MIN;
      const maxBudget = refGas * GAS_UNITS_MAX;
      const fallbackBudget = clampBigInt(refGas * GAS_UNITS_FALLBACK, minBudget, maxBudget);
      const estimatedBudget = options?.estimateGas ? await estimateGasBudget(tx, keypair.toSuiAddress(), refGas) : null;
      tx.setGasBudget(estimatedBudget ?? fallbackBudget);
    } catch (e) { console.warn('无法获取参考gas', e); }
    await client.value.signAndExecuteTransaction({ signer: keypair, transaction: tx });
    if (after) await after();
  } catch (e) { setError(e); } finally { loading.value = false; }
}
async function fetchPosts() {
  loading.value = true; clearError();
  try {
    const blog: any = await rawRpc('sui_getObject', [editableBlogId.value, { showContent: true }]);
    const blogFields = blog?.data?.content?.fields;
    if (!blogFields) { setError('Blog对象不存在或未初始化'); loading.value=false; return; }
    blogTitle.value = blogFields.title || '';
    const postIds: string[] = blogFields.posts || [];
    const postObjs = await Promise.all(postIds.map(id => rawRpc('sui_getObject', [id, { showContent: true }]).catch(e => { console.error('获取Post失败', id, e); return null; })));
    const list: PostView[] = [];
    for (const p of postObjs) {
      if (!p || !p.data || !p.data.content) continue;
      const f: any = (p.data.content as any).fields;
      const commentIds: string[] = f.comment_ids || [];
      let comments: CommentView[] = [];
      if (commentIds.length) {
        const commentObjs = await Promise.all(commentIds.map(cid => rawRpc('sui_getObject', [cid, { showContent: true }]).catch(e => { console.error('评论获取失败', cid, e); return null; })));
        comments = commentObjs.filter(c => c && c.data).map(c => {
          const cf: any = (c.data.content as any)?.fields || {};
          return { id: c.data.objectId, author: cf.author, content: cf.content, likes: cf.likes, created_time: cf.created_time };
        });
      }
  if (f.deleted) { continue; }
  const content = decodePostContent(f.content);
  list.push({ id: p.data.objectId, author: f.author, title: f.title, content, publish_time: f.publish_time, image: f.image, likes: f.likes, comment_count: f.comment_count, comments, deleted: f.deleted });
    }
    list.sort((a,b) => Number(b.publish_time) - Number(a.publish_time));
    for (const p of list) p.comments.sort((a,b) => Number(b.created_time) - Number(a.created_time));
    posts.value = list;
    postsPage.value = Math.min(postsPage.value, Math.max(1, Math.ceil(list.length / POSTS_PAGE_SIZE)));
  } catch (e) { setError(e); } finally { loading.value = false; }
}
function createPost() {
  if (!newPost.title || !newPost.content) { setError('标题和内容必填'); return; }
  if (!requireProfileStore()) { return; }
  const serialized = serializePostContent(newPost.content);
  runTx(tx => {
    tx.moveCall({ target: `${PACKAGE_ID}::blogtaotao::create_post`, arguments: [tx.object(editableBlogId.value), tx.object(editableProfileStoreId.value), tx.pure.string(newPost.title), tx.pure.string(serialized), tx.pure.string(newPost.image || ''), tx.object(CLOCK_ID)] });
  }, async () => { newPost.title=''; newPost.content=''; newPost.image=''; await fetchPosts(); await fetchProfile(); }, { estimateGas: true });
}
function addComment(postId: string) {
  const content = newComments[postId]; if (!content) { setError('评论内容不能为空'); return; }
  if (!requireProfileStore()) { return; }
  runTx(tx => {
    tx.moveCall({ target: `${PACKAGE_ID}::blogtaotao::comment_on_post`, arguments: [tx.object(postId), tx.object(editableProfileStoreId.value), tx.pure.string(content), tx.object(CLOCK_ID)] });
  }, async () => { newComments[postId]=''; await fetchPosts(); await fetchProfile(); });
}
function likePost(postId: string) {
  if (!requireProfileStore()) { return; }
  runTx(tx => { tx.moveCall({ target: `${PACKAGE_ID}::blogtaotao::like_post`, arguments: [tx.object(postId), tx.object(editableProfileStoreId.value)] }); }, async () => { await fetchPosts(); await fetchProfile(); });
}
function likeComment(commentId: string) {
  if (!requireProfileStore()) { return; }
  runTx(tx => { tx.moveCall({ target: `${PACKAGE_ID}::blogtaotao::like_comment`, arguments: [tx.object(commentId), tx.object(editableProfileStoreId.value)] }); }, async () => { await fetchPosts(); await fetchProfile(); });
}
// Removed manual changeNetwork; use watch instead
function changeNetwork(url: string) { rpc.value = url; }
async function fetchBalance() {
  if (!address.value) { suiBalance.value=''; return; }
  try {
    const b = await client.value.getBalance({ owner: address.value, coinType: '0x2::sui::SUI' });
    suiBalance.value = (Number(b.totalBalance) / 1e9).toFixed(4) + ' SUI';
  } catch (e) { console.warn('获取余额失败', e); }
}
async function requestFaucet() {
  if (!address.value) { setError('请先加载钱包'); return; }
  if (!isDevnet.value && !isTestnet.value) { setError('当前网络不支持内置水龙头'); return; }
  try {
    loading.value = true;
    faucetCooling.value = true;
    const host = getFaucetHost(isDevnet.value ? 'devnet' : 'testnet');
    const resp = await requestSuiFromFaucetV2({ host, recipient: address.value });
    if ((resp as any).error) {
      setError('Faucet错误: ' + (resp as any).error);
    } else {
      const objs = (resp as any).transferredGasObjects || [];
      const total = objs.reduce((acc: number, g: any) => acc + Number(g.amount || 0), 0);
      keyAnalysis.value = `Faucet 成功: +${(total/1e9).toFixed(3)} SUI`;
      setTimeout(fetchBalance, 3500);
    }
  } catch (e) {
    setError(e);
  } finally {
    loading.value = false;
    setTimeout(() => faucetCooling.value = false, 8000);
  }
}

function toStructFields(entry: any) {
  if (!entry) return null;
  return entry.fields ? entry.fields : entry;
}

function decodeMoveString(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const maybeFields = value.fields || (value.type && value.value ? value.value : null);
  if (maybeFields && typeof maybeFields === 'object') {
    if ('url' in maybeFields) {
      return decodeMoveString(maybeFields.url);
    }
    if ('value' in maybeFields) {
      return decodeMoveString(maybeFields.value);
    }
  }
  const bytes = (maybeFields && maybeFields.bytes) || value.bytes;
  if (Array.isArray(bytes)) {
    return textDecoder.decode(Uint8Array.from(bytes));
  }
  if (Array.isArray(value)) {
    return textDecoder.decode(Uint8Array.from(value));
  }
  if (typeof value === 'object' && 'value' in value && typeof value.value === 'string') {
    return value.value;
  }
  return '';
}

function stringToUtf8Bytes(text: string): Uint8Array {
  return textEncoder.encode(text);
}

function utf8BytesToString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function lzwCompressToBase64(text: string): string {
  const data = stringToUtf8Bytes(text);
  const dict = new Map<string, number>();
  for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  let w = '';
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = String.fromCharCode(data[i]);
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
    } else {
      result.push(dict.get(w) as number);
      dict.set(wc, dict.size);
      w = c;
    }
  }
  if (w !== '') result.push(dict.get(w) as number);
  const bytes: number[] = [];
  for (const code of result) {
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

function lzwDecompressFromBase64(base64: string): string {
  if (!base64) return '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const codes: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    codes.push((bytes[i] << 8) | bytes[i + 1]);
  }
  const dict = new Map<number, string>();
  for (let i = 0; i < 256; i++) dict.set(i, String.fromCharCode(i));
  let w = dict.get(codes[0]) || '';
  let result = w;
  for (let i = 1; i < codes.length; i++) {
    const k = codes[i];
    let entry = dict.get(k);
    if (entry === undefined) {
      entry = w + w[0];
    }
    result += entry;
    dict.set(dict.size, w + entry[0]);
    w = entry;
  }
  const outputBytes = new Uint8Array(result.length);
  for (let i = 0; i < result.length; i++) outputBytes[i] = result.charCodeAt(i);
  return utf8BytesToString(outputBytes);
}

function shouldCompress(content: string): boolean {
  return content.length > 80;
}

function serializePostContent(raw: string): string {
  if (!raw) return '';
  if (!shouldCompress(raw)) return raw;
  return COMPRESSED_PREFIX + lzwCompressToBase64(raw);
}

function decodePostContent(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith(COMPRESSED_PREFIX)) return stored;
  return lzwDecompressFromBase64(stored.slice(COMPRESSED_PREFIX.length));
}
function shouldShowExpandButton(content: string): boolean {
  return (content || '').length > POST_PREVIEW_LENGTH;
}
function truncatePostContent(content: string): string {
  if (!content) return '';
  if (!shouldShowExpandButton(content)) return content;
  return content.slice(0, POST_PREVIEW_LENGTH) + '...';
}
function togglePostExpand(postId: string) {
  expandedPosts[postId] = !expandedPosts[postId];
}

function normalizeImageUrl(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  return trimmed;
}

async function fetchProfile() {
  if (!editableProfileStoreId.value || !address.value) {
    userProfile.exists = false;
    userProfile.owner = '';
    userProfile.nickname = '';
    userProfile.avatar = '';
    userProfile.bio = '';
    userProfile.points = 0;
    ownedNfts.value = [];
    return;
  }
  profileLoading.value = true;
  try {
    const store: any = await rawRpc('sui_getObject', [editableProfileStoreId.value, { showContent: true }]);
    const fields = store?.data?.content?.fields;
    if (!fields) {
      userProfile.exists = false;
      userProfile.owner = '';
      userProfile.nickname = '';
      userProfile.avatar = '';
      userProfile.bio = '';
      userProfile.points = 0;
      return;
    }
    const profiles: any[] = fields.profiles || [];
    const targetOwner = address.value.toLowerCase();
    let match: any = null;
    for (const entry of profiles) {
      const pf = toStructFields(entry);
      if (!pf) continue;
      const ownerStr = typeof pf.owner === 'string' ? pf.owner : (pf.owner?.value || '');
      if (ownerStr && ownerStr.toLowerCase() === targetOwner) {
        match = pf;
        break;
      }
    }
    if (!match) {
      userProfile.exists = false;
      userProfile.owner = '';
      userProfile.nickname = '';
      userProfile.avatar = '';
      userProfile.bio = '';
      userProfile.points = 0;
    ownedNfts.value = [];
      profileForm.nickname = '';
      profileForm.avatar = '';
      profileForm.bio = '';
      return;
    }
    userProfile.exists = true;
    userProfile.owner = match.owner;
    userProfile.nickname = decodeMoveString(match.nickname);
    userProfile.avatar = decodeMoveString(match.avatar);
    userProfile.bio = decodeMoveString(match.bio);
    const ptsRaw = match.points;
    userProfile.points = Number(typeof ptsRaw === 'string' ? ptsRaw : (ptsRaw?.toString?.() || ptsRaw || 0));
    profileForm.nickname = userProfile.nickname;
    profileForm.avatar = userProfile.avatar;
    profileForm.bio = userProfile.bio;
    await fetchMyNfts();
  } catch (e) {
    console.warn('加载个人资料失败', e);
  } finally {
    profileLoading.value = false;
  }
}

function requireProfileStore(): boolean {
  const trimmed = (editableProfileStoreId.value || '').trim();
  editableProfileStoreId.value = trimmed;
  if (!trimmed) {
    setError('请先填写 Profile Store Object ID');
    return false;
  }
  return true;
}

function requireRandomObject(): boolean {
  const trimmed = (randomObjectId.value || '').trim();
  randomObjectId.value = trimmed;
  if (!trimmed) {
    setError('请先填写 Random Object ID');
    return false;
  }
  return true;
}

function saveProfile() {
  if (!requireProfileStore()) { return; }
  runTx(tx => {
    tx.moveCall({
      target: `${PACKAGE_ID}::blogtaotao::upsert_profile`,
      arguments: [
        tx.object(editableProfileStoreId.value),
        tx.pure.string(profileForm.nickname || ''),
        tx.pure.string(profileForm.avatar || ''),
        tx.pure.string(profileForm.bio || ''),
      ],
    });
  }, fetchProfile);
}

function redeemNft() {
  if (!requireProfileStore() || !requireRandomObject()) { return; }
  runTx(tx => {
    tx.moveCall({
      target: `${PACKAGE_ID}::blogtaotao::redeem_nft`,
      arguments: [tx.object(editableProfileStoreId.value), tx.object(randomObjectId.value)],
    });
  }, async () => { await fetchProfile(); await fetchMyNfts(); });
}

async function fetchMyNfts() {
  ownedNfts.value = [];
  if (!address.value) {
    return;
  }
  const pkg = (nftPackageId.value || '').trim();
  if (!pkg) {
    return;
  }
  nftLoading.value = true;
  try {
    const objects = await client.value.getOwnedObjects({
      owner: address.value,
      filter: { StructType: `${pkg}::my_nft::MyNFT` },
      options: { showContent: true },
    });
    const items: any[] = [];
    for (const entry of objects.data) {
      const content: any = entry.data?.content;
      if (!content || content.dataType !== 'moveObject') continue;
      const fields = content.fields as any;
      items.push({
        id: entry.data?.objectId,
        name: decodeMoveString(fields.name),
        description: decodeMoveString(fields.description),
        url: decodeMoveString(fields.url),
        detail: decodeMoveString(fields.detail),
      });
    }
    ownedNfts.value = items;
  } catch (e) {
    console.warn('获取NFT失败', e);
  } finally {
    nftLoading.value = false;
  }
}

// 消息相关方法
async function sendMessage() {
  if (!newMessage.recipient.trim() || !newMessage.content.trim()) {
    errorMessage.value = '请填写接收者和消息内容';
    return;
  }
  try {
    await sendMessageInternal(newMessage.recipient, newMessage.content);
    newMessage.recipient = '';
    newMessage.content = '';
    if (messageToastTimer !== null) {
      window.clearTimeout(messageToastTimer);
    }
    messageToast.value = '发送成功';
    messageToastTimer = window.setTimeout(() => {
      messageToast.value = '';
      messageToastTimer = null;
    }, 2200);
  } catch (e) {
    setError(e);
  }
}

async function decryptMessage(msg: any) {
  try {
    const decrypted = await decryptMessageInternal(msg);
    decryptedMessages[msg.id] = decrypted;
  } catch (e) {
    setError(e);
  }
}

async function clearMessages() {
  try {
    await clearIndex();
  } catch (e) {
    setError(e);
  }
}

async function refreshMessages() {
  refreshingMessages.value = true;
  try {
    await fetchMessages();
  } finally {
    refreshingMessages.value = false;
  }
}

function toggleEdit(postId: string) {
  if (!editingPosts[postId]) {
    const p = posts.value.find(x => x.id === postId);
    if (!p) return;
    editingPosts[postId] = { title: p.title, content: p.content, image: p.image, open: true };
  } else {
    editingPosts[postId].open = !editingPosts[postId].open;
  }
}
function applyEdit(postId: string) {
  const ep = editingPosts[postId];
  if (!ep) return;
  if (!ep.title || !ep.content) { setError('标题和内容不能为空'); return; }
  const serialized = serializePostContent(ep.content);
  runTx(tx => {
    tx.moveCall({ target: `${PACKAGE_ID}::blogtaotao::update_post`, arguments: [tx.object(postId), tx.pure.string(ep.title), tx.pure.string(serialized), tx.pure.string(ep.image || '')] });
  }, async () => { editingPosts[postId].open = false; await fetchPosts(); }, { estimateGas: true });
}
function deletePost(postId: string) {
  runTx(tx => { tx.moveCall({ target: `${PACKAGE_ID}::blogtaotao::delete_post`, arguments: [tx.object(editableBlogId.value), tx.object(postId)] }); }, async () => { await fetchPosts(); });
}
const currentNetworkName = computed(() => {
  const n = networks.find(x => x.url === rpc.value);
  return n ? n.name : '自定义';
});
const networks = [
  { name: 'Devnet', url: 'https://fullnode.devnet.sui.io:443' },
  { name: 'Testnet', url: 'https://fullnode.testnet.sui.io:443' },
  { name: 'Mainnet', url: 'https://fullnode.mainnet.sui.io:443' }
];
// Watch rpc changes to refresh data
watch(rpc, (newUrl, oldUrl) => {
  if (newUrl === oldUrl) return;
  posts.value = [];
  suiBalance.value = '';
  // Refetch posts & balance (balance only if wallet loaded)
  fetchPosts();
  fetchBalance();
  if (activeTab.value === 'messages') {
    fetchMessages();
  }
});
watch(address, () => {
  fetchProfile();
  if (activeTab.value === 'messages' && address.value) {
    fetchMessages();
  }
});
watch(activeTab, (newTab) => {
  if (newTab === 'messages' && address.value) {
    fetchMessages();
  }
});
watch(editableProfileStoreId, (newId, oldId) => {
  if (newId === oldId) return;
  fetchProfile();
});
watch(nftPackageId, (newId, oldId) => {
  if (newId === oldId) return;
  fetchMyNfts();
});
watch(myMessagesTotalPages, (pages) => {
  if (myMessagesPage.value > pages) {
    myMessagesPage.value = pages;
  }
});
fetchPosts();
fetchBalance();
fetchProfile();

// 复制到剪贴板函数
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    // 可以添加一个简单的提示
    console.log('地址已复制到剪贴板:', text);
  } catch (err) {
    console.error('复制失败:', err);
    // 降级方案：使用 document.execCommand
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      console.log('地址已复制到剪贴板 (降级方案):', text);
    } catch (fallbackErr) {
      console.error('降级复制也失败:', fallbackErr);
    }
    document.body.removeChild(textArea);
  }
}
</script>
<style scoped>
.app { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
.post { border: 1px solid #ccc; padding: 1rem; margin-bottom: 1rem; }
.comment { margin-left: 1.2rem; color: #444; }
.banner { background: #ffe0e0; padding: 0.5rem; margin-bottom: 1rem; border: 1px solid #ffaaaa; }
.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1200; padding: 1rem; }
.modal-card { width: min(680px, 95vw); background: #fff; border-radius: 10px; border: 1px solid #dbeafe; box-shadow: 0 18px 40px rgba(2, 6, 23, 0.24); padding: 1rem; }
.modal-card h3 { margin: 0 0 0.75rem; color: #1d2d6c; }
.modal-card textarea { width: 100%; min-height: 120px; resize: vertical; padding: 0.6rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: monospace; font-size: 0.9rem; }
.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; }
.modal-actions button { padding: 0.45rem 0.9rem; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; background: #f8fafc; }
.modal-actions button:hover:not(:disabled) { background: #eef2ff; }
.warning { background: #fff9d6; padding: .5rem; margin-bottom: 1rem; border: 1px solid #ead990; }
.tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
.tab-btn { border: 1px solid #c8d1ff; background: #eef1ff; padding: 0.4rem 0.9rem; border-radius: 6px; cursor: pointer; font-size: 0.95rem; color: #31407a; transition: background 0.15s ease; }
.tab-btn.active { background: #ffffff; color: #1d2d6c; border-color: #9ba8f3; font-weight: 600; }
.tab-panel { margin-bottom: 1.5rem; }
.panel-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.panel-header h1 { margin: 0; font-size: 1.8rem; color: #1d2d6c; }
.panel-actions { display: flex; align-items: center; gap: 0.5rem; }
.project-info { border: 1px solid #dcdcdc; padding: 1rem; background: #f4f7ff; border-radius: 8px; }

/* 帖子相关样式 */
.refresh-btn {
  background: #1d4ed8;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s ease;
}
.refresh-btn:hover:not(:disabled) { background: #1e40af; }

.loading-indicator {
  color: #666;
  font-size: 0.9rem;
  font-style: italic;
}

/* 新建帖子容器 */
.new-post-container {
  max-width: 800px;
  margin: 0 auto;
  margin-bottom: 2rem;
}

/* 新建帖子卡片 */
.new-post-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.15);
  color: white;
}

.new-post-header h2 {
  margin: 0 0 1rem 0;
  font-size: 1.3rem;
  font-weight: 600;
}

.new-post-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.title-input, .image-input {
  padding: 0.75rem;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
  transition: border-color 0.2s ease;
}

.title-input::placeholder, .image-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.title-input:focus, .image-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
}

.content-textarea {
  padding: 0.75rem;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s ease;
}

.content-textarea::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.content-textarea:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.publish-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.3);
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.publish-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-1px);
}

/* 帖子容器 */
.posts-container {
  max-width: 800px;
  margin: 0 auto;
}

.no-posts {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.no-posts-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.no-posts-text {
  font-size: 1.1rem;
  color: #999;
}

/* 帖子网格 */
.posts-grid {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* 帖子卡片 */
.post-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.post-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

/* 帖子头部 */
.post-header {
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid #f0f0f0;
}

.post-title h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #1d2d6c;
  line-height: 1.3;
}

.post-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: #666;
}

.author-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.author-avatar {
  font-size: 1.2rem;
}

.author-name {
  cursor: pointer;
  font-weight: 500;
  color: #1d4ed8;
  word-break: break-all;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.85rem;
  line-height: 1.4;
}

.author-name:hover {
  text-decoration: underline;
}

.post-time {
  color: #999;
  font-size: 0.85rem;
}

/* 帖子图片 */
.post-image {
  width: 100%;
  overflow: hidden;
}

.post-image img {
  width: 100%;
  height: auto;
  object-fit: contain;
  transition: transform 0.3s ease;
}

.post-image:hover img {
  transform: scale(1.02);
}

/* 帖子内容 */
.post-content {
  padding: 1.5rem;
  font-size: 1rem;
  line-height: 1.6;
  color: #333;
}

.post-content p {
  margin: 0;
}
.expand-btn {
  margin-top: 0.45rem;
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0;
}
.expand-btn:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

/* 帖子操作 */
.post-actions {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.like-btn {
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.like-btn:hover:not(:disabled) {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.owner-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-btn, .delete-btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.edit-btn {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.edit-btn:hover:not(:disabled) {
  background: #fde68a;
}

.delete-btn {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
}

.delete-btn:hover:not(:disabled) {
  background: #fca5a5;
}

/* 编辑表单 */
.edit-form {
  padding: 1.5rem;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.edit-input, .edit-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}

.edit-textarea {
  min-height: 80px;
  resize: vertical;
}

.save-btn {
  background: #059669;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: background 0.2s ease;
}

.save-btn:hover:not(:disabled) {
  background: #047857;
}

/* 评论区域 */
.comments-section {
  border-top: 1px solid #f0f0f0;
}

.comments-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #f0f0f0;
}

.comments-header h4 {
  margin: 0;
  font-size: 1.1rem;
  color: #374151;
  font-weight: 600;
}

.comments-list {
  max-height: 300px;
  overflow-y: auto;
}

.comment-item {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #f5f5f5;
}

.comment-item:last-child {
  border-bottom: none;
}

.comment-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.comment-author {
  cursor: pointer;
  font-weight: 600;
  color: #1d4ed8;
  font-size: 0.9rem;
  word-break: break-all;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  line-height: 1.4;
}

.comment-author:hover {
  text-decoration: underline;
}

.comment-text {
  color: #374151;
  line-height: 1.5;
}

.comment-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #6b7280;
}

.comment-like-btn {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s ease;
}

.comment-like-btn:hover:not(:disabled) {
  background: #e5e7eb;
}

/* 添加评论 */
.add-comment {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.comment-input-group {
  display: flex;
  gap: 0.5rem;
}

.comment-input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.95rem;
}

.comment-submit-btn {
  background: #1d4ed8;
  color: white;
  border: none;
  padding: 0.75rem 1.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: background 0.2s ease;
}

.comment-submit-btn:hover:not(:disabled) {
  background: #1e40af;
}

.comment-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.wallet { display: flex; flex-direction: column; gap: 0.5rem; }
.wallet input { width: 100%; padding: 0.35rem; }
.wallet-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.wallet-note { font-size: 12px; color: #888; }
.wallet-meta { font-size: 0.85rem; color: #333; display: flex; flex-direction: column; gap: 0.25rem; }
.wallet-network { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.9rem; }
.wallet-network select { margin-left: 0.25rem; padding: 0.3rem; }
.current-network { font-size: 0.85rem; color: #555; }
.wallet-ids { display: grid; gap: 0.5rem; margin-top: 0.5rem; }
.wallet-ids label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; color: #444; }
.wallet-ids input { padding: 0.35rem; }
.wallet-hint { font-size: 12px; color: #555; }
.faucet-links { margin-top: 0.75rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; font-size: 0.9rem; }
.faucet-links a { color: #1d4ed8; text-decoration: none; }
.faucet-links a:hover { text-decoration: underline; }
.mono { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; word-break: break-all; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.profile-section { border: 1px solid #dcdcdc; padding: 1rem; margin-bottom: 1rem; background: #f7f9ff; }
.profile-form { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.5rem 0 0.75rem; }
.profile-form input, .profile-form textarea { width: 100%; padding: 0.4rem; }
.profile-avatar { max-width: 120px; border-radius: 8px; margin: 0.5rem 0; }
.redeem-btn { margin-top: 0.5rem; }
.muted { color: #777; font-size: 12px; margin-top: 0.35rem; }
.nft-list { margin-top: 1rem; }
.nft-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.nft-card { border: 1px solid #cdd7ff; background: #fff; padding: 0.6rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.35rem; }
.nft-card img { max-width: 100%; border-radius: 6px; }
.nft-name { font-weight: bold; }
.nft-desc { font-size: 0.85rem; color: #444; min-height: 2.5rem; }
.nft-id { font-size: 0.75rem; color: #999; word-break: break-all; }

/* 消息相关样式 */
.messages-section { padding: 1rem 0; }
.message-toast { margin: 0 0 1rem; background: #e7f8ee; color: #165b2d; border: 1px solid #a8e0bc; padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.92rem; }
.send-message { border: 1px solid #ddd; padding: 1rem; margin-bottom: 1.5rem; background: #f9f9f9; border-radius: 8px; }
.send-message h3 { margin-top: 0; color: #333; }
.send-message input, .send-message textarea {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  display: block;
  padding: 0.6rem;
  margin-bottom: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.95rem;
}
.send-message textarea { min-height: 80px; resize: vertical; }
.send-message button { background: #1d4ed8; color: white; padding: 0.6rem 1.2rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.95rem; }
.send-message button:hover:not(:disabled) { background: #1e40af; }

.my-messages-section, .pool-messages-section { margin-bottom: 2rem; }
.my-messages-section h3, .pool-messages-section h3 { margin-top: 0; color: #1d2d6c; border-bottom: 2px solid #ddd; padding-bottom: 0.5rem; }

.message-controls { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.message-controls button { padding: 0.4rem 0.8rem; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
.message-controls button:hover:not(:disabled) { background: #e0e0e0; }

.message-list { display: flex; flex-direction: column; gap: 0.8rem; }
.message { border: 1px solid #e0e0e0; padding: 1rem; border-radius: 6px; background: #fafafa; }
.message-header { display: flex; gap: 1rem; font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; flex-wrap: wrap; }
.message-header .sender { font-weight: 500; }
.message-header .recipient { font-weight: 500; }
.message-header .time { color: #999; margin-left: auto; }
.message-content { padding: 0.75rem; background: white; border-left: 3px solid #1d4ed8; margin: 0.75rem 0; font-size: 0.95rem; word-break: break-word; }
.message-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.message-actions button { padding: 0.4rem 0.8rem; background: #1d4ed8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
.message-actions button:hover:not(:disabled) { background: #1e40af; }
.message-pagination { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.8rem; }
.message-pagination button { padding: 0.35rem 0.7rem; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; font-size: 0.88rem; }
.message-pagination button:hover:not(:disabled) { background: #e5e7eb; }
.message-pagination span { font-size: 0.9rem; color: #4b5563; }

    .pool-stats { display: flex; flex-direction: column; gap: 0.8rem; padding: 1rem; border: 1px solid #e5e7eb; background: #fbfbff; border-radius: 8px; }
    .stats-row { font-size: 0.98rem; color: #333; }
    .stats-row strong { color: #111; }
    .user-count-table { border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
    .table-header, .table-row { display: grid; grid-template-columns: 1fr auto; gap: 1rem; padding: 0.75rem 1rem; align-items: center; }
    .table-header { background: #eef2ff; font-weight: 700; color: #1f2937; }
    .table-row { background: white; border-top: 1px solid #e5e7eb; }
    .table-row:nth-child(even) { background: #f9fafb; }
    .user-address { color: #2563eb; cursor: pointer; word-break: break-all; }
    .user-address:hover { text-decoration: underline; }
</style>
