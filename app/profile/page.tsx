"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Camera,
  ImagePlus,
  Inbox,
  Loader2,
  LogOut,
  Menu,
  Settings,
  MessageCircle,
  Pin,
  Plus,
  Save,
  Search,
  Flag,
  ShieldOff,
  Send,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { supabase } from "@/lib/supabase";
import { initials } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { toast } from "sonner";

const BIO_LIMIT = 80;
const BOARD_TITLE_LIMIT = 30;
const BOARD_DESC_LIMIT = 150;
const BOARD_TITLE_WARN = 20;
const BOARD_DESC_WARN = 120;
const MAX_TAGS = 5;
const PUBLIC_BOARDS_PER_PAGE = 10;
const MY_BOARDS_PER_PAGE = 5;
const DM_PAGE_SIZE = 30;

const SUGGESTED_TAGS = [
  "gaming", "music", "tech", "sports", "art", "film", "books", "fitness",
  "food", "travel", "science", "politics", "crypto", "fashion", "photography",
  "coding", "anime", "news", "business", "health",
];

type BoardWithMeta = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  created_at: string;
  creator_id: string;
  tags: string[];
  member_count: number;
  unread_count: number;
  joined: boolean;
};

type NotificationItem = {
  id: string;
  type: "like" | "reply" | "mention";
  board_id: string;
  board_title: string;
  actor_id: string;
  actor_username: string;
  actor_avatar_url: string | null;
  target_comment_id: string;
  original_comment_snippet: string;
  reply_snippet?: string;
  mention_snippet?: string;
  created_at: string;
  read: boolean;
  // Stacked likes — populated when multiple people liked the same comment
  like_actors?: { id: string; username: string; avatar_url: string | null }[];
};

type Friend = {
  id: string;
  username: string;
  avatar_url: string | null;
  friendship_id: string;
};

type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  message_type: "dm" | "dm_image" | "board_invite" | "board_invite_sent" | "board_invite_accepted" | "board_invite_declined" | "mention";
  metadata?: {
    board_id?: string;
    board_title?: string;
    inviter_username?: string;
    invitee_username?: string;
    responder_username?: string;
    image_url?: string | null;
    image_type?: "image" | "gif";
  } | null;
  created_at: string;
  read_at: string | null;
  sender_username?: string;
  sender_avatar_url?: string | null;
};

type Conversation = {
  friend_id: string;
  friend_username: string;
  friend_avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
};


function PendingFriendRequests({
  userId,
  onAccept,
}: {
  userId: string;
  onAccept: () => void;
}) {
  type PendingRequest = {
    id: string;
    sender_id: string;
    username: string;
    avatar_url: string | null;
  };

  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  


  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("friend_requests")
        .select("id, sender_id, profiles!sender_id(username, avatar_url)")
        .eq("recipient_id", userId)
        .eq("status", "pending");

      setPending(
        (data || []).map((r: any) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return {
            id: r.id,
            sender_id: r.sender_id,
            username: p?.username ?? "Unknown",
            avatar_url: p?.avatar_url ?? null,
          };
        })
      );
      setLoading(false);
    }
    load();
  }, [userId]);


  
  async function respond(requestId: string, status: "accepted" | "declined") {
    setResponding(requestId);
    await supabase
      .from("friend_requests")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", requestId);
    setPending((prev: PendingRequest[]) => prev.filter((r: PendingRequest) => r.id !== requestId));
    if (status === "accepted") onAccept();
    setResponding(null);
  }

  if (loading) return null;
  if (!pending.length) return null;

  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-700">Pending friend requests</p>
      {pending.map((req: PendingRequest) => (
        <div key={req.id} className="flex items-center gap-3 rounded-xl  p-3">
          <Avatar className="h-9 w-9 shrink-0 overflow-hidden">
            {req.avatar_url ? (
              <img src={req.avatar_url} alt={req.username} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback>{initials(req.username)}</AvatarFallback>
            )}
          </Avatar>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
            {req.username} wants to be friends
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              className="rounded-2xl"
              disabled={responding === req.id}
              onClick={() => respond(req.id, "accepted")}
            >
              {responding === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Accept"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-2xl"
              disabled={responding === req.id}
              onClick={() => respond(req.id, "declined")}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FriendInvitePicker({
  friends,
  selected,
  onChange,
}: {
  friends: Friend[];
  selected: string;
  onChange: (val: string) => void;
}) {
  const [search, setSearch] = useState("");
  const selectedList = selected ? selected.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const filtered = friends.filter(
    (f) =>
      f.username.toLowerCase().includes(search.toLowerCase()) &&
      !selectedList.includes(f.username)
  );

  function toggle(username: string) {
    const next = selectedList.includes(username)
      ? selectedList.filter((u) => u !== username)
      : [...selectedList, username];
    onChange(next.join(", "));
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">Invite friends</label>
      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedList.map((u) => (
            <span key={u} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs text-white">
              @{u}
              <button type="button" onClick={() => toggle(u)} className="hover:text-slate-300">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search your friends..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-2xl"
        />
      </div>
      {search && (
        <div className="rounded-2xl border border-slate-200  overflow-hidden">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No friends found.</p>
          ) : (
            filtered.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { toggle(f.username); setSearch(""); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:"
              >
                <Avatar className="h-7 w-7 shrink-0 overflow-hidden">
                  {f.avatar_url ? (
                    <img src={f.avatar_url} alt={f.username} className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback>{initials(f.username)}</AvatarFallback>
                  )}
                </Avatar>
                @{f.username}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [myBoards, setMyBoards] = useState<BoardWithMeta[]>([]);
  const [publicBoards, setPublicBoards] = useState<BoardWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [joiningBoardId, setJoiningBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [inviteUsernames, setInviteUsernames] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");const [showNotifications, setShowNotifications] = useState(false);
const [showSettings, setShowSettings] = useState(false);
const [showMobileMenu, setShowMobileMenu] = useState(false);
const [showMobileProfile, setShowMobileProfile] = useState(false);
const [deletingAccount, setDeletingAccount] = useState(false);
const [pushEnabled, setPushEnabled] = useState(false);
const pushEnabledRef = useRef(false);
const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
const readReceiptsEnabledRef = useRef(true);
const [savingReadReceipts, setSavingReadReceipts] = useState(false);
  const showNotificationsRef = useRef(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsLoadingMore, setNotificationsLoadingMore] = useState(false);
  const [notificationsLastViewedAt, setNotificationsLastViewedAt] = useState<string | null>(null);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const notificationsLoadMoreRef = useRef<HTMLDivElement>(null);
  const notificationsPageRef = useRef(0);

  // Inbox state
  const [showInbox, setShowInbox] = useState(false);
  const [inboxTab, setInboxTab] = useState<"messages" | "friends">("messages");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsLoadingMore, setConversationsLoadingMore] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const conversationsPageRef = useRef(0);
  const conversationsLoadMoreRef = useRef<HTMLDivElement>(null);
  const CONVERSATIONS_PAGE_SIZE = 15;
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [activeConversationMessages, setActiveConversationMessages] = useState<DirectMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmDraft, setDmDraft] = useState("");
  const [dmImageFile, setDmImageFile] = useState<File | null>(null);
  const [dmImagePreview, setDmImagePreview] = useState<string | null>(null);
  const [uploadingDmImage, setUploadingDmImage] = useState(false);
  const [dmLightboxUrl, setDmLightboxUrl] = useState<string | null>(null);
  const [sendingDm, setSendingDm] = useState(false);
  const [dmPage, setDmPage] = useState(0);
  const [hasMoreDms, setHasMoreDms] = useState(false);
  const [loadingMoreDms, setLoadingMoreDms] = useState(false);
  const dmTopRef = useRef<HTMLDivElement>(null);
  const dmBottomRef = useRef<HTMLDivElement>(null);
  const activeConversationRef = useRef<string | null>(null);
  const clearedConversationsRef = useRef<Set<string>>(new Set());
  const sentMessageIdsRef = useRef<Set<string>>(new Set());

  // Always deduplicate by id and keep chronological order
  function setMessages(updater: DirectMessage[] | ((prev: DirectMessage[]) => DirectMessage[])) {
    setActiveConversationMessages((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const seen = new Set<string>();
      return next.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    });
  }
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [unreadFriendRequestCount, setUnreadFriendRequestCount] = useState(0);
  const [respondedInvites, setRespondedInvites] = useState<Record<string, "accepted" | "declined">>({});
const [unfriendingId, setUnfriendingId] = useState<string | null>(null); 
const [userSearchQuery, setUserSearchQuery] = useState("");
const [userSearchResults, setUserSearchResults] = useState<{id: string; username: string; avatar_url: string | null; bio: string | null; created_at: string}[]>([]);const [userSearchLoading, setUserSearchLoading] = useState(false);
const [selectedPublicProfile, setSelectedPublicProfile] = useState<{id: string; username: string; avatar_url: string | null; bio: string | null; created_at: string} | null>(null);
const [publicProfileModalOpen, setPublicProfileModalOpen] = useState(false);
const [publicProfileFriendState, setPublicProfileFriendState] = useState<"none" | "pending" | "friends">("none");
const [sendingPublicFriendRequest, setSendingPublicFriendRequest] = useState(false);
const [showPublicProfileLargeAvatar, setShowPublicProfileLargeAvatar] = useState(false);
const [isBlockedByMe, setIsBlockedByMe] = useState(false);
const [blockLoading, setBlockLoading] = useState(false);
  const REPORT_REASONS = [
    { value: "spam", label: "Spam" },
    { value: "harassment", label: "Harassment" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "misinformation", label: "Misinformation" },
    { value: "other", label: "Other" },
  ] as const;
  type ReportReason = typeof REPORT_REASONS[number]["value"];
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [pinnedBoardIds, setPinnedBoardIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("pinnedBoardIds") || "[]"); } catch { return []; }
    }
    return [];
  });
  const [myBoardsPage, setMyBoardsPage] = useState(0);
  const [publicBoardsPage, setPublicBoardsPage] = useState(0);
  const [hasMorePublicBoards, setHasMorePublicBoards] = useState(true);
  const [loadingMorePublicBoards, setLoadingMorePublicBoards] = useState(false);
  const publicBoardsLoadMoreRef = useRef<HTMLDivElement>(null);


  // ─── Board loading ───────────────────────────────────────────────────────────

  const loadBoardsForUser = useCallback(async (userId: string) => {
    // Run all three independent queries in parallel
    const [memberBoardsResult, createdBoardsResult, publicBoardsResult] = await Promise.all([
      supabase
        .from("board_members")
        .select(`
          board_id,
          last_seen_at,
          boards!inner (
            id, title, description, visibility, created_at, creator_id, tags
          )
        `)
        .eq("user_id", userId),
      supabase
        .from("boards")
        .select("id, title, description, visibility, created_at, creator_id, tags")
        .eq("creator_id", userId),
      supabase
        .from("boards")
        .select("id, title, description, visibility, created_at, creator_id, tags")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .range(0, PUBLIC_BOARDS_PER_PAGE - 1),
    ]);

    if (memberBoardsResult.error) throw memberBoardsResult.error;
    if (createdBoardsResult.error) throw createdBoardsResult.error;

    const memberBoards = memberBoardsResult.data;
    const createdBoards = createdBoardsResult.data;
    const allPublicBoards = publicBoardsResult.data;

    const boardIds = [
      ...new Set([
        ...(memberBoards || []).map((m: any) => m.board_id),
        ...(createdBoards || []).map((b: any) => b.id),
        ...(allPublicBoards || []).map((b: any) => b.id),
      ]),
    ];

    // Build a map of last_seen_at per board from the member rows
    const lastSeenMap = new Map<string, string | null>();
    (memberBoards || []).forEach((m: any) => {
      lastSeenMap.set(m.board_id, m.last_seen_at ?? null);
    });

    // Run member counts AND unread comment counts in parallel
    const [memberCountsResult, unreadCommentsResult] = await Promise.all([
      boardIds.length > 0
        ? supabase.rpc("get_board_member_counts", { board_ids: boardIds })
        : Promise.resolve({ data: [] }),
      boardIds.length > 0
        ? supabase
            .from("board_comments")
            .select("board_id, created_at, author_id")
            .in("board_id", boardIds)
            .neq("author_id", userId)
        : Promise.resolve({ data: [] }),
    ]);

    const memberCountMap = new Map<string, number>();
    (memberCountsResult.data || []).forEach((m: any) => {
      memberCountMap.set(m.board_id, Number(m.member_count));
    });

    // Count comments newer than last_seen_at per board
    const unreadCountMap = new Map<string, number>();
    (unreadCommentsResult.data || []).forEach((c: any) => {
      const lastSeen = lastSeenMap.get(c.board_id);
      const isNew = !lastSeen || new Date(c.created_at) > new Date(lastSeen);
      if (isNew) {
        unreadCountMap.set(c.board_id, (unreadCountMap.get(c.board_id) || 0) + 1);
      }
    });

    const memberBoardsMapped: BoardWithMeta[] = (memberBoards || []).map((m: any) => ({
      ...m.boards,
      tags: m.boards.tags ?? [],
      member_count: memberCountMap.get(m.board_id) || 1,
      unread_count: unreadCountMap.get(m.board_id) || 0,
      joined: true,
    }));

    const memberBoardIds = new Set(memberBoardsMapped.map((b) => b.id));
    const createdBoardsMapped: BoardWithMeta[] = (createdBoards || [])
      .filter((b) => !memberBoardIds.has(b.id))
      .map((board) => ({
        ...board,
        tags: board.tags ?? [],
        member_count: memberCountMap.get(board.id) || 1,
        unread_count: unreadCountMap.get(board.id) || 0,
        joined: board.creator_id === userId,
      }));

    const allMyBoards = [...memberBoardsMapped, ...createdBoardsMapped];

    const publicBoardsMapped: BoardWithMeta[] = (allPublicBoards || []).map((board) => ({
      ...board,
      tags: board.tags ?? [],
      member_count: memberCountMap.get(board.id) || 1,
      unread_count: 0,
      joined: allMyBoards.some((b) => b.id === board.id),
    }));

    return {
      myBoards: allMyBoards,
      publicBoards: publicBoardsMapped,
      hasMore: (allPublicBoards || []).length === PUBLIC_BOARDS_PER_PAGE,
    };
  }, []);

  // ─── Notifications loading ───────────────────────────────────────────────────

  const NOTIFICATIONS_PAGE_SIZE = 20;

  const loadNotificationsForUser = useCallback(async (userId: string, page = 0) => {
    if (page === 0) setNotificationsLoading(true);
    else setNotificationsLoadingMore(true);

  try {
    const from = page * NOTIFICATIONS_PAGE_SIZE;
    const to = from + NOTIFICATIONS_PAGE_SIZE - 1;

    // Single query to notifications table — no derived joins needed
    const { data: rows } = await supabase
      .from("notifications")
      .select(`
        id, type, board_id, comment_id, created_at, read_at,
        actor:actor_id ( id, username, avatar_url ),
        board:board_id ( title ),
        comment:comment_id ( content, media_url, parent_comment_id,
          parent:parent_comment_id ( content, media_url )
        )
      `)
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    // Fetch mentions — also join the board title and the comment
    const { data: mentionMessages } = await supabase
      .from("direct_messages")
      .select(`
        id, metadata, created_at, read_at,
        sender_id,
        sender:profiles!sender_id ( id, username, avatar_url )
      `)
      .eq("recipient_id", userId)
      .eq("message_type", "mention")
      .order("created_at", { ascending: false })
      .range(from, to);

    // Fetch board titles for mentions in one query
    const mentionBoardIds = [...new Set(
      (mentionMessages || []).map((m: any) => m.metadata?.board_id).filter(Boolean)
    )];
    const boardTitleMap = new Map<string, string>();
    if (mentionBoardIds.length > 0) {
      const { data: boards } = await supabase
        .from("boards").select("id, title").in("id", mentionBoardIds);
      (boards || []).forEach((b: any) => boardTitleMap.set(b.id, b.title));
    }

    const notifications: NotificationItem[] = [
      // Likes and replies from notifications table
      ...(rows || []).map((row: any) => {
        const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
        const comment = Array.isArray(row.comment) ? row.comment[0] : row.comment;
        const board = Array.isArray(row.board) ? row.board[0] : row.board;
        const parent = comment && (Array.isArray(comment.parent) ? comment.parent[0] : comment.parent);

        // For replies: comment is the reply itself, parent is what was replied to
        // For likes: comment is the liked comment
        const isReply = row.type === "reply";
        const displayComment = isReply ? parent : comment;
        const replyComment = isReply ? comment : null;

        return {
          id: row.id,
          type: row.type as "like" | "reply",
          board_id: row.board_id ?? "",
          board_title: board?.title ?? "Board",
          actor_id: actor?.id ?? "",
          actor_username: actor?.username ?? "Unknown",
          actor_avatar_url: actor?.avatar_url ?? null,
          target_comment_id: row.comment_id ?? "",
          original_comment_snippet: displayComment?.content?.slice(0, 100) ||
            (displayComment?.media_url ? "(image/gif comment)" : "(comment)"),
          reply_snippet: replyComment?.content?.slice(0, 100) ||
            (replyComment?.media_url ? "(image/gif reply)" : undefined),
          created_at: row.created_at,
          read: !!row.read_at,
        };
      }),
      // Mentions from direct_messages
      ...(mentionMessages || []).map((msg: any) => {
        const actor = Array.isArray(msg.sender) ? msg.sender[0] : msg.sender;
        const boardId = msg.metadata?.board_id ?? "";
        return {
          id: `mention-${msg.id}`,
          type: "mention" as const,
          board_id: boardId,
          board_title: boardTitleMap.get(boardId) ?? "Board",
          actor_id: msg.sender_id,
          actor_username: actor?.username ?? "Unknown",
          actor_avatar_url: actor?.avatar_url ?? null,
          target_comment_id: msg.metadata?.comment_id ?? "",
          original_comment_snippet: "(mentioned you in a comment)",
          mention_snippet: "(mentioned you in a comment)",
          created_at: msg.created_at,
          read: !!msg.read_at,
        };
      }),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Stack likes on the same comment into a single notification
    const likesByComment = new Map<string, NotificationItem>();
    const stackedNotifications: NotificationItem[] = [];
    for (const n of notifications) {
      if (n.type === "like") {
        const key = n.target_comment_id;
        if (likesByComment.has(key)) {
          // Add this actor to the existing stacked notification
          const existing = likesByComment.get(key)!;
          existing.like_actors = [
            ...(existing.like_actors ?? [{ id: existing.actor_id, username: existing.actor_username, avatar_url: existing.actor_avatar_url }]),
            { id: n.actor_id, username: n.actor_username, avatar_url: n.actor_avatar_url },
          ];
        } else {
          const stacked: NotificationItem = {
            ...n,
            like_actors: [{ id: n.actor_id, username: n.actor_username, avatar_url: n.actor_avatar_url }],
          };
          likesByComment.set(key, stacked);
          stackedNotifications.push(stacked);
        }
      } else {
        stackedNotifications.push(n);
      }
    }

    const hasMore = (rows?.length ?? 0) === NOTIFICATIONS_PAGE_SIZE ||
                    (mentionMessages?.length ?? 0) === NOTIFICATIONS_PAGE_SIZE;
    setHasMoreNotifications(hasMore);

    if (page === 0) {
      setNotifications(stackedNotifications);
    } else {
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const fresh = stackedNotifications.filter((n) => !existingIds.has(n.id));
        return [...prev, ...fresh].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    }

    if (page === 0) {
      const savedLastViewedAt = localStorage.getItem(`notifications-last-viewed-${userId}`);
      const unread = stackedNotifications.filter((item) => {
        if (!savedLastViewedAt) return true;
        return new Date(item.created_at).getTime() > new Date(savedLastViewedAt).getTime();
      }).length;
      setUnreadNotificationCount(unread);
    }
  } catch (err) {
    console.error("loadNotificationsForUser error:", err);
  } finally {
    setNotificationsLoading(false);
    setNotificationsLoadingMore(false);
  }
}, []);

  // ─── Friends loading ─────────────────────────────────────────────────────────

  const loadFriends = useCallback(async (userId: string) => {
    setFriendsLoading(true);
    try {
      // Accepted friend requests where user is sender or recipient
      const { data: sentAccepted } = await supabase
        .from("friend_requests")
        .select("id, recipient_id, profiles!recipient_id(id, username, avatar_url)")
        .eq("sender_id", userId)
        .eq("status", "accepted");

      const { data: receivedAccepted } = await supabase
        .from("friend_requests")
        .select("id, sender_id, profiles!sender_id(id, username, avatar_url)")
        .eq("recipient_id", userId)
        .eq("status", "accepted");

      const friendList: Friend[] = [
        ...(sentAccepted || []).map((r: any) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return { id: p?.id ?? "", username: p?.username ?? "Unknown", avatar_url: p?.avatar_url ?? null, friendship_id: r.id };
        }),
        ...(receivedAccepted || []).map((r: any) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return { id: p?.id ?? "", username: p?.username ?? "Unknown", avatar_url: p?.avatar_url ?? null, friendship_id: r.id };
        }),
      ].sort((a, b) => a.username.localeCompare(b.username));

      setFriends(friendList);

      // Count pending incoming friend requests for badge
      const { count: pendingCount } = await supabase
        .from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("status", "pending");

      setUnreadFriendRequestCount(pendingCount ?? 0);
    } catch (err) {
      console.error("loadFriends error:", err);
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  // ─── Conversations loading ───────────────────────────────────────────────────

  const loadConversations = useCallback(async (userId: string, page = 0, openConvId?: string) => {
    if (page === 0) setConversationsLoading(true);
    else setConversationsLoadingMore(true);
    try {
      // Fetch enough messages to build CONVERSATIONS_PAGE_SIZE unique conversations.
      // We over-fetch by a multiplier since one person may have many messages.
      const fetchLimit = (page + 1) * CONVERSATIONS_PAGE_SIZE * 10;

      const { data: messages } = await supabase
        .from("direct_messages")
        .select(`
          id, sender_id, recipient_id, content, created_at, read_at,
          sender:profiles!sender_id(id, username, avatar_url),
          recipient:profiles!recipient_id(id, username, avatar_url)
        `)
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .neq("message_type", "mention")
        .order("created_at", { ascending: false })
        .limit(fetchLimit);

      if (!messages?.length) {
        if (page === 0) {
          setConversations([]);
          setUnreadInboxCount(0);
        }
        setHasMoreConversations(false);
        return;
      }

      // Build full conversation map from all fetched messages
      const convMap = new Map<string, Conversation>();
      const unreadByConv = new Map<string, number>();

      for (const msg of messages) {
        const isSender = msg.sender_id === userId;
        const otherId = isSender ? msg.recipient_id : msg.sender_id;
        const otherProfile: any = isSender
          ? (Array.isArray(msg.recipient) ? msg.recipient[0] : msg.recipient)
          : (Array.isArray(msg.sender) ? msg.sender[0] : msg.sender);

        if (!convMap.has(otherId)) {
          const isUnread = !isSender && !msg.read_at;
          convMap.set(otherId, {
            friend_id: otherId,
            friend_username: otherProfile?.username ?? "Unknown",
            friend_avatar_url: otherProfile?.avatar_url ?? null,
            last_message: msg.content,
            last_message_at: msg.created_at,
            unread_count: isUnread ? 1 : 0,
          });
        }

        if (msg.recipient_id === userId && !msg.read_at) {
          unreadByConv.set(msg.sender_id, (unreadByConv.get(msg.sender_id) || 0) + 1);
        }
      }

      const allConvList = Array.from(convMap.values()).map((c) => ({
        ...c,
        unread_count: unreadByConv.get(c.friend_id) || 0,
      }));

      // Paginate the conversation list
      const start = page * CONVERSATIONS_PAGE_SIZE;
      const end = start + CONVERSATIONS_PAGE_SIZE;
      const pageConvs = allConvList.slice(start, end);
      setHasMoreConversations(allConvList.length > end);

      // Zero out all conversations the user has viewed (cleared set) plus the active one
      const activeId = openConvId ?? activeConversationRef.current;
      if (activeId) clearedConversationsRef.current.add(activeId);
      const adjustedConvs = pageConvs.map((c) =>
        clearedConversationsRef.current.has(c.friend_id) ? { ...c, unread_count: 0 } : c
      );
      clearedConversationsRef.current.forEach((id) => unreadByConv.delete(id));

      if (page === 0) {
        setConversations(adjustedConvs);
      } else {
        setConversations((prev) => {
          const existingIds = new Set(prev.map((c) => c.friend_id));
          return [...prev, ...adjustedConvs.filter((c) => !existingIds.has(c.friend_id))];
        });
      }

      // Always compute total unread from all messages regardless of page
      const totalUnreadMessages = Array.from(unreadByConv.values()).reduce((sum, n) => sum + n, 0);
      setUnreadInboxCount(totalUnreadMessages);
    } catch (err) {
      console.error("loadConversations error:", err);
    } finally {
      setConversationsLoading(false);
      setConversationsLoadingMore(false);
    }
  }, []);


  
  async function enrichInviteMessagesWithResponseStatus(
  messages: DirectMessage[],
  userId: string
): Promise<Record<string, "accepted" | "declined">> {
  const responseMap: Record<string, "accepted" | "declined"> = {};

  for (const msg of messages) {
    if (msg.message_type === "board_invite" && msg.recipient_id === userId) {
      const boardId = msg.metadata?.board_id;
      if (!boardId) continue;

      // Check for an explicit accepted response DM for this specific board invite
      const { data: acceptMsg } = await supabase
        .from("direct_messages")
        .select("id")
        .eq("sender_id", userId)
        .eq("recipient_id", msg.sender_id)
        .eq("message_type", "board_invite_accepted")
        .filter("metadata->>board_id", "eq", boardId)
        .maybeSingle();

      if (acceptMsg) {
        responseMap[msg.id] = "accepted";
        continue;
      }

      // Check for an explicit declined response DM for this specific board invite
      const { data: declineMsg } = await supabase
        .from("direct_messages")
        .select("id")
        .eq("sender_id", userId)
        .eq("recipient_id", msg.sender_id)
        .eq("message_type", "board_invite_declined")
        .filter("metadata->>board_id", "eq", boardId)
        .maybeSingle();

      if (declineMsg) {
        responseMap[msg.id] = "declined";
      }
    }
  }
  return responseMap;
}
  // ─── Load conversation messages ──────────────────────────────────────────────

const openConversation = useCallback(async (friendId: string, userId: string) => {
  setActiveConversation(friendId);
  setDmLoading(true);
  setDmPage(0);

  try {
    const { data: messages, error } = await supabase
      .from("direct_messages")
      .select(`id, sender_id, recipient_id, content, message_type, metadata, created_at, read_at, sender:sender_id(id, username, avatar_url)`)
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${userId})`)
      .neq("message_type", "mention")
      .order("created_at", { ascending: false })
      .range(0, DM_PAGE_SIZE - 1);

    if (error) throw error;

    const typedMessages = ((messages as any[]) ?? []).map((msg) => ({
      id: msg.id,
      sender_id: msg.sender_id,
      recipient_id: msg.recipient_id,
      content: msg.content ?? "",
      message_type: (msg.message_type ?? "dm") as DirectMessage["message_type"],
      metadata: msg.metadata ?? null,
      created_at: msg.created_at,
      read_at: msg.read_at,
      sender_username: msg.sender?.username,
      sender_avatar_url: msg.sender?.avatar_url,
    })) as DirectMessage[];

    setMessages(typedMessages.reverse());
    setHasMoreDms(typedMessages.length === DM_PAGE_SIZE);
    setDmPage(1);

    const responseStatuses = await enrichInviteMessagesWithResponseStatus(typedMessages, userId);
    setRespondedInvites((prev) => ({ ...prev, ...responseStatuses }));

    // Track this conversation as cleared so loadConversations always zeroes it
    clearedConversationsRef.current.add(friendId);
    try { localStorage.setItem(`cleared-convos-${userId}`, JSON.stringify([...clearedConversationsRef.current])); } catch {}
    // Always mark the conversation as read in local state immediately —
    // this clears the badge regardless of the read receipts setting
    setConversations((prev) => prev.map((c) =>
      c.friend_id === friendId ? { ...c, unread_count: 0 } : c
    ));
    setUnreadInboxCount((prev) => {
      const conv = conversations.find((c) => c.friend_id === friendId);
      return Math.max(0, prev - (conv?.unread_count ?? 0));
    });

    // Only write read_at to DB if receipts are enabled
    if (readReceiptsEnabledRef.current) {
      supabase.from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", friendId).eq("recipient_id", userId).is("read_at", null)
        .then(() => {});
    }

    await loadConversations(userId);
    // Re-apply the zero after loadConversations refetches from DB —
    // without read_at being written, DB still shows unread so we force-clear
    setConversations((prev) => prev.map((c) =>
      c.friend_id === friendId ? { ...c, unread_count: 0 } : c
    ));

  } catch (err) {
    console.error("openConversation error:", err);
  } finally {
    setDmLoading(false);
  }
}, [loadConversations]);

  // ─── Send DM ─────────────────────────────────────────────────────────────────

  const loadMoreDms = useCallback(async () => {
    if (!profile || !activeConversation || loadingMoreDms || !hasMoreDms) return;
    setLoadingMoreDms(true);
    try {
      const from = dmPage * DM_PAGE_SIZE;
      const to = from + DM_PAGE_SIZE - 1;
      const { data: messages } = await supabase
        .from("direct_messages")
        .select(`id, sender_id, recipient_id, content, message_type, metadata, created_at, read_at, sender:sender_id(id, username, avatar_url)`)
        .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${activeConversation}),and(sender_id.eq.${activeConversation},recipient_id.eq.${profile.id})`)
        .neq("message_type", "mention")
        .order("created_at", { ascending: false })
        .range(from, to);

      const older = ((messages as any[]) ?? []).map((msg) => ({
        id: msg.id,
        sender_id: msg.sender_id,
        recipient_id: msg.recipient_id,
        content: msg.content ?? "",
        message_type: (msg.message_type ?? "dm") as DirectMessage["message_type"],
        metadata: msg.metadata ?? null,
        created_at: msg.created_at,
        read_at: msg.read_at,
        sender_username: msg.sender?.username,
        sender_avatar_url: msg.sender?.avatar_url,
      })) as DirectMessage[];

      setMessages((prev) => [...older.reverse(), ...prev]);
      setHasMoreDms(older.length === DM_PAGE_SIZE);
      setDmPage((p) => p + 1);
    } catch (err) {
      console.error("loadMoreDms error:", err);
    } finally {
      setLoadingMoreDms(false);
    }
  }, [profile, activeConversation, loadingMoreDms, hasMoreDms, dmPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreDms && !loadingMoreDms) {
          loadMoreDms();
        }
      },
      { threshold: 0.1 }
    );
    if (dmTopRef.current) observer.observe(dmTopRef.current);
    return () => observer.disconnect();
  }, [hasMoreDms, loadingMoreDms, dmPage, loadMoreDms]);

  // Keep ref in sync with activeConversation state for use inside subscriptions
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Scroll to bottom when a conversation first finishes loading
  useEffect(() => {
    if (!dmLoading && activeConversation && activeConversationMessages.length > 0) {
      dmBottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [dmLoading, activeConversation]);

  function selectDmImage(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be less than 5MB."); return; }
    setDmImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setDmImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearDmImage() {
    setDmImageFile(null);
    setDmImagePreview(null);
  }

  async function uploadDmImage(file: File): Promise<string | null> {
    if (!profile) return null;
    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `${profile.id}/dm-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error } = await supabase.storage.from("comment-media").upload(filePath, file, { upsert: true, cacheControl: "3600" });
    if (error) throw error;
    return supabase.storage.from("comment-media").getPublicUrl(filePath).data.publicUrl;
  }

  async function sendDm() {
  if (!profile || !activeConversation || (!dmDraft.trim() && !dmImageFile)) return;
  setSendingDm(true);
  const content = dmDraft.trim();
  setDmDraft("");
  const imageFile = dmImageFile;
  clearDmImage();

  const optimisticMsg: DirectMessage = {
    id: `temp-${Date.now()}`,
    sender_id: profile.id,
    recipient_id: activeConversation,
    content: content || " ",
    message_type: imageFile ? "dm_image" : "dm",
    metadata: imageFile ? { image_url: dmImagePreview, image_type: imageFile.type === "image/gif" ? "gif" : "image" } : null,
    created_at: new Date().toISOString(),
    read_at: null,
  };
  setMessages((prev) => [...prev, optimisticMsg]);
  setTimeout(() => dmBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);

  try {
    let imageUrl: string | null = null;
    if (imageFile) {
      setUploadingDmImage(true);
      imageUrl = await uploadDmImage(imageFile);
      setUploadingDmImage(false);
    }

    const { data: newMsg, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: profile.id,
        recipient_id: activeConversation,
        content: content || " ",
        message_type: imageUrl ? "dm_image" : "dm",
        metadata: imageUrl ? { image_url: imageUrl, image_type: imageFile!.type === "image/gif" ? "gif" : "image" } : null,
      })
      .select("id, sender_id, recipient_id, content, message_type, metadata, created_at, read_at")
      .single();
    if (error) throw error;

    if (newMsg) {
      // Track this ID so the realtime handler doesn't append it again
      sentMessageIdsRef.current.add(newMsg.id);
      setMessages((prev) =>
        prev.map((m) => m.id === optimisticMsg.id ? (newMsg as DirectMessage) : m)
      );
    }

    await loadConversations(profile.id);
  } catch (err) {
    setActiveConversationMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    setDmDraft(content);
    if (imageFile) { setDmImageFile(imageFile); setDmImagePreview(URL.createObjectURL(imageFile)); }
    setError(err instanceof Error ? err.message : "Unable to send message.");
  } finally {
    setSendingDm(false);
  }
}

  // ─── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadProfilePage() {
      setLoading(true);
      setError(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const user = authData.user;
        if (!user) {
          router.push("/auth");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, bio, created_at, read_receipts_enabled")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        setProfile(profileData);
        setUsername(profileData.username);
        setBio((profileData.bio || "").slice(0, BIO_LIMIT));
        const receiptsEnabled = profileData.read_receipts_enabled ?? true;
        setReadReceiptsEnabled(receiptsEnabled);
        readReceiptsEnabledRef.current = receiptsEnabled;

        // Load cleared conversations from localStorage
        try {
          const saved = localStorage.getItem(`cleared-convos-${user.id}`);
          if (saved) {
            const ids: string[] = JSON.parse(saved);
            clearedConversationsRef.current = new Set(ids);
          }
        } catch {}

        // Load push notification preference
        if (typeof window !== "undefined" && "Notification" in window) {
          const perm = Notification.permission;
          setPushPermission(perm);
          const saved = localStorage.getItem("push-notifications-enabled");
          const enabled = perm === "granted" && saved === "true";
          setPushEnabled(enabled);
          pushEnabledRef.current = enabled;
        }
const [boardsResult] = await Promise.all([
  loadBoardsForUser(user.id),
  loadFriends(user.id),
  loadConversations(user.id),
]);

setMyBoards(boardsResult.myBoards);
setPublicBoards(boardsResult.publicBoards);
setPublicBoardsPage(1);
setHasMorePublicBoards(boardsResult.hasMore ?? true);

// Fast unread badge count using notifications table
const savedLastViewedAt = localStorage.getItem(`notifications-last-viewed-${user.id}`);
const [{ count: notifCount }, { count: mentionCount }] = await Promise.all([
  savedLastViewedAt
    ? supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id).gt("created_at", savedLastViewedAt)
    : supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id),
  savedLastViewedAt
    ? supabase.from("direct_messages").select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id).eq("message_type", "mention").gt("created_at", savedLastViewedAt)
    : supabase.from("direct_messages").select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id).eq("message_type", "mention"),
]);
setUnreadNotificationCount((notifCount ?? 0) + (mentionCount ?? 0));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }

    loadProfilePage();
  }, [router, loadBoardsForUser, loadNotificationsForUser, loadFriends, loadConversations]);

  // ─── Per-board realtime subscriptions for unread badges ─────────────────────

  useEffect(() => {
    if (!profile?.id || myBoards.length === 0) return;

    const channels = myBoards.map((board) =>
      supabase
        .channel(`board-comments-${board.id}-${profile.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "board_comments",
            filter: `board_id=eq.${board.id}`,
          },
          (payload) => {
            if (payload.new.author_id === profile.id) return; // own comment
            setMyBoards((prev) =>
              prev.map((b) =>
                b.id === board.id ? { ...b, unread_count: b.unread_count + 1 } : b
              )
            );
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [profile?.id, myBoards.map((b) => b.id).join("|")]);

  // ─── Real-time subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications",
          filter: `recipient_id=eq.${profile.id}` },
        async (payload: any) => {
          setUnreadNotificationCount((prev) => prev + 1);
          if (showNotificationsRef.current) await loadNotificationsForUser(profile.id);
          const type = payload.new?.type;
          const notifTitle = type === "like" ? "Someone liked your comment"
            : type === "reply" ? "Someone replied to your comment"
            : "You were mentioned";
          sendPushNotification("Circlx", notifTitle);
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "friend_requests" },
        async (payload: any) => {
          if (payload.new.recipient_id === profile.id) {
            await loadFriends(profile.id);
            sendPushNotification("Circlx", "You have a new friend request!");
          }
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "friend_requests" },
        async (payload) => {
          if (payload.new.sender_id === profile.id || payload.new.recipient_id === profile.id) {
            await loadFriends(profile.id);
          }
        }
      )
      .subscribe((status, err) => {
        console.log("[realtime:channel] status:", status, err ?? "");
      });

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [profile?.id]);

  // Keep pushEnabledRef in sync with state
  useEffect(() => { pushEnabledRef.current = pushEnabled; }, [pushEnabled]);
  // Keep readReceiptsEnabledRef in sync with state
  useEffect(() => { readReceiptsEnabledRef.current = readReceiptsEnabled; }, [readReceiptsEnabled]);

  // ─── DM realtime channel (dedicated, separate from notifications channel) ────

  useEffect(() => {
    if (!profile?.id) return;

    const dmChannel = supabase
      .channel(`direct-messages-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" },
        async (payload) => {
          const isIncoming = payload.new.recipient_id === profile.id;
          const isOutgoing = payload.new.sender_id === profile.id;
          if (!isIncoming && !isOutgoing) return;

          if (isIncoming && payload.new.message_type === "mention") {
            setUnreadNotificationCount((prev) => prev + 1);
            if (showNotificationsRef.current) await loadNotificationsForUser(profile.id);
            return;
          }

          // Skip messages we sent ourselves — sendDm already handles those optimistically
          if (isOutgoing) return;

          const otherId = payload.new.sender_id;

          if (activeConversationRef.current === otherId) {
            // Skip if sentMessageIdsRef already has this (sent by us and fetched back)
            if (sentMessageIdsRef.current.has(payload.new.id)) {
              sentMessageIdsRef.current.delete(payload.new.id);
              return;
            }
            const newMsg: DirectMessage = {
              id: payload.new.id,
              sender_id: payload.new.sender_id,
              recipient_id: payload.new.recipient_id,
              content: payload.new.content ?? "",
              message_type: (payload.new.message_type ?? "dm") as DirectMessage["message_type"],
              metadata: payload.new.metadata ?? null,
              created_at: payload.new.created_at,
              read_at: payload.new.read_at ?? null,
            };
            setMessages((prev) => [...prev, newMsg]);
            setTimeout(() => dmBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
            // Clear unread badge for this conversation immediately — user is looking at it
            clearedConversationsRef.current.add(otherId);
            try { localStorage.setItem(`cleared-convos-${profile.id}`, JSON.stringify([...clearedConversationsRef.current])); } catch {}
            setConversations((prev) => prev.map((c) =>
              c.friend_id === otherId ? { ...c, unread_count: 0 } : c
            ));
            // Only write read_at if the recipient has read receipts enabled
            if (readReceiptsEnabledRef.current) {
              supabase.from("direct_messages")
                .update({ read_at: new Date().toISOString() })
                .eq("id", payload.new.id)
                .then(() => {});
            }
          } else {
            // Message arrived in a different conversation — increment its badge
            // and remove from cleared set so the new message shows as unread
            clearedConversationsRef.current.delete(otherId);
            try { localStorage.setItem(`cleared-convos-${profile.id}`, JSON.stringify([...clearedConversationsRef.current])); } catch {}
            setConversations((prev) => prev.map((c) =>
              c.friend_id === otherId ? { ...c, unread_count: (c.unread_count || 0) + 1 } : c
            ));
            setUnreadInboxCount((prev) => prev + 1);
          }

          sendPushNotification("New message", payload.new.content?.trim() || "You received a new message");
          loadConversations(profile.id);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(dmChannel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ─── Conversations infinite scroll ──────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id || activeConversation) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreConversations && !conversationsLoadingMore) {
          const nextPage = conversationsPageRef.current + 1;
          conversationsPageRef.current = nextPage;
          loadConversations(profile.id, nextPage);
        }
      },
      { threshold: 0.1 }
    );
    if (conversationsLoadMoreRef.current) observer.observe(conversationsLoadMoreRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, activeConversation, hasMoreConversations, conversationsLoadingMore]);

  // ─── Refresh on tab focus ─────────────────────────────────────────────────────
  // Re-fetches boards, conversations, and notification counts whenever the user
  // returns to this tab — catches anything that happened while they were away
  // (e.g. new comments on a board they just visited, new DMs, new notifications).

  useEffect(() => {
    if (!profile?.id) return;

    async function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      const [boardsResult] = await Promise.all([
        loadBoardsForUser(profile!.id),
        loadConversations(profile!.id),
      ]);

      setMyBoards(boardsResult.myBoards);
      setPublicBoards(boardsResult.publicBoards);
      setHasMorePublicBoards(boardsResult.hasMore ?? true);

      // Also refresh notification badge count
      const savedLastViewedAt = localStorage.getItem(`notifications-last-viewed-${profile!.id}`);
      const [{ count: notifCount }, { count: mentionCount }] = await Promise.all([
        savedLastViewedAt
          ? supabase.from("notifications").select("id", { count: "exact", head: true })
              .eq("recipient_id", profile!.id).gt("created_at", savedLastViewedAt)
          : supabase.from("notifications").select("id", { count: "exact", head: true })
              .eq("recipient_id", profile!.id),
        savedLastViewedAt
          ? supabase.from("direct_messages").select("id", { count: "exact", head: true })
              .eq("recipient_id", profile!.id).eq("message_type", "mention").gt("created_at", savedLastViewedAt)
          : supabase.from("direct_messages").select("id", { count: "exact", head: true })
              .eq("recipient_id", profile!.id).eq("message_type", "mention"),
      ]);
      setUnreadNotificationCount((notifCount ?? 0) + (mentionCount ?? 0));
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [profile?.id, loadBoardsForUser, loadConversations]);

  // ─── Memos ───────────────────────────────────────────────────────────────────

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return "—";
    return new Date(profile.created_at).toLocaleDateString([], {
      month: "long", day: "numeric", year: "numeric",
    });
  }, [profile]);

const allTags = useMemo(() => {
  const tagSet = new Set<string>();
  publicBoards.forEach((b) => b.tags?.forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}, [publicBoards]);

const sortedMyBoards = useMemo(() => {
  const byNewest = (a: BoardWithMeta, b: BoardWithMeta) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const pinned = myBoards.filter((b) => pinnedBoardIds.includes(b.id)).sort(byNewest);
  const unpinned = myBoards.filter((b) => !pinnedBoardIds.includes(b.id)).sort(byNewest);
  return [...pinned, ...unpinned];
}, [myBoards, pinnedBoardIds]);

const myBoardsTotalPages = Math.ceil(sortedMyBoards.length / MY_BOARDS_PER_PAGE);
const displayedMyBoards = sortedMyBoards.slice(
  myBoardsPage * MY_BOARDS_PER_PAGE,
  (myBoardsPage + 1) * MY_BOARDS_PER_PAGE
);

const filteredPublicBoards = useMemo(() => {
  const q = searchQuery.trim().toLowerCase();
  return publicBoards.filter((board) => {
    const matchesSearch = !q ||
      board.title.toLowerCase().includes(q) ||
      board.tags?.some((tag) => tag.toLowerCase().includes(q));
    const matchesTag = !selectedTag || board.tags?.includes(selectedTag);
    return matchesSearch && matchesTag;
  });
}, [publicBoards, searchQuery, selectedTag]);

  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.username.toLowerCase().includes(q));
  }, [friends, friendSearch]);

  const totalInboxBadge = unreadInboxCount + unreadFriendRequestCount;

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function togglePin(boardId: string) {
    setPinnedBoardIds((prev) => {
      const next = prev.includes(boardId) ? prev.filter((id) => id !== boardId) : [...prev, boardId];
      localStorage.setItem("pinnedBoardIds", JSON.stringify(next));
      return next;
    });
    setMyBoardsPage(0);
  }


  
  function markNotificationsAsViewed() {
    if (!profile) return;
    const now = new Date().toISOString();
    localStorage.setItem(`notifications-last-viewed-${profile.id}`, now);
    setUnreadNotificationCount(0);
  }



  function addTag(tag: string) {
    const cleaned = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleaned || tags.includes(cleaned) || tags.length >= MAX_TAGS) return;
    setTags((prev) => [...prev, cleaned]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }async function searchUsers(query: string) {
  setUserSearchQuery(query);
  if (!query.trim()) { setUserSearchResults([]); return; }
  setUserSearchLoading(true);
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, bio, created_at")
      .ilike("username", `%${query.trim()}%`)
      .neq("id", profile?.id ?? "")
      .limit(8);
    setUserSearchResults(data ?? []);
  } catch (err) {
    console.error("searchUsers error:", err);
  } finally {
    setUserSearchLoading(false);
  }
}

  async function unfriend(friendshipId: string, friendId: string) {
  const confirmed = window.confirm("Are you sure you want to unfriend this person?");
  if (!confirmed) return;
  setUnfriendingId(friendId);
  try {
    const { error } = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", friendshipId);
    if (error) throw error;
   setFriends((prev) => prev.filter((f) => f.id !== friendId));
if (selectedPublicProfile?.id === friendId) {
  setPublicProfileFriendState("none");
}
toast.success("Unfriended.");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unable to unfriend.");
    toast.error("Unable to unfriend.");
  } finally {
    setUnfriendingId(null);
  }
}

async function openPublicProfile(userId: string) {
  setPublicProfileModalOpen(true);
  setPublicProfileFriendState("none");
  setIsBlockedByMe(false);

  // Fetch full profile from DB so bio and created_at are always accurate
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, bio, created_at")
    .eq("id", userId)
    .single();

  if (data) setSelectedPublicProfile(data);

  const [friendResult, blockResult] = await Promise.all([
    supabase.from("friend_requests").select("id, status")
      .or(`and(sender_id.eq.${profile!.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${profile!.id})`)
      .maybeSingle(),
    supabase.from("blocked_users").select("id")
      .eq("blocker_id", profile!.id).eq("blocked_id", userId)
      .maybeSingle(),
  ]);

  if (friendResult.data) {
    setPublicProfileFriendState(friendResult.data.status === "accepted" ? "friends" : "pending");
  }
  if (blockResult.data) setIsBlockedByMe(true);
}

async function sendPublicFriendRequest(recipientId: string) {
  if (!profile) return;
  setSendingPublicFriendRequest(true);
  try {
    const { error } = await supabase.from("friend_requests").insert({
      sender_id: profile.id,
      recipient_id: recipientId,
    });
    if (error) throw error;
    setPublicProfileFriendState("pending");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unable to send friend request.");
  } finally {
    setSendingPublicFriendRequest(false);
  }
}

  function handleTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  async function saveProfile() {
    if (!profile || !username.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const safeBio = bio.trim().slice(0, BIO_LIMIT);
      const { error } = await supabase
        .from("profiles").update({ username: username.trim(), bio: safeBio }).eq("id", profile.id);
      if (error) throw error;
      setProfile({ ...profile, username: username.trim(), bio: safeBio });
      toast.success("Profile saved!");
      setBio(safeBio);
    } catch (err: any) {
      if (err?.code === "23505" || err?.message?.includes("duplicate") || err?.message?.includes("unique")) {
        toast.error("That username is already taken!");
      } else {
        setError(err instanceof Error ? err.message : "Unable to save profile.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!profile) return;
    if (file.size > 2 * 1024 * 1024) { setError("Image must be less than 2MB."); return; }
    setUploadingAvatar(true);
    setError(null);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const filePath = `${profile.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars")
        .upload(filePath, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const { error: profileError } = await supabase.from("profiles")
        .update({ avatar_url: data.publicUrl }).eq("id", profile.id);
      if (profileError) throw profileError;
      setProfile({ ...profile, avatar_url: data.publicUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function createBoard() {
    if (!profile || !title.trim() || !description.trim()) return;
    setCreating(true);
    setError(null);
    try {
  console.log("profile check:", profile, "title:", title, "description:", description);
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  const cleanTags = [...tags];

  const { data: board, error: boardError } = await supabase
    .from("boards")
    .insert({ creator_id: profile.id, title: cleanTitle, description: cleanDescription, visibility, tags: cleanTags })
    .select("id, title, description, visibility, created_at, creator_id, tags")
    .single();

  console.log("1. board insert:", board, boardError);
  if (boardError) throw boardError;
  if (!board) throw new Error("Board was not created.");

const memberIds = new Set<string>();
memberIds.add(profile.id); // only add the creator — invitees join only after accepting

  const membersToInsert = Array.from(memberIds).map((userId) => ({ board_id: board.id, user_id: userId }));
  const { error: memberError } = await supabase.from("board_members")
    .upsert(membersToInsert, { onConflict: "board_id,user_id", ignoreDuplicates: true });

  console.log("3. member upsert:", memberError);
  if (memberError) throw memberError;

  // Send inbox invite messages
  const invitedUsernames = inviteUsernames ? inviteUsernames.split(",").map((u) => u.trim()).filter(Boolean) : [];
  if (invitedUsernames.length > 0) {
    const { data: invitedProfiles, error: inviteProfilesError } = await supabase
      .from("profiles")
      .select("id")
      .in("username", invitedUsernames);

    console.log("4. invited profiles:", invitedProfiles, inviteProfilesError);

if (invitedProfiles?.length) {
  const { error: dmError } = await supabase.from("direct_messages").insert(
    invitedProfiles.map((u) => ({
      sender_id: profile.id,
      recipient_id: u.id,
      message_type: "board_invite",
      content: "",
      metadata: {
        board_id: board.id,
        board_title: board.title,
        inviter_username: profile.username,
      },
    }))
  );
  console.log("5. dm insert:", dmError);
  if (dmError) throw dmError;

  const { data: invitedProfilesFull } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", invitedUsernames);

  if (invitedProfilesFull?.length) {
    await supabase.from("direct_messages").insert(
      invitedProfilesFull.map((u) => ({
        sender_id: u.id,
        recipient_id: profile.id,
        message_type: "board_invite_sent",
        content: "",
        metadata: {
          board_id: board.id,
          board_title: board.title,
          invitee_username: u.username,
        },
      }))
    );
  }
}
  }

// Reset form and close regardless — board was created successfully
  setTitle(""); setDescription(""); setInviteUsernames(""); setVisibility("public");
  setTags([]); setTagInput(""); setShowCreateBoard(false);
  toast.success("Circle created!");

  // Refresh board lists separately so a refresh failure doesn't mask success
  try {
    const { myBoards: myBoardsData, publicBoards: publicBoardsData, hasMore: hasMoreRefresh } = await loadBoardsForUser(profile.id);
    setMyBoards(myBoardsData);
    setPublicBoards(publicBoardsData);
    setPublicBoardsPage(1);
    setHasMorePublicBoards(hasMoreRefresh ?? true);
  } catch (refreshErr) {
    console.error("Board list refresh failed:", refreshErr);
  }
  } catch (err: any) {
    const supabaseMsg = err?.message || err?.error_description || err?.details || err?.hint;
    const msg = supabaseMsg || (typeof err === "object" ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : String(err));
    console.error("createBoard error:", msg, err);
    setError(msg || "Unable to create Circle.");
  } finally {
      setCreating(false);
    }
  }

  async function joinBoard(boardId: string) {
    if (!profile) return;
    setJoiningBoardId(boardId);
    setError(null);
    try {
      const { error } = await supabase.from("board_members")
        .upsert({ board_id: boardId, user_id: profile.id }, { onConflict: "board_id,user_id" });
      if (error) throw error;
      const { myBoards: myBoardsData, publicBoards: publicBoardsData, hasMore: hasMoreJoin } = await loadBoardsForUser(profile.id);
      setMyBoards(myBoardsData);
      setPublicBoards(publicBoardsData);
      setPublicBoardsPage(1);
      setHasMorePublicBoards(hasMoreJoin ?? true);
      toast.success("Joined Circle!");
    } catch (err: any) {
      setError(err?.message || "Unable to join Cirlce.");
    } finally {
      setJoiningBoardId(null);
    }
  }

  async function deleteBoard(boardId: string) {
    if (!profile) return;
    const confirmed = window.confirm("Delete this board? This will permanently remove all comments, replies, and likes.");
    if (!confirmed) return;
    setDeletingBoardId(boardId);
    setError(null);
    try {
      const { error } = await supabase.from("boards").delete().eq("id", boardId);
      if (error) throw error;
      const { myBoards: myBoardsData, publicBoards: publicBoardsData, hasMore: hasMoreDelete } = await loadBoardsForUser(profile.id);
      setMyBoards(myBoardsData);
      setPublicBoards(publicBoardsData);
      setPublicBoardsPage(1);
      setHasMorePublicBoards(hasMoreDelete ?? true);
      toast.success("Circle deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete Circle.");
    } finally {
      setDeletingBoardId(null);
    }
  }

function markBoardAsSeen(boardId: string) {
  setMyBoards((prev) =>
    prev.map((b) => b.id === boardId ? { ...b, unread_count: 0 } : b)
  );
}

function openBoard(boardId: string, e?: React.MouseEvent<HTMLAnchorElement>, board?: { title: string; description: string }) {
  if (e) e.preventDefault();
  markBoardAsSeen(boardId);
  const params = new URLSearchParams();
  if (board?.title) params.set("title", board.title);
  if (board?.description) params.set("description", board.description);
  const query = params.toString();
  router.push(`/boards/${boardId}${query ? `?${query}` : ""}`);
}

  async function submitReport() {
    if (!profile || !reportTargetId) return;
    setSubmittingReport(true);
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: profile.id,
        reported_user_id: reportTargetId,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      if (error) throw error;
      toast.success("Report submitted. Thank you.");
      setReportModalOpen(false);
      setReportTargetId(null);
      setReportReason("spam");
      setReportDetails("");
    } catch {
      toast.error("Unable to submit report.");
    } finally {
      setSubmittingReport(false);
    }
  }

  async function blockUser(targetId: string) {
    if (!profile) return;
    setBlockLoading(true);
    try {
      await supabase.from("blocked_users").insert({ blocker_id: profile.id, blocked_id: targetId });
      setIsBlockedByMe(true);
      await supabase.from("friend_requests").delete()
        .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${targetId}),and(sender_id.eq.${targetId},recipient_id.eq.${profile.id})`);
      setFriends((prev) => prev.filter((f) => f.id !== targetId));
      setPublicProfileModalOpen(false);
      setSelectedPublicProfile(null);
      toast.success("User blocked.");
    } catch { toast.error("Unable to block user."); }
    finally { setBlockLoading(false); }
  }

  async function unblockUser(targetId: string) {
    if (!profile) return;
    setBlockLoading(true);
    try {
      await supabase.from("blocked_users").delete()
        .eq("blocker_id", profile.id).eq("blocked_id", targetId);
      setIsBlockedByMe(false);
      toast.success("User unblocked.");
    } catch { toast.error("Unable to unblock user."); }
    finally { setBlockLoading(false); }
  }

  async function deleteAccount() {
    if (!profile) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This cannot be undone. All your boards, comments, and messages will be permanently deleted."
    );
    if (!confirmed) return;
    const confirmed2 = window.confirm("Last chance — permanently delete your account?");
    if (!confirmed2) return;
    setDeletingAccount(true);
    try {
      // delete_user() is a SECURITY DEFINER function that deletes auth.users row.
      // Deleting auth.users cascades to profiles via FK, which cascades to all user data.
      const { error } = await supabase.rpc("delete_user");
      if (error) throw error;
      await supabase.auth.signOut();
      router.push("/auth");
    } catch (err) {
      toast.error("Unable to delete account. Please contact support.");
      setDeletingAccount(false);
    }
  }

  async function saveReadReceiptsSetting(enabled: boolean) {
    if (!profile) return;
    setSavingReadReceipts(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ read_receipts_enabled: enabled })
        .eq("id", profile.id);
      if (error) throw error;
      setReadReceiptsEnabled(enabled);
      readReceiptsEnabledRef.current = enabled;
      toast.success(enabled ? "Read receipts enabled." : "Read receipts disabled.");
    } catch {
      toast.error("Unable to save setting.");
    } finally {
      setSavingReadReceipts(false);
    }
  }

  function sendPushNotification(title: string, body: string, icon = "/circlxlogosmall.svg") {
    if (!pushEnabledRef.current) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return; // tab is active — no need
    try {
      new Notification(title, { body, icon });
    } catch {}
  }

  async function requestPushPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Your browser doesn't support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission === "granted") {
      setPushEnabled(true);
      pushEnabledRef.current = true;
      localStorage.setItem("push-notifications-enabled", "true");
      toast.success("Push notifications enabled!");
    } else {
      setPushEnabled(false);
      localStorage.setItem("push-notifications-enabled", "false");
      if (permission === "denied") {
        toast.error("Notifications blocked. Please enable them in your browser settings.");
      }
    }
  }

  function togglePushNotifications() {
    if (!pushEnabled) {
      requestPushPermission();
    } else {
      setPushEnabled(false);
      pushEnabledRef.current = false;
      localStorage.setItem("push-notifications-enabled", "false");
      toast.success("Push notifications disabled.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  async function loadMorePublicBoards() {
    if (loadingMorePublicBoards || !hasMorePublicBoards || !profile) return;
    setLoadingMorePublicBoards(true);
    try {
      const from = publicBoardsPage * PUBLIC_BOARDS_PER_PAGE;
      const to = from + PUBLIC_BOARDS_PER_PAGE - 1;
      const { data } = await supabase
        .from("boards")
        .select("id, title, description, visibility, created_at, creator_id, tags")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .range(from, to);

      const newBoards: BoardWithMeta[] = (data || []).map((board) => ({
        ...board,
        tags: board.tags ?? [],
        member_count: 1,
        unread_count: 0,
        joined: myBoards.some((b) => b.id === board.id),
      }));

      setPublicBoards((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        return [...prev, ...newBoards.filter((b) => !existingIds.has(b.id))];
      });
      setPublicBoardsPage((prev) => prev + 1);
      setHasMorePublicBoards(newBoards.length === PUBLIC_BOARDS_PER_PAGE);
    } catch (err) {
      console.error("loadMorePublicBoards error:", err);
    } finally {
      setLoadingMorePublicBoards(false);
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePublicBoards && !loadingMorePublicBoards) {
          loadMorePublicBoards();
        }
      },
      { threshold: 0.1 }
    );
    if (publicBoardsLoadMoreRef.current) observer.observe(publicBoardsLoadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMorePublicBoards, loadingMorePublicBoards, publicBoardsPage]);

  // ─── Notifications infinite scroll ──────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreNotifications && !notificationsLoadingMore) {
          const nextPage = notificationsPageRef.current + 1;
          notificationsPageRef.current = nextPage;
          loadNotificationsForUser(profile.id, nextPage);
        }
      },
      { threshold: 0.1 }
    );
    if (notificationsLoadMoreRef.current) observer.observe(notificationsLoadMoreRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, hasMoreNotifications, notificationsLoadingMore]);

  // ─── DM message renderer ─────────────────────────────────────────────────────

  function renderDmMessage(msg: DirectMessage) {
    const isMine = msg.sender_id === profile!.id;

    if (msg.message_type === "board_invite_sent") {
      const boardTitle = msg.metadata?.board_title ?? "";
      const inviteeName = msg.metadata?.invitee_username ?? "";
      return (
        <div className="inline-block max-w-[90%] min-h-[44px] rounded-2xl border border-slate-200 p-4 text-sm">
          <p className="font-semibold text-slate-700">Invite sent</p>
          <p className="mt-1 text-slate-500 dark:text-slate-300">
            You sent an invite to <span className="font-medium">@{inviteeName}</span> to join your private board <span className="font-medium">"{boardTitle}"</span>.
          </p>
          <div className="mt-2 text-[10px] text-slate-400">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      );
    }

    if (msg.message_type === "board_invite") {
      const boardId = msg.metadata?.board_id ?? "";
      const boardTitle = msg.metadata?.board_title ?? "";
      const inviterName = msg.metadata?.inviter_username ?? "";
      const response = respondedInvites[msg.id];
      return (
        <div className="inline-block max-w-[90%] min-h-[44px] rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="font-semibold text-slate-900">Circle invite</p>
          <p className="mt-1 text-slate-600">
            <span className="font-medium">@{inviterName}</span> invited you to join the private circle <span className="font-medium">"{boardTitle}"</span>.
          </p>
          {!isMine && (
            response ? (
              <p className={`mt-2 text-xs font-medium ${response === "accepted" ? "text-green-600" : "text-slate-400"}`}>
                {response === "accepted" ? "✓ You joined this Circle." : "✗ You declined this invite."}
              </p>
            ) : (
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="rounded-2xl"
                  onClick={async () => {
                    if (!profile) return;
                    const { error: memberError } = await supabase.from("board_members").upsert(
                      { board_id: boardId, user_id: profile.id },
                      { onConflict: "board_id,user_id" }
                    );
                    if (memberError) { console.error("Failed to join board:", memberError); return; }
                    const { data: boardData } = await supabase.from("boards").select("creator_id, title").eq("id", boardId).single();
                    if (boardData) {
                      await supabase.from("direct_messages").insert({
                        sender_id: profile.id,
                        recipient_id: boardData.creator_id,
                        message_type: "board_invite_accepted",
                        content: "",
                        metadata: { board_id: boardId, board_title: boardTitle, responder_username: profile.username },
                      });
                    }
                    setRespondedInvites((prev) => ({ ...prev, [msg.id]: "accepted" }));
                    const { myBoards: mb, publicBoards: pb } = await loadBoardsForUser(profile.id);
                    setMyBoards([...mb]);
                    setPublicBoards([...pb]);
                    await loadConversations(profile.id);
                  }}
                >Accept</Button>
                <Button size="sm" variant="outline" className="rounded-2xl"
                  onClick={async () => {
                    if (!profile) return;
                    const { data: boardData } = await supabase.from("boards").select("creator_id").eq("id", boardId).single();
                    if (boardData) {
                      await supabase.from("direct_messages").insert({
                        sender_id: profile.id,
                        recipient_id: boardData.creator_id,
                        message_type: "board_invite_declined",
                        content: "",
                        metadata: { board_id: boardId, board_title: boardTitle, responder_username: profile.username },
                      });
                    }
                    setRespondedInvites((prev) => ({ ...prev, [msg.id]: "declined" }));
                    await loadConversations(profile.id);
                  }}
                >Decline</Button>
              </div>
            )
          )}
          <div className="mt-2 text-[10px] text-blue-400">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      );
    }

    if (msg.message_type === "board_invite_accepted") {
      const boardTitle = msg.metadata?.board_title ?? "";
      const responderName = msg.metadata?.responder_username ?? "";
      return (
        <div className="inline-block max-w-[90%] min-h-[44px] rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">Invite accepted ✓</p>
          <p className="mt-1 text-green-700">
            <span className="font-medium">@{responderName}</span> accepted your invite and joined <span className="font-medium">"{boardTitle}"</span>.
          </p>
          <div className="mt-2 text-[10px] text-green-400">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      );
    }

    if (msg.message_type === "board_invite_declined") {
      const boardTitle = msg.metadata?.board_title ?? "";
      const responderName = msg.metadata?.responder_username ?? "";
      return (
        <div className="inline-block max-w-[90%] min-h-[44px] rounded-2xl border border-slate-200 p-4 text-sm">
          <p className="font-semibold text-slate-600">Invite declined</p>
          <p className="mt-1 text-slate-500 dark:text-slate-300">
            <span className="font-medium">@{responderName}</span> declined your invite to <span className="font-medium">"{boardTitle}"</span>.
          </p>
          <div className="mt-2 text-[10px] text-slate-400">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      );
    }

    // Regular DM or DM with image
    const myMessages = activeConversationMessages.filter((m) => m.sender_id === profile!.id);
    const isLastSent = myMessages.length > 0 && myMessages[myMessages.length - 1].id === msg.id;
    const showSeen = isMine && isLastSent && readReceiptsEnabled && !!msg.read_at;
    const seenAt = msg.read_at ? new Date(msg.read_at) : null;
    const diffMs = seenAt ? Date.now() - seenAt.getTime() : 0;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const seenLabel = diffMins < 1 ? "just now"
      : diffMins < 60 ? `${diffMins}m ago`
      : diffHours < 24 ? `${diffHours}h ago`
      : diffDays === 1 ? "yesterday"
      : `${diffDays}d ago`;

    return (
      <div className={`inline-block max-w-[90%] ${isMine ? "text-right" : "text-left"}`}>
        <div className={`inline-block min-h-[44px] rounded-2xl p-4 text-sm ${isMine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"}`}>
          {msg.metadata?.image_url && (
            <img
              src={msg.metadata.image_url}
              alt="shared image"
              className="mb-2 max-h-48 max-w-full rounded-xl object-contain cursor-pointer"
              onClick={() => msg.metadata?.image_url && setDmLightboxUrl(msg.metadata.image_url)}
            />
          )}
          {msg.content?.trim() && <p className="text-left leading-snug [overflow-wrap:anywhere]">{msg.content.trim()}</p>}
          <div className={`text-[10px] text-slate-400 ${msg.content?.trim() || msg.metadata?.image_url ? "mt-1" : ""}`}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        {showSeen && <p className="mt-0.5 text-right text-[10px] text-slate-400">Seen {seenLabel}</p>}
      </div>
    );
  }

  // ─── Loading skeleton ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-300" />
      </div>
    );
  }

  // ─── Active conversation friend lookup ───────────────────────────────────────

  const activeConvFriend = activeConversation
  ? (friends.find((f) => f.id === activeConversation) ?? (() => {
      const conv = conversations.find((c) => c.friend_id === activeConversation);
      return conv ? { id: activeConversation, username: conv.friend_username, avatar_url: conv.friend_avatar_url ?? null } : null;
    })())
  : null;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen  p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
  <img src="/circlxlogo.svg" alt="Circlx" className="h-25 w-25 block dark:hidden" />
<img src="/circlxlogodark.svg" alt="Circlx" className="h-25 w-25 hidden dark:block" />
  <p className="text-sm text-slate-500 dark:text-slate-400">Manage your identity and Circlx from here.</p>
</div>
          <div className="relative flex items-center gap-2">

            {/* Desktop nav — hidden on small screens */}
            <div className="hidden sm:flex items-center gap-2">
              {/* Boards button */}
              <Button
                variant={!showInbox && !showNotifications && !showSettings ? "default" : "ghost"}
                onClick={() => { setShowInbox(false); setShowNotifications(false); setShowSettings(false); setActiveConversation(null); }}
                className="rounded-2xl"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill={"currentColor"} viewBox={"0 0 24 24"} className="mr-2"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8"/></svg>
                Circlx
              </Button>

              <Button variant={showInbox ? "default" : "ghost"} onClick={() => { const next = !showInbox; setShowInbox(next); setShowNotifications(false); setShowSettings(false); setActiveConversation(null); if (next && profile?.id) { conversationsPageRef.current = 0; loadConversations(profile.id, 0); } }} className="relative rounded-2xl">
                <Inbox className="mr-2 h-4 w-4" />Inbox
                {totalInboxBadge > 0 && <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">{totalInboxBadge > 99 ? "99+" : totalInboxBadge}</span>}
              </Button>

              <Button variant={showNotifications ? "default" : "ghost"} onClick={async () => { const next = !showNotifications; setShowNotifications(next); showNotificationsRef.current = next; setShowInbox(false); setShowSettings(false); setActiveConversation(null); if (next && profile?.id) { const prevLastViewed = localStorage.getItem(`notifications-last-viewed-${profile.id}`); setNotificationsLastViewedAt(prevLastViewed); notificationsPageRef.current = 0; await loadNotificationsForUser(profile.id, 0); markNotificationsAsViewed(); } }} className="relative rounded-2xl">
                <Bell className="mr-2 h-4 w-4" />Notifications
                {unreadNotificationCount > 0 && <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
              </Button>

              <Button variant={showSettings ? "default" : "ghost"} onClick={() => { setShowSettings((prev) => !prev); setShowInbox(false); setShowNotifications(false); setActiveConversation(null); }} className="rounded-2xl">
                <Settings className="mr-2 h-4 w-4" />Settings
              </Button>
              <ThemeToggle />
              <Button variant="ghost" onClick={signOut} className="rounded-2xl">
                <LogOut className="mr-2 h-4 w-4" />Sign out
              </Button>
            </div>

            {/* Mobile hamburger — shown on small screens */}
            <div className="flex items-center gap-2 sm:hidden">
              {/* Badge indicators visible even when menu is closed */}
              {totalInboxBadge > 0 && (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">{totalInboxBadge > 99 ? "99+" : totalInboxBadge}</span>
              )}
              {unreadNotificationCount > 0 && (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>
              )}
              <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => setShowMobileMenu((prev) => !prev)}>
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            {/* Mobile dropdown menu */}
            {showMobileMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 shadow-lg sm:hidden">
                <button type="button" className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${showMobileProfile ? "font-semibold" : ""}`}
                  onClick={() => { setShowMobileProfile(true); setShowInbox(false); setShowNotifications(false); setShowSettings(false); setActiveConversation(null); setShowMobileMenu(false); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>Profile
                </button>
                <div className="border-t border-slate-100 dark:border-slate-700" />
                <button type="button" className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${!showInbox && !showNotifications && !showSettings && !showMobileProfile ? "font-semibold" : ""}`}
                  onClick={() => { setShowInbox(false); setShowNotifications(false); setShowSettings(false); setShowMobileProfile(false); setActiveConversation(null); setShowMobileMenu(false); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8"/></svg>
                  Circlx
                </button>
                <button type="button" className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${showInbox ? "font-semibold" : ""}`}
                  onClick={() => { const next = !showInbox; setShowInbox(next); setShowNotifications(false); setShowSettings(false); setShowMobileProfile(false); setActiveConversation(null); if (next && profile?.id) { conversationsPageRef.current = 0; loadConversations(profile.id, 0); } setShowMobileMenu(false); }}>
                  <span className="flex items-center gap-3"><Inbox className="h-4 w-4" />Inbox</span>
                  {totalInboxBadge > 0 && <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">{totalInboxBadge > 99 ? "99+" : totalInboxBadge}</span>}
                </button>
                <button type="button" className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${showNotifications ? "font-semibold" : ""}`}
                  onClick={async () => { const next = !showNotifications; setShowNotifications(next); showNotificationsRef.current = next; setShowInbox(false); setShowSettings(false); setShowMobileProfile(false); setActiveConversation(null); if (next && profile?.id) { const prevLastViewed = localStorage.getItem(`notifications-last-viewed-${profile.id}`); setNotificationsLastViewedAt(prevLastViewed); notificationsPageRef.current = 0; await loadNotificationsForUser(profile.id, 0); markNotificationsAsViewed(); } setShowMobileMenu(false); }}>
                  <span className="flex items-center gap-3"><Bell className="h-4 w-4" />Notifications</span>
                  {unreadNotificationCount > 0 && <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
                </button>
                <button type="button" className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${showSettings ? "font-semibold" : ""}`}
                  onClick={() => { setShowSettings((prev) => !prev); setShowInbox(false); setShowNotifications(false); setShowMobileProfile(false); setActiveConversation(null); setShowMobileMenu(false); }}>
                  <Settings className="h-4 w-4" />Settings
                </button>
                <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
                  <ThemeToggle />
                  <button type="button" onClick={() => { signOut(); setShowMobileMenu(false); }} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900">
                    <LogOut className="h-4 w-4" />Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
{/* User search */}
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search users by username..."
            value={userSearchQuery}
            onChange={(e) => searchUsers(e.target.value)}
            className="pl-9 rounded-2xl"
          />
          {userSearchQuery && (
            <button
              type="button"
              onClick={() => { setUserSearchQuery(""); setUserSearchResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {(userSearchResults.length > 0 || userSearchLoading) && userSearchQuery && (
            <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 shadow-lg">
              {userSearchLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              ) : userSearchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-400">No users found.</div>
              ) : (
                userSearchResults.map((u: {id: string; username: string; avatar_url: string | null; bio: string | null; created_at: string}) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      openPublicProfile(u.id);
                      setUserSearchQuery("");
                      setUserSearchResults([]);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition"
                  >
                    <Avatar className="h-8 w-8 shrink-0 overflow-hidden">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.username} className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback>{initials(u.username)}</AvatarFallback>
                      )}
                    </Avatar>
                    <span className="font-medium text-slate-900">@{u.username}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        {profile && (
          <div>
          {/* Mobile profile view */}
          {showMobileProfile && (
            <div className="block sm:hidden mb-6">
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader><CardTitle>Account</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col items-center rounded-2xl bg-slate-100 dark:bg-zinc-900 p-6 text-center">
                    <div className="relative">
                      <Avatar className="h-20 w-20 overflow-hidden">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
                        ) : (
                          <AvatarFallback>{initials(profile.username)}</AvatarFallback>
                        )}
                      </Avatar>
                      <label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-slate-800 p-1.5 text-white hover:bg-slate-600">
                        {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
                      </label>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">@{profile.username}</p>
                    <p className="mt-0.5 text-xs text-slate-400">Member since {new Date(profile.created_at).toLocaleDateString([], { month: "long", year: "numeric" })}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username</label>
                    <Input value={username} onChange={(e) => setUsername(e.target.value.slice(0, 30))} className="rounded-2xl" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Short bio</label>
                    <Input value={bio} onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))} className="rounded-2xl" />
                    <div className="text-right text-xs text-slate-400">{bio.length}/{BIO_LIMIT}</div>
                  </div>
                  <Button onClick={saveProfile} disabled={saving} className="w-full rounded-2xl">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">

            {/* Profile Card — hidden on mobile, use hamburger Profile tab instead */}
            <Card className="hidden sm:block rounded-3xl border-0 shadow-sm h-fit">
              <CardHeader><CardTitle>Account</CardTitle></CardHeader>
              <CardContent className="space-y-4">
<div className="flex flex-col items-center rounded-2xl bg-slate-100 dark:bg-zinc-900 p-6 text-center">
                    <div className="relative">
                    <Avatar className="h-20 w-20 overflow-hidden">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback>{initials(profile.username)}</AvatarFallback>
                      )}
                    </Avatar>
                    <label className="absolute -bottom-2 -right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white shadow-sm">
                      {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAvatar(file); }} />
                    </label>
                  </div>
                  <p className="mt-3 text-lg font-semibold">{profile.username}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Member since {memberSince}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Username</label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Short bio</label>
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))}
                    maxLength={BIO_LIMIT}
                    placeholder="Tell people a little about yourself"
                    className="min-h-[100px] rounded-2xl"
                  />
                  <div className="text-right text-xs text-slate-400">{bio.length}/{BIO_LIMIT}</div>
                </div>

                <Button onClick={saveProfile} disabled={saving} className="w-full rounded-2xl">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save profile
                </Button>
              </CardContent>
            </Card>

            {/* Main Content */}
            <div className="space-y-6">

              {/* ── INBOX ── */}
              {showInbox ? (
              <Card className="rounded-3xl border-0 shadow-sm w-full max-w-2xl">
  <CardHeader>
    <CardTitle>Inbox</CardTitle>
                    {/* Tab switcher */}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant={inboxTab === "messages" ? "default" : "outline"}
                        className="relative rounded-2xl"
                        onClick={() => { setInboxTab("messages"); setActiveConversation(null); }}
                      >
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Messages
                        {unreadInboxCount > 0 && (
                          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[10px] font-medium text-white">
                            {unreadInboxCount}
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant={inboxTab === "friends" ? "default" : "outline"}
                        className="relative rounded-2xl"
                        onClick={() => { setInboxTab("friends"); setActiveConversation(null); }}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Friends {friends.length > 0 && <span className="ml-1 text-xs opacity-70">({friends.length})</span>}
                        {unreadFriendRequestCount > 0 && (
                          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[10px] font-medium text-white">
                            {unreadFriendRequestCount}
                          </span>
                        )}
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">

                    {/* ── MESSAGES TAB ── */}
                    {inboxTab === "messages" && (
                      <>
                        {/* Conversation thread view */}
                        {activeConversation ? (
                          <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3 pb-3">
  <button
    type="button"
    onClick={() => setActiveConversation(null)}
    className="text-sm text-slate-500 dark:text-slate-300 hover:text-slate-900"
  >
    ←
  </button>
  {(() => {
    const conv = conversations.find((c) => c.friend_id === activeConversation);
    const friend = friends.find((f) => f.id === activeConversation);
    const avatarUrl = friend?.avatar_url ?? conv?.friend_avatar_url ?? null;
    const name = friend?.username ?? conv?.friend_username ?? "Unknown";
    return (
      <>
     <button
  type="button"
  onClick={() => {
    if (activeConversation) openPublicProfile(activeConversation);
  }}
  className="shrink-0"
>
  <Avatar className="h-9 w-9 overflow-hidden cursor-pointer transition hover:scale-105">
    {avatarUrl ? (
      <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
    ) : (
      <AvatarFallback>{initials(name)}</AvatarFallback>
    )}
  </Avatar>
</button>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">{name}</p>
      </>
    );
  })()}
</div>

                            {/* Messages */}
                            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-200  p-4">
                              <div ref={dmTopRef} className="h-1 shrink-0">
                                {loadingMoreDms && (
                                  <div className="flex justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                  </div>
                                )}
                              </div>
                              {dmLoading ? (
                                <div className="flex items-center justify-center py-8">
                                  <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-300" />
                                </div>
                              ) : activeConversationMessages.length === 0 ? (
                                <p className="py-8 text-center text-sm text-slate-400">No messages yet. Say hello!</p>
                              ) : (
                                activeConversationMessages.map((msg) => {
                                  const isMine = msg.sender_id === profile.id;
                                  return (
                                    <div key={msg.id} className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}>
                                      {renderDmMessage(msg)}
                                    </div>
                                  );
                                })
                              )}
                                                            <div ref={dmBottomRef} className="h-0 shrink-0" />
                            </div>

                            {/* DM composer */}
                            <div className="space-y-2">
                              {dmImagePreview && (
                                <div className="relative inline-block">
                                  <img src={dmImagePreview} alt="preview" className="max-h-24 rounded-xl object-contain border border-slate-200" />
                                  <button
                                    type="button"
                                    onClick={clearDmImage}
                                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-900"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 px-3 text-slate-500 hover:text-slate-800 transition dark:border-slate-700 dark:text-slate-400">
                                  <ImagePlus className="h-4 w-4" />
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) selectDmImage(f); e.target.value = ""; }}
                                  />
                                </label>
                                <Input
                                  placeholder="Write a message..."
                                  value={dmDraft}
                                  onChange={(e) => setDmDraft(e.target.value.slice(0, 1000))}
                                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDm(); } }}
                                  className="rounded-2xl"
                                />
                                <Button onClick={sendDm} disabled={sendingDm || uploadingDmImage || (!dmDraft.trim() && !dmImageFile)} className="rounded-2xl px-4">
                                  {sendingDm || uploadingDmImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Conversation list */
                          <>
                            {conversationsLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-300" />
                              </div>
                            ) : conversations.length === 0 ? (
                              <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-500 dark:text-slate-700">
                                No messages yet. Message a friend from your friends list!
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {conversations.map((conv) => (
                                  <button
                                    key={conv.friend_id}
                                    type="button"
                                    onClick={() => openConversation(conv.friend_id, profile.id)}
                                    className="flex h-[64px] w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                  >
                                    <div className="min-w-0 flex-1 overflow-hidden">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{conv.friend_username}</p>
                                        <span className="shrink-0 text-xs text-slate-400">
                                          {new Date(conv.last_message_at).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <p className="truncate text-xs text-slate-500 dark:text-slate-300">{conv.last_message}</p>
                                    </div>
                                    {conv.unread_count > 0 && (
                                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">
                                        {conv.unread_count}
                                      </span>
                                    )}
                                  </button>
                                ))}
                                <div ref={conversationsLoadMoreRef} className="py-1 text-center">
                                  {conversationsLoadingMore && (
                                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-400">
                                      <Loader2 className="h-4 w-4 animate-spin" /> Loading more...
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {/* ── FRIENDS TAB ── */}
                    {inboxTab === "friends" && (
                      <>
                      {/* Pending incoming friend requests */}
{unreadFriendRequestCount > 0 && (
  <PendingFriendRequests
    userId={profile.id}
    onAccept={() => { loadFriends(profile.id); loadConversations(profile.id); }}
  />
)}
                        {/* Search */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            placeholder="Search friends by username..."
                            value={friendSearch}
                            onChange={(e) => setFriendSearch(e.target.value)}
                            className="pl-9 rounded-2xl"
                          />
                          {friendSearch && (
                            <button type="button" onClick={() => setFriendSearch("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        {friendsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-300" />
                          </div>
                        ) : filteredFriends.length === 0 ? (
                          <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-500 dark:text-slate-700">
                            {friendSearch ? `No friends found for "${friendSearch}".` : "No friends yet. Add friends from any board's user profile popup!"}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {filteredFriends.map((friend) => (
                              <div key={friend.id} className="flex items-center gap-3 rounded-2xl border border-slate-200  p-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    openPublicProfile(friend.id);
                                    setPublicProfileFriendState("friends");
                                  }}
                                  className="shrink-0"
                                >
                                  <Avatar className="h-10 w-10 overflow-hidden transition hover:scale-105 cursor-pointer">
                                    {friend.avatar_url ? (
                                      <img src={friend.avatar_url} alt={friend.username} className="h-full w-full object-cover" />
                                    ) : (
                                      <AvatarFallback>{initials(friend.username)}</AvatarFallback>
                                    )}
                                  </Avatar>
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <UserCheck className="h-3.5 w-3.5 shrink-0 text-green-500" />
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{friend.username}</p>
                                  </div>
                                </div>
                            <Button
  size="sm"
  variant="outline"
  className="shrink-0 rounded-2xl"
  onClick={() => {
    setInboxTab("messages");
    openConversation(friend.id, profile.id);
  }}
>
  <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
  Message
</Button>
<Button
  size="sm"
  variant="ghost"
  className="shrink-0 rounded-2xl text-red-500 hover:bg-red-50 hover:text-red-600"
  onClick={() => unfriend(friend.friendship_id, friend.id)}
  disabled={unfriendingId === friend.id}
>
  {unfriendingId === friend.id ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    <UserX className="h-3.5 w-3.5" />
  )}
</Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                  </CardContent>
                </Card>

              ) : showNotifications ? (

                /* ── NOTIFICATIONS ── */
                <Card className="rounded-3xl border-0 shadow-sm w-full max-w-2xl">
                  <CardHeader><CardTitle>Notification Center</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {notificationsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-300" />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-500 dark:text-slate-700">No notifications yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {notifications.map((notification) => {
                          const isNew = notificationsLastViewedAt
                            ? new Date(notification.created_at).getTime() > new Date(notificationsLastViewedAt).getTime()
                            : true;

                          // Build like actor label
                          const actors = notification.like_actors ?? [];
                          const likeLabel = (() => {
                            if (actors.length === 0) return `${notification.actor_username} liked your comment`;
                            if (actors.length === 1) return `${actors[0].username} liked your comment`;
                            if (actors.length === 2) return `${actors[0].username} and ${actors[1].username} liked your comment`;
                            return `${actors[0].username} and ${actors.length - 1} others liked your comment`;
                          })();

                          return (
                          <Link
                            key={notification.id}
                            href={`/boards/${notification.board_id}#comment-${notification.target_comment_id}`}
                            className={`block rounded-2xl border p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                              isNew
                                ? "border-blue-400 shadow-[0_0_0_2px_rgba(96,165,250,0.4)] dark:border-blue-500"
                                : "border-slate-200 dark:border-stone-600"
                            }`}
                            onClick={markNotificationsAsViewed}
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative shrink-0">
                                <Avatar className="h-10 w-10 overflow-hidden">
                                  {notification.actor_avatar_url ? (
                                    <img src={notification.actor_avatar_url} alt={notification.actor_username} className="h-full w-full object-cover" />
                                  ) : (
                                    <AvatarFallback>{initials(notification.actor_username)}</AvatarFallback>
                                  )}
                                </Avatar>
                                {actors.length > 1 && (
                                  <Avatar className="absolute -bottom-1 -right-1 h-5 w-5 overflow-hidden ring-2 ring-white dark:ring-slate-900">
                                    {actors[1].avatar_url ? (
                                      <img src={actors[1].avatar_url} alt={actors[1].username} className="h-full w-full object-cover" />
                                    ) : (
                                      <AvatarFallback className="text-[8px]">{initials(actors[1].username)}</AvatarFallback>
                                    )}
                                  </Avatar>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                                    {notification.type === "like"
                                      ? likeLabel
                                      : notification.type === "mention"
                                      ? `${notification.actor_username} mentioned you in a comment`
                                      : `${notification.actor_username} replied to your comment`}
                                  </p>
                                  <span className="shrink-0 text-xs text-slate-400">
                                    {new Date(notification.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 dark:text-white">In {notification.board_title}</p>
                                <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-200">
                                  <span className="font-medium text-slate-700 dark:text-slate-400">Your comment:</span>{" "}
                                  {notification.original_comment_snippet}
                                </p>
                                {notification.type === "reply" && notification.reply_snippet && (
                                  <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Reply:</span>{" "}
                                    {notification.reply_snippet}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Link>
                          );
                        })}
                        <div ref={notificationsLoadMoreRef} className="py-2 text-center">
                          {notificationsLoadingMore && (
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading more...
                            </div>
                          )}
                          {!hasMoreNotifications && notifications.length >= 20 && (
                            <p className="text-xs text-slate-400">You've seen all notifications.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

              ) : showSettings ? (

                /* ── SETTINGS ── */
                <Card className="rounded-3xl border-0 shadow-sm w-full max-w-2xl">
                  <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                    {/* Push notifications */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Browser notifications</h3>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {pushPermission === "denied"
                              ? "Notifications are blocked in your browser settings."
                              : "Get notified about new messages, likes, and replies even when the tab is in the background."}
                          </p>
                        </div>
                        {pushPermission === "denied" ? (
                          <span className="shrink-0 text-xs text-red-400">Blocked</span>
                        ) : (
                          <button
                            type="button"
                            onClick={togglePushNotifications}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${pushEnabled ? "bg-slate-900 dark:bg-blue-900" : "bg-slate-200 dark:bg-slate-700"}`}
                            role="switch"
                            aria-checked={pushEnabled}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${pushEnabled ? "translate-x-5" : "translate-x-0"}`} />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Read receipts */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Read receipts</h3>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Show others when you've read their messages, and see when they've read yours.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={savingReadReceipts}
                          onClick={() => saveReadReceiptsSetting(!readReceiptsEnabled)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${readReceiptsEnabled ? "bg-slate-900 dark:bg-blue-900" : "bg-slate-200 dark:bg-slate-700"}`}
                          role="switch"
                          aria-checked={readReceiptsEnabled}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${readReceiptsEnabled ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>
                    {/* Danger zone */}
                    <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-5">
                      <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Danger Zone</h3>
                      <p className="text-xs text-red-600 dark:text-red-400 mb-4">
                        Permanently delete your account and all associated data — boards, comments, messages, and friendships. This cannot be undone.
                      </p>
                      <Button
                        variant="destructive"
                        className="rounded-2xl"
                        disabled={deletingAccount}
                        onClick={deleteAccount}
                      >
                        {deletingAccount ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</> : "Delete my account"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

              ) : (

                /* ── BOARDS ── */
                <>
                  {/* My Boards */}
                  <Card className="rounded-3xl border-0 shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>My Circlx</CardTitle>
                        <Button onClick={() => setShowCreateBoard((prev) => !prev)} className="rounded-2xl">
                          + Circle
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {showCreateBoard && (
                        <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                          <div className="relative">
                            <Input
                              placeholder="Circle title"
                              value={title}
                              maxLength={BOARD_TITLE_LIMIT}
                              onChange={(e) => setTitle(e.target.value.slice(0, BOARD_TITLE_LIMIT))}
                            />
                            {title.length >= BOARD_TITLE_WARN && (
                              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs tabular-nums ${title.length >= BOARD_TITLE_LIMIT ? "text-red-500" : "text-slate-400"}`}>
                                {BOARD_TITLE_LIMIT - title.length}
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <Input
                              placeholder="Short description"
                              value={description}
                              maxLength={BOARD_DESC_LIMIT}
                              onChange={(e) => setDescription(e.target.value.slice(0, BOARD_DESC_LIMIT))}
                            />
                            {description.length >= BOARD_DESC_WARN && (
                              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs tabular-nums ${description.length >= BOARD_DESC_LIMIT ? "text-red-500" : "text-slate-400"}`}>
                                {BOARD_DESC_LIMIT - description.length}
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                              Tags <span className="text-xs font-normal text-slate-400">(up to {MAX_TAGS})</span>
                            </label>
                            {tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {tags.map((tag) => (
                                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs text-white">
                                    #{tag}
                                    <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 hover:text-slate-300">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            {tags.length < MAX_TAGS && (
                              <Input placeholder="Type a tag and press Enter..." value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagInputKeyDown} />
                            )}
                            {tags.length < MAX_TAGS && (
                              <div className="flex flex-wrap gap-1.5">
                                {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
                                  <button key={tag} type="button" onClick={() => addTag(tag)}
                                    className="rounded-full border border-slate-200  px-2.5 py-1 text-xs text-slate-600 hover:border-slate-400 hover: transition">
                                    #{tag}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant={visibility === "public" ? "default" : "outline"} onClick={() => setVisibility("public")} className="rounded-2xl">Public</Button>
                            <Button type="button" variant={visibility === "private" ? "default" : "outline"} onClick={() => setVisibility("private")} className="rounded-2xl">Private</Button>
                          </div>
                        {visibility === "private" && (
  <FriendInvitePicker
    friends={friends}
    selected={inviteUsernames}
    onChange={setInviteUsernames}
  />
)}
                          <div className="flex gap-2">
                            <Button onClick={createBoard} disabled={creating || !title.trim() || !description.trim()} className="rounded-2xl">
                              {creating ? "Creating..." : "Create Circle"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowCreateBoard(false)} className="rounded-2xl">Cancel</Button>
                          </div>
                        </div>
                      )}
                      {myBoards.length === 0 ? (
                        <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-500 dark:text-slate-700">
                          You haven't joined or created any Circlx yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {displayedMyBoards.map((board) => (
                            <div key={board.id} className="rounded-2xl border border-slate-200  p-4 transition dark:border-stone-600 hover:shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <Link
  href={`/boards/${board.id}`}
  className="min-w-0 flex-1"
  onClick={(e) => openBoard(board.id, e, board)}
>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-medium text-slate-900 dark:text-white">{board.title}</p>
                                      {pinnedBoardIds.includes(board.id) && (
                                        <Pin className="h-3 w-3 fill-slate-500 text-slate-500 shrink-0" />
                                      )}
                                      {board.unread_count > 0 && (
                                        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-medium text-white">
                                          {board.unread_count > 99 ? "99+" : board.unread_count}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{board.description}</p>
                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                      <Badge variant={board.visibility === "public" ? "secondary" : "outline"} className="capitalize">
                                        {board.visibility}
                                      </Badge>
                                      <div className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300">
                                        <Users className="h-3.5 w-3.5" />
                                        {board.member_count}
                                      </div>
                                      <span className="text-xs text-slate-400">{new Date(board.created_at).toLocaleString()}</span>
                                    </div>
                                    {board.tags?.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {board.tags.map((tag) => (
                                         <span key={tag} className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-100">#{tag}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                                <div className="flex shrink-0 flex-col items-center gap-1 mt-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`rounded-2xl ${pinnedBoardIds.includes(board.id) ? "text-slate-700 dark:text-slate-200" : "text-slate-400 hover:text-slate-600"}`}
                                    title={pinnedBoardIds.includes(board.id) ? "Unpin" : "Pin to top"}
                                    onClick={() => togglePin(board.id)}
                                  >
                                    <Pin className={`h-4 w-4 ${pinnedBoardIds.includes(board.id) ? "fill-current" : ""}`} />
                                  </Button>
                                  {board.creator_id === profile.id && (
                                    <Button variant="ghost" size="icon"
                                      className="rounded-2xl text-red-600 hover:bg-red-50 hover:text-red-700"
                                      onClick={() => deleteBoard(board.id)} disabled={deletingBoardId === board.id}>
                                      {deletingBoardId === board.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {myBoardsTotalPages > 1 && (
                            <div className="flex items-center justify-between pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-2xl"
                                disabled={myBoardsPage === 0}
                                onClick={() => setMyBoardsPage((p) => p - 1)}
                              >
                                ← Prev
                              </Button>
                              <span className="text-xs text-slate-400">
                                {myBoardsPage + 1} / {myBoardsTotalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-2xl"
                                disabled={myBoardsPage >= myBoardsTotalPages - 1}
                                onClick={() => setMyBoardsPage((p) => p + 1)}
                              >
                                Next →
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Public Boards */}
                <Card className="rounded-3xl border-0 shadow-sm">
  <CardHeader>
    <div className="flex items-center justify-between gap-3">
      <CardTitle>Public Circlx</CardTitle>
      {selectedTag && (
        <button
          type="button"
          onClick={() => setSelectedTag(null)}
          className="flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700 transition"
        >
          #{selectedTag} <X className="h-3 w-3" />
        </button>
      )}
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {allTags.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              selectedTag === tag
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            #{tag}
          </button>
        ))}
      </div>
    )}
    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input placeholder="Search by title or tag..." value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 rounded-2xl" />
                        {searchQuery && (
                          <button type="button" onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {filteredPublicBoards.length === 0 ? (
                        <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-500 dark:text-slate-300">
                          {searchQuery ? `No boards found for "${searchQuery}".` : "No public boards yet."}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredPublicBoards.map((board) => (
                            <div key={board.id} className="rounded-2xl border border-slate-200  p-4 transition dark:border-stone-600 hover:shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <Link
  href={`/boards/${board.id}`}
  className="min-w-0 flex-1"
  onClick={(e) => openBoard(board.id, e, board)}
>
                                  <div>
                                    <p className="font-medium text-slate-900 dark:text-white">{board.title}</p>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{board.description}</p>
                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                      <Badge variant={board.visibility === "public" ? "secondary" : "outline"} className="capitalize">
                                        {board.visibility}
                                      </Badge>
                                      <div className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300">
                                        <Users className="h-3.5 w-3.5" />
                                        {board.member_count}
                                      </div>
                                      <span className="text-xs text-slate-400">{new Date(board.created_at).toLocaleString()}</span>
                                    </div>
                                    {board.tags?.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {board.tags.map((tag) => (
                                          <button key={tag} type="button"
                                            onClick={(e) => { e.preventDefault(); setSearchQuery(tag); }}
                                            className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-300 hover:bg-slate-200 transition">
                                            #{tag}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                                {!board.joined && board.creator_id !== profile.id && (
                                  <Button variant="outline" size="sm" className="mt-4 rounded-2xl"
                                    onClick={() => joinBoard(board.id)} disabled={joiningBoardId === board.id}>
                                    {joiningBoardId === board.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                    Join
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div ref={publicBoardsLoadMoreRef} className="py-2 text-center">
                        {loadingMorePublicBoards && (
                          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading more...
                          </div>
                        )}
                        {!hasMorePublicBoards && publicBoards.length >= PUBLIC_BOARDS_PER_PAGE && (
                          <p className="text-xs text-slate-400">You've seen all public boards.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

            </div>
          </div>
          </div>
        )}

        {/* Public Profile Modal */}
      {publicProfileModalOpen && selectedPublicProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setPublicProfileModalOpen(false); setSelectedPublicProfile(null); setShowPublicProfileLargeAvatar(false); }}
        >
          <div
            
  className="relative h-[250px] w-[250px] rounded-3xl bg-white dark:bg-[#414141] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setPublicProfileModalOpen(false); setSelectedPublicProfile(null); setShowPublicProfileLargeAvatar(false); }}
              className="absolute right-3 top-3 text-slate-500 dark:text-slate-300 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
            {selectedPublicProfile?.id !== profile?.id && (
              <div className="absolute left-3 top-3 flex items-center gap-1">
              <button
                type="button"
                disabled={blockLoading}
                onClick={() => isBlockedByMe
                  ? unblockUser(selectedPublicProfile.id)
                  : blockUser(selectedPublicProfile.id)}
                className={`transition disabled:opacity-50 ${isBlockedByMe ? "text-red-500 hover:text-red-700" : "text-slate-400 hover:text-red-500"}`}
                title={isBlockedByMe ? "Unblock user" : "Block user"}
              >
                {blockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>}
              </button>
              <button
                type="button"
                onClick={() => { setReportTargetId(selectedPublicProfile.id); setReportReason("spam"); setReportDetails(""); setReportModalOpen(true); }}
                className="text-slate-400 hover:text-orange-500 transition"
                title="Report user"
              >
                <Flag className="h-4 w-4" />
              </button>
              </div>
            )}
            <div className="flex h-full flex-col items-center justify-center text-center">
              {selectedPublicProfile.avatar_url ? (
                <button type="button" onClick={() => setShowPublicProfileLargeAvatar(true)} className="mb-3 shrink-0">
                  <Avatar className="h-20 w-20 overflow-hidden transition hover:scale-105 cursor-pointer">
                    <img src={selectedPublicProfile.avatar_url} alt={selectedPublicProfile.username} className="h-full w-full object-cover" />
                  </Avatar>
                </button>
              ) : (
                <Avatar className="mb-3 h-20 w-20 overflow-hidden">
                  <AvatarFallback>{initials(selectedPublicProfile.username)}</AvatarFallback>
                </Avatar>
              )}
              <p className="text-base font-semibold">{selectedPublicProfile.username}</p>
              <p className="mt-1 w-full break-words text-center text-xs text-slate-500 dark:text-slate-300">
                {selectedPublicProfile.bio?.trim() ? selectedPublicProfile.bio : "No bio added yet."}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Member since{" "}
                {new Date(selectedPublicProfile.created_at).toLocaleDateString([], { month: "long", year: "numeric" })}
              </p>
              {selectedPublicProfile.id !== profile?.id && (
                <button
                    type="button"
                    onClick={() => sendPublicFriendRequest(selectedPublicProfile.id)}
                    disabled={publicProfileFriendState !== "none" || sendingPublicFriendRequest}
                    className="mt-3 flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {sendingPublicFriendRequest ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : publicProfileFriendState === "friends" ? (
                      "✓ Friends"
                    ) : publicProfileFriendState === "pending" ? (
                      "Request pending..."
                    ) : (
                      <><Plus className="h-3 w-3" /> Add friend</>
                    )}
                  </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setReportModalOpen(false)}>
          <div className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-[#2a2a2a] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setReportModalOpen(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">Report user</h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Help us understand what's wrong.</p>
            <div className="space-y-2 mb-4">
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="profile-report-reason"
                    value={r.value}
                    checked={reportReason === r.value}
                    onChange={() => setReportReason(r.value)}
                    className="accent-slate-900"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{r.label}</span>
                </label>
              ))}
            </div>
            {reportReason === "other" && (
              <textarea
                placeholder="Tell us more (optional)"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value.slice(0, 300))}
                className="mb-4 w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                rows={3}
              />
            )}
            <Button className="w-full rounded-2xl" disabled={submittingReport} onClick={submitReport}>
              {submittingReport ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit report"}
            </Button>
          </div>
        </div>
      )}

      {/* DM image lightbox */}
      {dmLightboxUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setDmLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setDmLightboxUrl(null)}
            className="absolute right-4 top-4 text-white hover:text-slate-300"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={dmLightboxUrl}
            alt="full size"
            className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Full-size public profile avatar */}
      {showPublicProfileLargeAvatar && selectedPublicProfile?.avatar_url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowPublicProfileLargeAvatar(false)}
        >
          <img
            src={selectedPublicProfile.avatar_url}
            alt={selectedPublicProfile.username}
            className="max-h-[80vh] max-w-[80vw] rounded-3xl object-contain shadow-2xl"
          />
        </div>
      )}
      </div>
    </div>
  );
}