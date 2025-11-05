

module blogtaotao::blogtaotao;

use std::string;
use sui::clock;
use sui::event;
use sui::random::Random;
use fafafa::my_nft;

const E_PROFILE_NOT_FOUND: u64 = 3;
const E_INSUFFICIENT_POINTS: u64 = 4;
const POINT_REWARD: u64 = 10;

// ===================== Resources =====================
public struct Blog has key, store { id: object::UID, title: string::String, posts: vector<object::ID> }
public struct Post has key, store {
	id: object::UID,
	author: address,
	title: string::String,
	content: string::String,
	publish_time: u64, // milliseconds timestamp from Sui Clock
	image: string::String, // image reference or URL (utf8)
	likes: u64,
	comment_count: u64,                    // 总评论数
	comment_ids: vector<object::ID>,       // 所有评论对象的ID列表
	deleted: bool,                         // 软删除标记，true 表示已删除
}
// 共享评论对象 - 无拥有者，任何人可读可点赞
public struct SharedComment has key {
	id: object::UID,
	post_id: object::ID,
	author: address,
	content: string::String,
	likes: u64,
	created_time: u64,
}

public struct UserProfile has store {
	owner: address,
	nickname: string::String,
	avatar: string::String,
	bio: string::String,
	points: u64,
}

public struct ProfileStore has key {
	id: object::UID,
	profiles: vector<UserProfile>,
}

// ===================== Events =====================
public struct BlogCreated has copy, drop { blog_id: object::ID, title: string::String }
public struct PostCreated has copy, drop { post_id: object::ID, author: address, title: string::String, publish_time: u64, image: string::String }
public struct CommentAdded has copy, drop { post_id: object::ID, author: address, content: string::String, comment_id: object::ID }
public struct PostLiked has copy, drop { post_id: object::ID, liker: address }
public struct CommentLiked has copy, drop { comment_id: object::ID, liker: address }
public struct PostUpdated has copy, drop { post_id: object::ID, author: address, new_title: string::String, new_content: string::String, new_image: string::String }

// ===================== Views =====================
public fun blog_title(blog: &Blog): &string::String { &blog.title }
public fun blog_post_count(blog: &Blog): u64 { vector::length(&blog.posts) }
public fun blog_post_id_at(blog: &Blog, i: u64): object::ID { *vector::borrow(&blog.posts, i) }
public fun blog_post_ids(blog: &Blog): &vector<object::ID> { &blog.posts }
public fun post_title(post: &Post): &string::String { &post.title }
public fun post_content(post: &Post): &string::String { &post.content }
public fun post_publish_time(post: &Post): u64 { post.publish_time }
public fun post_image(post: &Post): &string::String { &post.image }
public fun post_likes(post: &Post): u64 { post.likes }
public fun post_comment_count(post: &Post): u64 { post.comment_count }
public fun post_comment_ids(post: &Post): &vector<object::ID> { &post.comment_ids }
public fun shared_comment_content(c: &SharedComment): &string::String { &c.content }
public fun shared_comment_likes(c: &SharedComment): u64 { c.likes }
public fun shared_comment_author(c: &SharedComment): address { c.author }
public fun shared_comment_created_time(c: &SharedComment): u64 { c.created_time }
public fun shared_comment_post_id(c: &SharedComment): object::ID { c.post_id }
public fun profile_exists(store: &ProfileStore, user: address): bool {
	let (found, _) = find_profile_index(&store.profiles, user);
	found
}
public fun profile_points(store: &ProfileStore, user: address): u64 {
	let (found, idx) = find_profile_index(&store.profiles, user);
	if (!found) { 0 } else { vector::borrow(&store.profiles, idx).points }
}
public fun profile_nickname(store: &ProfileStore, user: address): &string::String {
	let idx = profile_index_or_abort(store, user);
	&vector::borrow(&store.profiles, idx).nickname
}
public fun profile_avatar(store: &ProfileStore, user: address): &string::String {
	let idx = profile_index_or_abort(store, user);
	&vector::borrow(&store.profiles, idx).avatar
}
public fun profile_bio(store: &ProfileStore, user: address): &string::String {
	let idx = profile_index_or_abort(store, user);
	&vector::borrow(&store.profiles, idx).bio
}

// ===================== Initialization =====================
// Create and share the global blog. Should be called once.
entry fun init_global_blog(title_bytes: vector<u8>, ctx: &mut tx_context::TxContext) {
	let blog = Blog { id: object::new(ctx), title: string::utf8(title_bytes), posts: vector[] };
	event::emit(BlogCreated { blog_id: object::id(&blog), title: blog.title });
	// Share so everyone can mutate (add posts).
	transfer::share_object(blog);
}

// Initialize the shared profile store. Call once, similar to init_global_blog.
entry fun init_profile_store(ctx: &mut tx_context::TxContext) {
	let store = ProfileStore { id: object::new(ctx), profiles: vector[] };
	transfer::share_object(store);
}

// Create or update the caller's profile. Points stay unchanged by this action.
entry fun upsert_profile(store: &mut ProfileStore, nickname_bytes: vector<u8>, avatar_bytes: vector<u8>, bio_bytes: vector<u8>, ctx: &tx_context::TxContext) {
	let sender = tx_context::sender(ctx);
	let nickname = string::utf8(nickname_bytes);
	let avatar = string::utf8(avatar_bytes);
	let bio = string::utf8(bio_bytes);
	let (found, idx) = find_profile_index(&store.profiles, sender);
	if (found) {
		let profile = vector::borrow_mut(&mut store.profiles, idx);
		profile.nickname = nickname;
		profile.avatar = avatar;
		profile.bio = bio;
	} else {
		vector::push_back(&mut store.profiles, UserProfile { owner: sender, nickname, avatar, bio, points: 0 });
	};
}

// Spend points to mint an NFT from the fafafa::my_nft module to the caller.
entry fun redeem_nft(store: &mut ProfileStore, random: &Random, ctx: &mut tx_context::TxContext) {
	let sender = tx_context::sender(ctx);
	deduct_points(store, sender, POINT_REWARD);
	my_nft::mint_to_sender(random, ctx);
}

// ===================== Post Ops =====================
// Anyone can create a post in the global blog.
entry fun create_post(blog: &mut Blog, profiles: &mut ProfileStore, title_bytes: vector<u8>, content_bytes: vector<u8>, image_bytes: vector<u8>, _clock: &clock::Clock, ctx: &mut tx_context::TxContext) {
	let author = tx_context::sender(ctx);
	// Use precise timestamp from Sui Clock (milliseconds since Unix epoch)
	let timestamp_ms = clock::timestamp_ms(_clock);
	let post = Post { id: object::new(ctx), author: author, title: string::utf8(title_bytes), content: string::utf8(content_bytes), publish_time: timestamp_ms, image: string::utf8(image_bytes), likes: 0, comment_count: 0, comment_ids: vector[], deleted: false };
	let pid = object::id(&post);
	vector::push_back(&mut blog.posts, pid);
	event::emit(PostCreated { post_id: pid, author: author, title: post.title, publish_time: post.publish_time, image: post.image });
	// Share Post 使得任何人可以对其评论和点赞；作者仍通过 author 字段控制编辑/删除
	transfer::share_object(post);
	add_points(profiles, author, POINT_REWARD);
}


// Update multiple fields (title/content/image) at once by author
entry fun update_post(post: &mut Post, new_title_bytes: vector<u8>, new_content_bytes: vector<u8>, new_image_bytes: vector<u8>, ctx: &tx_context::TxContext) {
	let s = tx_context::sender(ctx);
	assert!(post.author == s, 0);
	assert!(!post.deleted, 0); // 已删除不可更新
	let new_title = string::utf8(new_title_bytes);
	let new_content = string::utf8(new_content_bytes);
	let new_image = string::utf8(new_image_bytes);
	post.title = new_title;
	post.content = new_content;
	post.image = new_image;
	event::emit(PostUpdated { post_id: object::id(post), author: s, new_title, new_content, new_image });
}

entry fun like_post(post: &mut Post, profiles: &mut ProfileStore, ctx: &tx_context::TxContext) {
	let s = tx_context::sender(ctx);
	assert!(!post.deleted, 0);
	post.likes = post.likes + 1;
	event::emit(PostLiked { post_id: object::id(post), liker: s });
	add_points(profiles, post.author, POINT_REWARD);
}

// Delete own post: only author can delete. Remove from blog.posts.
// Soft delete: 仅作者可标记删除，移出 Blog 列表并标记 deleted=true
entry fun delete_post(blog: &mut Blog, post: &mut Post, ctx: &tx_context::TxContext) {
	let s = tx_context::sender(ctx);
	assert!(post.author == s, 0);
	assert!(!post.deleted, 1); // 已删除重复操作
	let pid = object::id(post);
	let mut i = 0; let len = vector::length(&blog.posts); let mut new_posts = vector[]; let mut removed = false;
	while (i < len) {
		let cur = *vector::borrow(&blog.posts, i);
		if (cur != pid) { vector::push_back(&mut new_posts, cur); } else { removed = true; };
		i = i + 1;
	};
	assert!(removed, 2); // post id not found when deleting
	blog.posts = new_posts;
	post.deleted = true; // mark soft-deleted
	// touch another field to emphasize mutation usage (no-op)
	post.likes = post.likes;
}

// ===================== Comment Ops =====================
// Anyone can comment - creates shared comment objects only.
entry fun comment_on_post(post: &mut Post, profiles: &mut ProfileStore, content_bytes: vector<u8>, clock: &clock::Clock, ctx: &mut tx_context::TxContext) {
	let author = tx_context::sender(ctx);
	assert!(!post.deleted, 0);
	let content = string::utf8(content_bytes);
	let created_time = clock::timestamp_ms(clock);
	
	// Create shared comment object (no owner)
	let shared_comment = SharedComment {
		id: object::new(ctx),
		post_id: object::id(post),
		author,
		content,
		likes: 0,
		created_time,
	};
	let comment_id = object::id(&shared_comment);
	vector::push_back(&mut post.comment_ids, comment_id);
	event::emit(CommentAdded { post_id: object::id(post), author, content, comment_id });
	
	// Share the comment object - becomes ownerless!
	transfer::share_object(shared_comment);
	post.comment_count = post.comment_count + 1;
	add_points(profiles, author, POINT_REWARD);
}

// Like shared comment (anyone can call this since it's shared)
entry fun like_comment(shared_comment: &mut SharedComment, profiles: &mut ProfileStore, ctx: &tx_context::TxContext) {
	let liker = tx_context::sender(ctx);
	shared_comment.likes = shared_comment.likes + 1;
	event::emit(CommentLiked { comment_id: object::id(shared_comment), liker });
	add_points(profiles, shared_comment.author, POINT_REWARD);
}

// ===================== End =====================

fun add_points(store: &mut ProfileStore, user: address, amount: u64) {
	let (found, idx) = find_profile_index(&store.profiles, user);
	if (found) {
		let profile = vector::borrow_mut(&mut store.profiles, idx);
		profile.points = profile.points + amount;
	} else {
		vector::push_back(&mut store.profiles, UserProfile {
			owner: user,
			nickname: empty_string(),
			avatar: empty_string(),
			bio: empty_string(),
			points: amount,
		});
	};
}

fun deduct_points(store: &mut ProfileStore, user: address, amount: u64) {
	let (found, idx) = find_profile_index(&store.profiles, user);
	assert!(found, E_PROFILE_NOT_FOUND);
	let profile = vector::borrow_mut(&mut store.profiles, idx);
	assert!(profile.points >= amount, E_INSUFFICIENT_POINTS);
	profile.points = profile.points - amount;
}

fun find_profile_index(profiles: &vector<UserProfile>, user: address): (bool, u64) {
	let len = vector::length(profiles);
	let mut i = 0;
	while (i < len) {
		let profile = vector::borrow(profiles, i);
		if (profile.owner == user) {
			return (true, i)
		};
		i = i + 1;
	};
	(false, 0)
}

fun profile_index_or_abort(store: &ProfileStore, user: address): u64 {
	let (found, idx) = find_profile_index(&store.profiles, user);
	assert!(found, E_PROFILE_NOT_FOUND);
	idx
}

fun empty_string(): string::String {
	string::utf8(vector::empty<u8>())
}
