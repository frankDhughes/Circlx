"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Search,
  Share,
  ChevronDown,
  ChevronRight,
  Heart,
  ImagePlus,
  Loader2,
  Minus,
  Flag,
  MoreHorizontal,
  Pin,
  Plus,
  Send,
  Trash2,
  UserMinus,
  ShieldOff,
  X,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { initials } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";


const MAX_COMMENT_LENGTH = 144;
const MAX_REPLY_DEPTH = 10;

type Board = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  created_at: string;
};

type CommentLike = {
  id: string;
  comment_id: string;
  user_id: string;
};

type Profile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  created_at?: string;
};

type Comment = {
  id: string;
  board_id: string;
  author_id: string;
  parent_comment_id: string | null;
  content: string | null;
  media_url?: string | null;
  media_type?: "image" | "gif" | "video" | null;
  created_at: string;
  pinned: boolean;
  profiles: Profile | Profile[] | null;
  board_comment_likes: CommentLike[];
};

type PublicProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  created_at: string;
};

type MentionSuggestion = {
  id: string;
  username: string;
  avatar_url: string | null;
};

function normalizeProfile(profile: Profile | Profile[] | null): Profile | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] || null;
  return profile;
}

function getUsername(profile: Profile | Profile[] | null): string {
  const normalized = normalizeProfile(profile);
  return normalized?.username ?? "Unknown";
}

function getAvatar(profile: Profile | Profile[] | null): string | null {
  const normalized = normalizeProfile(profile);
  return normalized?.avatar_url ?? null;
}

function getProfileId(profile: Profile | Profile[] | null): string | undefined {
  const normalized = normalizeProfile(profile);
  return normalized?.id;
}

// Helper to extract storage path from public URL
function extractStoragePath(url: string): string | null {
  const match = url.match(/\/comment-media\/(.+)$/);
  return match ? match[1] : null;
}


function MentionDropdown({
  suggestions,
  onSelect,
}: {
  suggestions: MentionSuggestion[];
  onSelect: (username: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 shadow-lg">
      {suggestions.map((s) => (
        <button
          key={s.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(s.username); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <Avatar className="h-6 w-6 overflow-hidden shrink-0">
            {s.avatar_url ? (
              <img src={s.avatar_url} alt={s.username} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback>{initials(s.username)}</AvatarFallback>
            )}
          </Avatar>
          @{s.username}
        </button>
      ))}
    </div>
  );
}

// Extract @mentions from text
function extractMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const matches = text.matchAll(mentionRegex);
  const usernames = new Set<string>();
  
  for (const match of matches) {
    usernames.add(match[1]);
  }
  
  return Array.from(usernames);
}

// Create mention notifications
async function createMentionNotifications(
  commentId: string,
  boardId: string,
  content: string,
  mentionedUsernames: string[],
  currentUserId: string,
  currentUsername: string
) {
  if (mentionedUsernames.length === 0) return;
  
  // Get user IDs for mentioned usernames (excluding self)
  const { data: mentionedUsers } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", mentionedUsernames)
    .neq("id", currentUserId); // Don't mention yourself
  
  if (!mentionedUsers?.length) return;
  
  // Create a system message in direct_messages for mention notifications
  // This reuses your existing notification infrastructure
  const mentionMessages = mentionedUsers.map(user => ({
    sender_id: currentUserId,
    recipient_id: user.id,
    message_type: "mention",
    content: "",
    metadata: { board_id: boardId, comment_id: commentId },
  }));
  
  await supabase.from("direct_messages").insert(mentionMessages);
}


function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}


export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardId = params?.id;
  // Optimistic data from profile page — shown instantly while real data loads
  const optimisticTitle = searchParams?.get("title") ?? null;
  const optimisticDescription = searchParams?.get("description") ?? null;

  const hasFetched = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentMediaFile, setCommentMediaFile] = useState<File | null>(null);
  const [commentMediaPreview, setCommentMediaPreview] = useState<string | null>(null);
 const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
const [replyMediaFiles, setReplyMediaFiles] = useState<Record<string, File | null>>({});
const [replyMediaPreviews, setReplyMediaPreviews] = useState<Record<string, string>>({});
const [memberCount, setMemberCount] = useState(0);

  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [boardDeleted, setBoardDeleted] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
 

  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showLargeAvatar, setShowLargeAvatar] = useState(false);

  const [fullMediaUrl, setFullMediaUrl] = useState<string | null>(null);
  const [fullMediaType, setFullMediaType] = useState<"image" | "gif" | "video" | null>(null);
const [friendRequestSent, setFriendRequestSent] = useState<"none" | "pending" | "friends">("none");

  // ─── Report state ─────────────────────────────────────────────────────────────
  const REPORT_REASONS = [
    { value: "spam", label: "Spam" },
    { value: "harassment", label: "Harassment" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "misinformation", label: "Misinformation" },
    { value: "other", label: "Other" },
  ] as const;
  type ReportReason = typeof REPORT_REASONS[number]["value"];
  const [reportTarget, setReportTarget] = useState<{ type: "comment"; id: string } | { type: "user"; id: string } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
const [isBlockedByMe, setIsBlockedByMe] = useState(false);
const [blockLoading, setBlockLoading] = useState(false);

const [mentionQuery, setMentionQuery] = useState("");
const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
const [showMentionDropdown, setShowMentionDropdown] = useState(false);
const [mentionTargetId, setMentionTargetId] = useState<string | null>(null); // null = main composer, commentId = reply
const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
const [showShareModal, setShowShareModal] = useState(false);
const [shareCopied, setShareCopied] = useState(false);
const COMMENTS_PER_PAGE = 20;
const [commentPage, setCommentPage] = useState(0);
const [hasMoreComments, setHasMoreComments] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);
const loadMoreRef = useRef<HTMLDivElement>(null);
const [submittingComment, setSubmittingComment] = useState(false);
  const refreshCommentsRef = useRef<(reset?: boolean) => Promise<void>>(() => Promise.resolve());

  // ─── Members modal ────────────────────────────────────────────────────────────
  type Member = { user_id: string; username: string; avatar_url: string | null; joined_at: string; };
  const MEMBERS_PAGE_SIZE = 20;
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoadingMore, setMembersLoadingMore] = useState(false);
  const [hasMoreMembers, setHasMoreMembers] = useState(false);
  const membersPageRef = useRef(0);
  const membersLoadMoreRef = useRef<HTMLDivElement>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteResults, setInviteResults] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);


  useEffect(() => {
    hasFetched.current = false;
  }, [boardId]);

  useEffect(() => {
  if (!comments.length) return;
  const hash = window.location.hash;
  const match = hash.match(/^#comment-(.+)$/);
  if (!match) return;
  const commentId = match[1];

  const parentMap = new Map<string, string>();
  for (const c of comments) {
    if (c.parent_comment_id) parentMap.set(c.id, c.parent_comment_id);
  }

  const toExpand: Record<string, boolean> = {};
  let current = commentId;
  while (parentMap.has(current)) {
    const parent = parentMap.get(current)!;
    toExpand[parent] = true;
    current = parent;
  }
  if (Object.keys(toExpand).length) {
    setExpandedReplies((prev) => ({ ...prev, ...toExpand }));
  }

  setHighlightedCommentId(commentId);
  setTimeout(() => {
    const el = document.getElementById(`comment-${commentId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 100);

  const timer = setTimeout(() => setHighlightedCommentId(null), 3000);
  return () => clearTimeout(timer);
}, [comments]);

  // Memoized reply counts - O(n) instead of O(n²)
  const replyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    
    // Build parent -> children map
    const childrenMap = new Map<string, string[]>();
    for (const comment of comments) {
      if (comment.parent_comment_id) {
        const children = childrenMap.get(comment.parent_comment_id) || [];
        children.push(comment.id);
        childrenMap.set(comment.parent_comment_id, children);
      }
    }

    // Iterative DFS to count all descendants
    function countDescendants(commentId: string): number {
      let total = 0;
      const stack = [commentId];
      while (stack.length) {
        const current = stack.pop()!;
        const children = childrenMap.get(current) || [];
        total += children.length;
        stack.push(...children);
      }
      return total;
    }


    
   for (const comment of comments) {
  counts.set(comment.id, countDescendants(comment.id));
}
    
    return counts;
  }, [comments]);

  const markBoardAsSeen = useCallback(async (memberUserId: string, currentBoardId: string) => {
    const now = new Date().toISOString();

    const tasks = [
      supabase
        .from("board_members")
        .update({ last_seen_at: now })
        .eq("board_id", currentBoardId)
        .eq("user_id", memberUserId),

      supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("recipient_id", memberUserId)
        .eq("board_id", currentBoardId)
        .is("read_at", null),

      supabase
        .from("direct_messages")
        .update({ read_at: now })
        .eq("recipient_id", memberUserId)
        .eq("message_type", "mention")
        .filter("metadata->>board_id", "eq", currentBoardId)
        .is("read_at", null),
    ];

    const results = await Promise.allSettled(tasks);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`markBoardAsSeen task ${index} failed:`, result.reason);
      }
    });
  }, []);

  const refreshComments = useCallback(async (reset = false) => {
  if (!boardId) return;

  const page = reset ? 0 : commentPage;
  const from = page * COMMENTS_PER_PAGE;
  const to = from + COMMENTS_PER_PAGE - 1;

  const COMMENT_SELECT = `
      id,
      board_id,
      author_id,
      parent_comment_id,
      content,
      media_url,
      media_type,
      created_at,
      pinned,
      profiles:author_id ( id, username, avatar_url, bio, created_at ),
      board_comment_likes (
        id,
        comment_id,
        user_id
      )
    `;

  // Fetch paginated comments and the pinned comment in parallel
  const [pageResult, pinnedResult] = await Promise.all([
    supabase
      .from("board_comments")
      .select(COMMENT_SELECT)
      .eq("board_id", boardId)
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("board_comments")
      .select(COMMENT_SELECT)
      .eq("board_id", boardId)
      .eq("pinned", true)
      .maybeSingle(),
  ]);

  if (pageResult.error) {
    setError(pageResult.error.message);
    return;
  }

  const newComments = (pageResult.data as Comment[]) ?? [];
  setHasMoreComments(newComments.length === COMMENTS_PER_PAGE);

  // Merge pinned comment in — it may already be in the page results or may not
  const pinnedComment = pinnedResult.data as Comment | null;
  const mergeWithPinned = (base: Comment[]): Comment[] => {
    if (!pinnedComment) return base;
    const ids = new Set(base.map((c) => c.id));
    // Ensure the pinned flag is set correctly even if it appears in the page results
    const withUpdated = base.map((c) => c.id === pinnedComment.id ? { ...c, pinned: true } : c);
    if (!ids.has(pinnedComment.id)) return [pinnedComment, ...withUpdated];
    return withUpdated;
  };

  if (reset || page === 0) {
    setComments(mergeWithPinned(newComments));
    setCommentPage(1);
  } else {
    setComments((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const merged = [...prev, ...newComments.filter((c) => !existingIds.has(c.id))];
      return mergeWithPinned(merged);
    });
    setCommentPage((prev) => prev + 1);
  }
}, [boardId, commentPage]);

  // Keep ref pointing at the latest refreshComments so subscriptions never need it as a dep
  useEffect(() => { refreshCommentsRef.current = refreshComments; }, [refreshComments]);

  const loadBoardData = useCallback(async () => {
    if (!boardId) return;

    try {
      setLoading(true);

      const [{ data: authData }, { data: boardData, error: boardError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("boards")
          .select("id, creator_id, title, description, visibility, created_at")
          .eq("id", boardId)
          .single(),
      ]);

      if (boardError) {
        // PGRST116 = no rows returned — board doesn't exist (deleted)
        if (boardError.code === "PGRST116" || boardError.message?.includes("0 rows")) {
          setBoardDeleted(true);
          setLoading(false);
          return;
        }
        throw boardError;
      }

      const user = authData.user;
      const currentUserId = user?.id ?? null;

      setUserId(currentUserId);
      setBoard(boardData);

      const [memberCountResult, membershipResult] = await Promise.all([
        supabase.rpc("get_board_member_counts", { board_ids: [boardId] }),
        currentUserId
          ? supabase
              .from("board_members")
              .select("id")
              .eq("board_id", boardId)
              .eq("user_id", currentUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const countRow = (memberCountResult.data || []).find((r: any) => r.board_id === boardId);
      setMemberCount(countRow ? Number(countRow.member_count) : 0);

      if (currentUserId) {
        const member =
          !!membershipResult.data || boardData.creator_id === currentUserId;
        setIsMember(member);

        await refreshComments(true);

        if (member) {
          const now = new Date().toISOString();

          await supabase
            .from("board_members")
            .update({ last_seen_at: now })
            .eq("board_id", boardId)
            .eq("user_id", currentUserId);

          await supabase
            .from("notifications")
            .update({ read_at: now })
            .eq("recipient_id", currentUserId)
            .eq("board_id", boardId)
            .is("read_at", null);

          await supabase
            .from("direct_messages")
            .update({ read_at: now })
            .eq("recipient_id", currentUserId)
            .eq("message_type", "mention")
            .filter("metadata->>board_id", "eq", boardId)
            .is("read_at", null);
        }
      } else {
        setIsMember(false);
        await refreshComments(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Circle.");
    } finally {
      setLoading(false);
    }
  }, [boardId, refreshComments]);

  // Add these inside your component, before any useEffect
const extractMentions = (text: string): string[] => {
  const mentionRegex = /@(\w+)/g;
  const matches = text.matchAll(mentionRegex);
  const usernames = new Set<string>();
  
  for (const match of matches) {
    usernames.add(match[1]);
  }
  
  return Array.from(usernames);
};

const createMentionNotifications = async (
  commentId: string,
  boardId: string,
  content: string,
  mentionedUsernames: string[],
  currentUserId: string,
  currentUsername: string
) => {
  if (mentionedUsernames.length === 0) return;
  
  // Get user IDs for mentioned usernames (excluding self)
  const { data: mentionedUsers } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", mentionedUsernames)
    .neq("id", currentUserId);
  
  if (!mentionedUsers?.length) return;
  
  // Create mention notifications as special direct messages
  const mentionMessages = mentionedUsers.map(user => ({
    sender_id: currentUserId,
    recipient_id: user.id,
    message_type: "mention",
    content: "",
    metadata: { board_id: boardId, comment_id: commentId },
  }));
  
  await supabase.from("direct_messages").insert(mentionMessages);
};

  useEffect(() => {
    if (!boardId) return;
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadBoardData();
  }, [boardId, loadBoardData]);

  // Real-time subscriptions
  useEffect(() => {
    if (!boardId) return;

    const commentsChannel = supabase
      .channel(`board-comments-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "board_comments" },
        (payload: any) => {
          if (payload.new?.board_id === boardId || payload.old?.board_id === boardId) {
            refreshCommentsRef.current(true);
          }
        }
      )
      .subscribe();

    const likesChannel = supabase
      .channel(`board-likes-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "board_comment_likes" },
        () => refreshCommentsRef.current(true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(likesChannel);
    };
  }, [boardId]);

  // Mark board as seen when the user returns to this tab
  useEffect(() => {
    if (!userId || !boardId || !isMember) return;

    async function handleFocus() {
      await markBoardAsSeen(userId!, boardId!);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") handleFocus();
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, boardId, isMember, markBoardAsSeen]);

  function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      const url = URL.createObjectURL(file);
      video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read video.")); };
      video.src = url;
    });
  }

  async function uploadCommentMedia(file: File): Promise<{ url: string; type: "image" | "gif" | "video" } | null> {
    if (!userId) return null;

    const isVideo = file.type.startsWith("video/");

    // Validate file size
    const maxSize = isVideo ? 512 * 1024 * 1024 : 5 * 1024 * 1024;
    const maxLabel = isVideo ? "512MB" : "5MB";
    if (file.size > maxSize) {
      setError(`${isVideo ? "Video" : "Image"} must be less than ${maxLabel}.`);
      return null;
    }

    // Validate video duration (max 140 seconds)
    if (isVideo) {
      try {
        const duration = await getVideoDuration(file);
        if (duration > 140) {
          setError("Video must be 2 minutes 20 seconds (140s) or less.");
          return null;
        }
      } catch {
        setError("Could not read video duration.");
        return null;
      }
    }

    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("comment-media")
      .upload(filePath, file, {
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("comment-media").getPublicUrl(filePath);

    const mediaType: "image" | "gif" | "video" =
      file.type.startsWith("video/") ? "video"
      : file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif") ? "gif"
      : "image";

    return { url: data.publicUrl, type: mediaType };
  }

  async function addComment(parentCommentId: string | null = null) {
  if (!userId || !boardId || !isMember) return;

  const draft = parentCommentId ? replyDrafts[parentCommentId] || "" : newComment;
  const content = draft.trim();
  const mediaFile = parentCommentId ? (replyMediaFiles[parentCommentId] || null) : commentMediaFile;

  if (!content && !mediaFile) return;

  try {
    let mediaUrl: string | null = null;
    let mediaType: "image" | "gif" | "video" | null = null;

    if (mediaFile) {
      setUploadingMedia(true);
      const uploaded = await uploadCommentMedia(mediaFile);
      if (uploaded) {
        mediaUrl = uploaded.url;
        mediaType = uploaded.type;
      }
    }

    const { data: insertedComment, error: insertError } = await supabase
      .from("board_comments")
      .insert({
        board_id: boardId,
        author_id: userId,
        parent_comment_id: parentCommentId,
        content: content || null,
        media_url: mediaUrl,
        media_type: mediaType,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    // Send mention notifications
    if (insertedComment && content) {
      await sendMentionNotifications(content, insertedComment.id);
    }

    if (parentCommentId) {
      setReplyDrafts((prev) => ({ ...prev, [parentCommentId]: "" }));
      setReplyMediaFiles((prev) => ({ ...prev, [parentCommentId]: null }));
      setReplyMediaPreviews((prev: Record<string, string>) => ({ ...prev, [parentCommentId]: "" }));
      setExpandedReplies((prev) => ({ ...prev, [parentCommentId]: true }));
    } else {
      setNewComment("");
      setCommentMediaFile(null);
      setCommentMediaPreview(null);
      setIsComposerOpen(false);
    }

    // Don't call refreshComments here — the realtime subscription handles it
    toast.success("Comment posted.");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unable to add comment.");
    toast.error("Unable to post comment.");
} finally {
    setUploadingMedia(false);
    setSubmittingComment(false);
  }
}

 async function handleMentionSearch(query: string, targetId: string | null) {
  if (!query) { setMentionSuggestions([]); setShowMentionDropdown(false); return; }
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .ilike("username", `${query}%`)
    .limit(5);
  setMentionSuggestions((data as MentionSuggestion[]) ?? []);
  setShowMentionDropdown(true);
  setMentionTargetId(targetId);
}

function handleCommentChange(value: string, targetId: string | null) {
  const sliced = value.slice(0, MAX_COMMENT_LENGTH);
  if (targetId === null) {
    setNewComment(sliced);
  } else {
    setReplyDrafts((prev) => ({ ...prev, [targetId]: sliced }));
  }
  // Detect @ trigger
  const match = sliced.match(/@(\w*)$/);
  if (match) {
    handleMentionSearch(match[1], targetId);
  } else {
    setShowMentionDropdown(false);
    setMentionSuggestions([]);
  }
}

function insertMention(username: string) {
  if (mentionTargetId === null) {
    setNewComment((prev) => prev.replace(/@\w*$/, `@${username} `));
  } else {
    setReplyDrafts((prev) => ({
      ...prev,
      [mentionTargetId]: (prev[mentionTargetId] || "").replace(/@\w*$/, `@${username} `),
    }));
  }
  setShowMentionDropdown(false);
  setMentionSuggestions([]);
}

  async function deleteComment(comment: Comment) {
    if (!userId || !isMember) return;

    const confirmed = window.confirm("Delete this comment? This cannot be undone.");
    if (!confirmed) return;

    setDeletingCommentId(comment.id);

    try {
      // Delete associated media from storage if it exists
      if (comment.media_url) {
        const path = extractStoragePath(comment.media_url);
        if (path) {
          await supabase.storage.from("comment-media").remove([path]);
        }
      }

      const isCreatorDeleting = userId === board?.creator_id;

const query = supabase
  .from("board_comments")
  .delete()
  .eq("id", comment.id);

const { error: deleteError } = isCreatorDeleting
  ? await query
  : await query.eq("author_id", userId);

      if (deleteError) throw deleteError;

      await refreshComments(true);
      toast.success("Comment deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete comment.");
    } finally {
      setDeletingCommentId(null);
    }
  }

async function sendMentionNotifications(content: string, commentId: string) {
  if (!userId || !boardId) return;
  const mentions = [...content.matchAll(/@(\w+)/g)].map((m) => m[1]);
  if (!mentions.length) return;

  const { data: mentioned } = await supabase
    .from("profiles")
    .select("id")
    .in("username", mentions)
    .neq("id", userId);

  if (!mentioned?.length) return;

  await supabase.from("direct_messages").insert(
    mentioned.map((u) => ({
      sender_id: userId,
      recipient_id: u.id,
      message_type: "mention",
      content: "",
      metadata: { board_id: boardId, comment_id: commentId },
    }))
  );
}

  async function toggleLike(comment: Comment) {
  if (!userId || !isMember) return;

  const alreadyLiked = comment.board_comment_likes?.some((like) => like.user_id === userId);

  // Optimistically update state so loaded comments don't disappear
  setComments((prev) => prev.map((c) => {
    if (c.id !== comment.id) return c;
    if (alreadyLiked) {
      return { ...c, board_comment_likes: c.board_comment_likes.filter((l) => l.user_id !== userId) };
    } else {
      return { ...c, board_comment_likes: [...c.board_comment_likes, { id: "temp", comment_id: c.id, user_id: userId }] };
    }
  }));

  try {
    if (alreadyLiked) {
      const { error: deleteError } = await supabase
        .from("board_comment_likes")
        .delete()
        .eq("comment_id", comment.id)
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
    } else {
      const { error: insertError } = await supabase
        .from("board_comment_likes")
        .insert({ comment_id: comment.id, user_id: userId });
      if (insertError) throw insertError;
    }
  } catch (err) {
    // Revert optimistic update on failure
    setComments((prev) => prev.map((c) => c.id === comment.id ? comment : c));
    setError(err instanceof Error ? err.message : "Unable to toggle like.");
    toast.error("Unable to toggle like.");
  }
}
  

  async function loadMembers(page = 0) {
    if (!boardId) return;
    if (page === 0) setMembersLoading(true); else setMembersLoadingMore(true);
    try {
      const from = page * MEMBERS_PAGE_SIZE;
      const { data, error } = await supabase
        .rpc("get_board_members_with_profiles", {
          p_board_id: boardId,
          p_limit: MEMBERS_PAGE_SIZE,
          p_offset: from,
        });
      if (error) throw error;
      const mapped: Member[] = (data || []).map((m: any) => ({
        user_id: m.user_id,
        username: m.username ?? "Unknown",
        avatar_url: m.avatar_url ?? null,
        joined_at: m.joined_at,
      }));
      setHasMoreMembers(mapped.length === MEMBERS_PAGE_SIZE);
      if (page === 0) setMembers(mapped);
      else setMembers((prev) => {
        const seen = new Set(prev.map((m) => m.user_id));
        return [...prev, ...mapped.filter((m) => !seen.has(m.user_id))];
      });
    } catch (err) { console.error("loadMembers error:", err); }
    finally { setMembersLoading(false); setMembersLoadingMore(false); }
  }

  async function removeMember(targetUserId: string) {
    if (!boardId) return;
    if (!window.confirm("Remove this member from the Circle?")) return;
    setRemovingMemberId(targetUserId);
    try {
      const { error } = await supabase.from("board_members").delete()
        .eq("board_id", boardId).eq("user_id", targetUserId);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
      setMemberCount((prev) => prev - 1);
      toast.success("Member removed.");
    } catch { toast.error("Unable to remove member."); }
    finally { setRemovingMemberId(null); }
  }

  async function searchUsersToInvite(query: string) {
    setInviteSearch(query);
    if (!query.trim()) { setInviteResults([]); return; }
    setInviteSearchLoading(true);
    try {
      const { data } = await supabase.from("profiles").select("id, username, avatar_url")
        .ilike("username", `%${query.trim()}%`).limit(8);
      const memberIds = new Set(members.map((m) => m.user_id));
      setInviteResults((data || []).filter((u: any) => !memberIds.has(u.id)));
    } catch { console.error("searchUsersToInvite error"); }
    finally { setInviteSearchLoading(false); }
  }

  async function inviteUser(recipientId: string, recipientUsername: string) {
    if (!userId || !boardId || !board) return;
    setInvitingUserId(recipientId);
    try {
      const { data: me } = await supabase.from("profiles").select("username").eq("id", userId).single();
      await supabase.from("direct_messages").insert({
        sender_id: userId, recipient_id: recipientId,
        message_type: "board_invite", content: "",
        metadata: { board_id: boardId, board_title: board.title, inviter_username: me?.username ?? "" },
      });
      setInviteResults((prev) => prev.filter((u) => u.id !== recipientId));
      setInviteSearch("");
      toast.success(`Invite sent to @${recipientUsername}!`);
    } catch { toast.error("Unable to send invite."); }
    finally { setInvitingUserId(null); }
  }

  async function blockUser(targetId: string) {
    if (!userId) return;
    setBlockLoading(true);
    try {
      await supabase.from("blocked_users").insert({ blocker_id: userId, blocked_id: targetId });
      setIsBlockedByMe(true);
      await supabase.from("friend_requests").delete()
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${targetId}),and(sender_id.eq.${targetId},recipient_id.eq.${userId})`);
      closeProfileModal();
      toast.success("User blocked.");
    } catch { toast.error("Unable to block user."); }
    finally { setBlockLoading(false); }
  }

  async function unblockUser(targetId: string) {
    if (!userId) return;
    setBlockLoading(true);
    try {
      await supabase.from("blocked_users").delete()
        .eq("blocker_id", userId).eq("blocked_id", targetId);
      setIsBlockedByMe(false);
      toast.success("User unblocked.");
    } catch { toast.error("Unable to unblock user."); }
    finally { setBlockLoading(false); }
  }

  async function pinComment(commentId: string) {
    if (!boardId) return;
    try {
      // Unpin any currently pinned comment first
      await supabase.from("board_comments")
        .update({ pinned: false })
        .eq("board_id", boardId)
        .eq("pinned", true);
      await supabase.from("board_comments")
        .update({ pinned: true })
        .eq("id", commentId);
      setComments((prev) => prev.map((c) => ({ ...c, pinned: c.id === commentId })));
      toast.success("Comment pinned.");
    } catch { toast.error("Unable to pin comment."); }
  }

  async function unpinComment(commentId: string) {
    try {
      await supabase.from("board_comments").update({ pinned: false }).eq("id", commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, pinned: false } : c));
      toast.success("Comment unpinned.");
    } catch { toast.error("Unable to unpin comment."); }
  }

  async function submitReport() {
    if (!userId || !reportTarget) return;
    setSubmittingReport(true);
    try {
      const payload: Record<string, string> = {
        reporter_id: userId,
        reason: reportReason,
        details: reportDetails.trim(),
      };
      if (reportTarget.type === "comment") payload.reported_comment_id = reportTarget.id;
      if (reportTarget.type === "user") payload.reported_user_id = reportTarget.id;
      const { error } = await supabase.from("reports").insert(payload);
      if (error) throw error;
      toast.success("Report submitted. Thank you.");
      setReportTarget(null);
      setReportReason("spam");
      setReportDetails("");
    } catch {
      toast.error("Unable to submit report.");
    } finally {
      setSubmittingReport(false);
    }
  }

  async function joinBoard() {
    if (!userId || !boardId || !board) return;
    setMembershipLoading(true);
    setError(null);

    try {
      const { error: joinError } = await supabase.from("board_members").insert({
        board_id: boardId,
        user_id: userId,
      });

      if (joinError && !joinError.message.toLowerCase().includes("duplicate")) {
        throw joinError;
      }

      setIsMember(true);
      toast.success("You joined this Circle!");
      setMemberCount((prev) => prev + 1);

      await markBoardAsSeen(userId, boardId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join Circle.");
    } finally {
      setMembershipLoading(false);
    }
  }

  async function leaveBoard() {
    if (!userId || !boardId || !board) return;
    setMembershipLoading(true);
    setError(null);

    try {
      const { error: leaveError } = await supabase
        .from("board_members")
        .delete()
        .eq("board_id", boardId)
        .eq("user_id", userId);

      if (leaveError) throw leaveError;

     setIsMember(false);
toast.success("You left this Circle.");
setMemberCount((prev) => prev - 1);
router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to leave Circle.");
    } finally {
      setMembershipLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMoreComments) return;
    setLoadingMore(true);
    await refreshComments();
    setLoadingMore(false);
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreComments && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMoreComments, loadingMore, commentPage]);

  useEffect(() => {
    if (!showMembersModal) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMembers && !membersLoadingMore) {
          const next = membersPageRef.current + 1;
          membersPageRef.current = next;
          loadMembers(next);
        }
      },
      { threshold: 0.1 }
    );
    if (membersLoadMoreRef.current) observer.observe(membersLoadMoreRef.current);
    return () => observer.disconnect();
  }, [showMembersModal, hasMoreMembers, membersLoadingMore]);

  function closeProfileModal() {
    setProfileModalOpen(false);
    setSelectedProfile(null);
    setShowLargeAvatar(false);
  }

  function closeFullMedia() {
    setFullMediaUrl(null);
    setFullMediaType(null);
  }

  function openFullMedia(url: string, type: "image" | "gif" | "video" | null) {
    setFullMediaUrl(url);
    setFullMediaType(type);
  }

  function toggleReplies(commentId: string) {
    setExpandedReplies((prev) => {
      const isExpanded = prev[commentId] ?? false;
      if (isExpanded) {
        // Close this comment and all its descendants
        const next = { ...prev };
        const stack = [commentId];
        while (stack.length) {
          const current = stack.pop()!;
          delete next[current];
          const replies = getReplies(current);
          stack.push(...replies.map((r) => r.id));
        }
        return next;
      } else {
  // Open this comment and all its descendants
  const next = { ...prev };
  const stack = [commentId];
  while (stack.length) {
    const current = stack.pop()!;
    next[current] = true;
    const replies = getReplies(current);
    stack.push(...replies.map((r) => r.id));
  }
  return next;
}
    });
  }

  function openEntireThread(commentId: string) {
    setExpandedReplies((prev) => {
      const next = { ...prev };
      const stack = [commentId];
      while (stack.length) {
        const current = stack.pop()!;
        next[current] = true;
        const replies = getReplies(current);
        stack.push(...replies.map((r) => r.id));
      }
      return next;
    });
  }

  function closeEntireThread(commentId: string) {
    setExpandedReplies((prev) => {
      const next = { ...prev };
      const stack = [commentId];
      while (stack.length) {
        const current = stack.pop()!;
        delete next[current];
        const replies = getReplies(current);
        stack.push(...replies.map((r) => r.id));
      }
      return next;
    });
  }

  async function openProfile(userProfileId?: string) {
    if (!userProfileId) return;
    setProfileLoading(true);
    setProfileModalOpen(true);
    setShowLargeAvatar(false);
    

    try {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio, created_at")
        .eq("id", userProfileId)
        .single();

      if (profileError) throw profileError;
      setSelectedProfile(data);
      setFriendRequestSent("none");
      setIsBlockedByMe(false);

      const [friendResult, blockResult] = await Promise.all([
        supabase.from("friend_requests").select("id, status")
          .or(`and(sender_id.eq.${userId},recipient_id.eq.${data.id}),and(sender_id.eq.${data.id},recipient_id.eq.${userId})`)
          .maybeSingle(),
        supabase.from("blocked_users").select("id")
          .eq("blocker_id", userId!).eq("blocked_id", data.id)
          .maybeSingle(),
      ]);

      if (friendResult.data) {
        setFriendRequestSent(friendResult.data.status === "accepted" ? "friends" : "pending");
      }
      if (blockResult.data) setIsBlockedByMe(true);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load profile.");
      setProfileModalOpen(false);
    } finally {
      setProfileLoading(false);
    }
  }  // ← closing brace of openProfile

  async function sendFriendRequest(recipientId: string) {
  if (!userId) return;
  try {
    // Check if a request already exists in either direction
    const { data: existing } = await supabase
      .from("friend_requests")
      .select("id, status")
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${userId})`
      )
      .maybeSingle();

    if (existing) {
      // Already friends or request pending — just mark the button as sent
      setFriendRequestSent("pending");
      toast.success("Friend request sent!");
      return;
    }

    const { error } = await supabase.from("friend_requests").insert({
      sender_id: userId,
      recipient_id: recipientId,
    });
    if (error) throw error;
setFriendRequestSent("pending");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unable to send friend request.");
  }
}

  const rootComments = useMemo(() => {
    return comments
      .filter((comment) => !comment.parent_comment_id)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [comments]);

  function getReplies(parentId: string) {
    return comments
      .filter((comment) => comment.parent_comment_id === parentId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  function renderCommentThread(comment: Comment, depth = 0): React.ReactNode {
    const authorName = getUsername(comment.profiles);
    const avatarUrl = getAvatar(comment.profiles);
    const profileId = getProfileId(comment.profiles);
    const likedByMe = !!userId && comment.board_comment_likes?.some((like) => like.user_id === userId);
    const replies = getReplies(comment.id);
    const replyCount = replyCounts.get(comment.id) || 0;
    const hasReplies = replyCount > 0;
    const isExpanded = expandedReplies[comment.id] ?? false;
    const isDeleting = deletingCommentId === comment.id;
    const isAuthor = userId === comment.author_id;
    const canModerate = isAuthor;

    // Prevent infinite recursion
    if (depth > MAX_REPLY_DEPTH) return null;

    return (
<div
  key={comment.id}
  id={`comment-${comment.id}`}
  className={depth === 0 ? "border-t border-slate-200 first:border-t-0" : ""}
>
        {comment.pinned && depth === 0 && (
          <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Pin className="h-3 w-3" />
            Pinned
          </div>
        )}
        <div className={`py-4 px-4 rounded-xl transition group ${comment.pinned && depth === 0 ? "bg-amber-50/50 dark:bg-sky-100" : ""} ${highlightedCommentId === comment.id ? "bg-slate-100 ring-2 ring-slate-300 dark:bg-slate-700 dark:ring-slate-500" : "hover:bg-slate-50 dark:hover:bg-gray-600"}`}>
          <div className="flex items-start gap-4">
            <button type="button" onClick={() => openProfile(profileId)} className="shrink-0">
              <Avatar className="h-9 w-9 overflow-hidden cursor-pointer transition hover:scale-105">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={authorName} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback>{initials(authorName)}</AvatarFallback>
                )}
              </Avatar>
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openProfile(profileId)}
                    className="text-sm font-semibold hover:underline"
                  >
                    {authorName}
                  </button>
                 <span className="text-xs text-slate-400" title={new Date(comment.created_at).toLocaleString()}>
  {timeAgo(comment.created_at)}
</span>
                </div>

                {/* Pin/Delete menu */}
                <div className="flex items-center gap-1">
                  {isCreator && !comment.parent_comment_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity ${comment.pinned ? "text-amber-500 opacity-100" : "text-slate-400 hover:text-amber-500"}`}
                      onClick={() => comment.pinned ? unpinComment(comment.id) : pinComment(comment.id)}
                      title={comment.pinned ? "Unpin comment" : "Pin comment"}
                    >
                      <Pin className="h-4 w-4" />
                    </Button>
                  )}
                  {canModerate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => deleteComment(comment)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  )}
                  {!isAuthor && userId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-orange-500 hover:bg-orange-50"
                      onClick={() => { setReportTarget({ type: "comment", id: comment.id }); setReportReason("spam"); setReportDetails(""); }}
                      title="Report comment"
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

         {comment.content && (
<p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      {comment.content}
  </p>
)}

              {comment.media_url && (
                comment.media_type === "video" ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 w-fit max-w-full">
                    <video
                      src={comment.media_url}
                      controls
                      className="block max-h-[80vh] max-w-full"
                      preload="metadata"
                      style={{ aspectRatio: "auto" }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-3 block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-800"
                    onClick={() => openFullMedia(comment.media_url!, comment.media_type ?? null)}
                  >
                    <img
                      src={comment.media_url}
                      alt={comment.media_type === "gif" ? "GIF comment" : "Comment image"}
                      className="max-h-[480px] max-w-full object-contain transition hover:opacity-95"
                    />
                  </button>
                )
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant={likedByMe ? "default" : "outline"}
                  size="sm"
                  className="rounded-2xl"
                  onClick={() => toggleLike(comment)}
                  disabled={!userId || !isMember}
                >
                  <Heart className={`mr-2 h-4 w-4 ${likedByMe ? "fill-current" : ""}`} />
                  {comment.board_comment_likes?.length ?? 0}
                </Button>

             {hasReplies && depth === 0 && (
  <>
    <Button
      variant="ghost"
      size="sm"
      className="rounded-2xl"
      onClick={() => toggleReplies(comment.id)}
    >
      {isExpanded ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}
      {replyCount} {replyCount === 1 ? "reply" : "replies"}
    </Button>
    {replyCount > 5 && (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-2xl text-xs"
          onClick={() => openEntireThread(comment.id)}
        >
          Expand all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-2xl text-xs"
          onClick={() => closeEntireThread(comment.id)}
        >
          Collapse all
        </Button>
      </>
    )}
  </>
)}

                {depth < MAX_REPLY_DEPTH && (
  <>
    <div className="min-w-[220px] flex-1">
  <div className="relative flex items-center">
 <div className="relative flex-1">
  <Input
    placeholder={
      !userId ? "Sign in to reply" : !isMember ? "Join this board to reply" : "Write a reply..."
    }
    value={replyDrafts[comment.id] || ""}
    onChange={(e) => handleCommentChange(e.target.value, comment.id)}
    maxLength={MAX_COMMENT_LENGTH}
    disabled={!userId || !isMember}
    className="pr-8"
  />
  {showMentionDropdown && mentionTargetId === comment.id && (
    <MentionDropdown suggestions={mentionSuggestions} onSelect={insertMention} />
  )}
</div>
    <label className={`absolute right-2 cursor-pointer text-slate-400 hover:text-slate-700 ${(!userId || !isMember) ? "pointer-events-none opacity-40" : ""}`}>
      <ImagePlus className="h-4 w-4" />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        className="hidden"
        disabled={!userId || !isMember}
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          setReplyMediaFiles((prev) => ({ ...prev, [comment.id]: file }));
          setReplyMediaPreviews((prev: Record<string, string>) => ({ ...prev, [comment.id]: file ? URL.createObjectURL(file) : "" }));
        }}
      />
    </label>
  </div>
  {replyMediaFiles[comment.id] && replyMediaPreviews[comment.id] && (
    <div className="relative mt-1 inline-block">
      {replyMediaFiles[comment.id]!.type.startsWith("video/") ? (
        <video src={replyMediaPreviews[comment.id]} className="max-h-16 max-w-[120px] rounded-xl border border-slate-200" preload="metadata" />
      ) : (
        <img src={replyMediaPreviews[comment.id]} alt="preview" className="max-h-16 max-w-[120px] rounded-xl object-contain border border-slate-200" />
      )}
      <button
        type="button"
        onClick={() => {
          setReplyMediaFiles((prev) => ({ ...prev, [comment.id]: null }));
          setReplyMediaPreviews((prev: Record<string, string>) => ({ ...prev, [comment.id]: "" }));
        }}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-900"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )}
</div>
    <Button
      size="sm"
      className="rounded-2xl"
      onClick={() => addComment(comment.id)}  
      disabled={!userId || !isMember || submittingComment || (!(replyDrafts[comment.id] || "").trim() && !replyMediaFiles[comment.id])}    >
      Reply
    </Button>
  </>
)}
                {depth >= MAX_REPLY_DEPTH && (
                  <span className="text-xs text-slate-400">Max reply depth reached</span>
                )}
              </div>
            </div>
          </div>
        </div>

     {hasReplies && isExpanded && depth < MAX_REPLY_DEPTH && (
  <div className={depth === 0 ? "ml-6" : ""}>{replies.map((reply) => renderCommentThread(reply, depth + 1))}</div>
)}
      </div>
    );
  }

  const isCreator = !!userId && !!board && board.creator_id === userId;
  const showJoinButton = !!userId && !!board && !isCreator && !isMember;
  const showLeaveButton = !!userId && !!board && !isCreator && isMember;

  if (boardDeleted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
        <div className="mx-auto max-w-sm">
          <div className="mb-6 flex items-center justify-center">
            <img src="/circlxlogosmall.svg" alt="Circlx" className="h-16 w-16 block dark:hidden opacity-40" />
            <img src="/circlxlogodarksmall.svg" alt="Circlx" className="h-16 w-16 hidden dark:block opacity-40" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-700 dark:text-slate-300">This Circle no longer exists</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            This Circle has been deleted by its creator.
          </p>
          <Link href="/profile">
            <Button className="rounded-2xl">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to profile
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col p-4 md:p-8">
          {/* Header skeleton */}
          <div className="mb-4 flex flex-col items-center gap-3">
            <img src="/circlxlogosmall.svg" alt="Circlx" className="h-15 w-15 block dark:hidden" />
            <img src="/circlxlogodarksmall.svg" alt="Circlx" className="h-15 w-15 hidden dark:block" />
            <div className="flex w-full items-center justify-between gap-3">
              <Link href="/profile">
                <Button variant="outline" className="rounded-2xl">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to profile
                </Button>
              </Link>
            </div>
          </div>

          {/* Board info — show real data if available from URL params, otherwise skeleton */}
          <Card className="mb-4 rounded-3xl border-0 shadow-sm">
            <CardHeader>
              {optimisticTitle ? (
                <CardTitle className="text-2xl">{optimisticTitle}</CardTitle>
              ) : (
                <div className="h-7 w-48 animate-pulse rounded-xl bg-slate-200" />
              )}
            </CardHeader>
            <CardContent>
              {optimisticDescription ? (
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{optimisticDescription}</p>
              ) : (
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comments skeleton */}
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader><CardTitle>Discussion</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-12">
                <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-300" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col ">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col p-4 md:p-8">
        {/* Header */}
<div className="mb-4 flex flex-col items-center gap-3">
  {/* Logo centered at top */}
  <img src="/circlxlogosmall.svg" alt="Circlx" className="h-15 w-15 block dark:hidden" />
  <img src="/circlxlogodarksmall.svg" alt="Circlx" className="h-15 w-15 hidden dark:block" />

  {/* Nav row */}
  <div className="flex w-full items-center justify-between gap-3">
    <Link href="/profile">
      <Button variant="outline" className="rounded-2xl">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to profile
      </Button>
    </Link>

    <div className="flex items-center gap-4">
      {board?.visibility === "public" && (
        <Button
          variant="outline"
          size="icon"
          className="rounded-2xl"
          onClick={() => setShowShareModal(true)}
        >
          <Share className="h-4 w-4" />
        </Button>
      )}

      {showJoinButton && (
        <Button onClick={joinBoard} disabled={membershipLoading} className="rounded-2xl">
          {membershipLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Join
        </Button>
      )}

      {showLeaveButton && (
        <Button onClick={leaveBoard} disabled={membershipLoading} variant="outline" className="rounded-2xl">
          {membershipLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Minus className="mr-2 h-4 w-4" />}
          Leave
        </Button>
      )}
    </div>
  </div>
</div>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        {board && (
          <>
            {/* Board Info */}
           <Card className="mb-4 rounded-3xl border-0 shadow-sm">
  <CardHeader>
    <div className="flex items-center justify-between gap-3">
      <CardTitle className="text-2xl">{board.title}</CardTitle>
      <button
        type="button"
        onClick={() => { membersPageRef.current = 0; setShowMembersModal(true); loadMembers(0); }}
        className="flex items-center gap-1.5 rounded-2xl bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-600"
      >
        <Users className="h-4 w-4" />
        <span>{memberCount} {memberCount === 1 ? "member" : "members"}</span>
      </button>
    </div>
  </CardHeader>
  <CardContent>
    <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{board.description}</p>
  </CardContent>
</Card>

            {/* Comments Section */}
            <div className="flex-1">
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Discussion</CardTitle>
                </CardHeader>
                <CardContent>
                  {rootComments.length === 0 ? (
                    <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-500 dark:text-slate-800">
                      No comments yet. Be the first to start the discussion!
                    </div>
                  ) : (
                    <div>
                      {rootComments.map((comment) => renderCommentThread(comment))}
                      <div ref={loadMoreRef} className="py-4 text-center">
                        {loadingMore && (
                          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading more...
                          </div>
                        )}
                        {!hasMoreComments && comments.length >= COMMENTS_PER_PAGE && (
                          <p className="text-xs text-slate-400">You've reached the end.</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sticky Comment Composer */}
            <div className="sticky bottom-0 mt-4 border-t border-slate-200 /95 backdrop-blur-sm">
              <div className="py-3">
                {!isComposerOpen ? (
                  <button
                    onClick={() => userId && isMember && setIsComposerOpen(true)}
                    className="w-full rounded-full border border-slate-200  px-4 py-3 text-left text-sm text-slate-400 transition hover:"
                    disabled={!userId || !isMember}
                  >
                    {!userId ? "Sign in to comment" : !isMember ? "Join this Circle to comment..." : "Write a comment..."}
                  </button>
                ) : (
                  <div className="rounded-3xl border border-slate-200  p-3 shadow-sm">
                <div className="relative">
  <Textarea
    autoFocus
    placeholder="Write a comment..."
    value={newComment}
    onChange={(e) => handleCommentChange(e.target.value, null)}
    maxLength={MAX_COMMENT_LENGTH}
    className="min-h-[80px] resize-none border-none bg-transparent px-2 py-2 text-sm leading-relaxed focus-visible:ring-0"
  />
  {showMentionDropdown && mentionTargetId === null && (
    <MentionDropdown suggestions={mentionSuggestions} onSelect={insertMention} />
  )}
</div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer text-slate-500 dark:text-slate-300 hover:text-slate-800">
                          <ImagePlus className="h-5 w-5" />
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setCommentMediaFile(file);
                              setCommentMediaPreview(file ? URL.createObjectURL(file) : null);
                            }}
                          />
                        </label>
                        {commentMediaFile && commentMediaPreview && (
                          <div className="relative inline-block">
                            {commentMediaFile.type.startsWith("video/") ? (
                              <video src={commentMediaPreview} className="max-h-20 max-w-[160px] rounded-xl border border-slate-200" preload="metadata" />
                            ) : (
                              <img src={commentMediaPreview} alt="preview" className="max-h-20 max-w-[160px] rounded-xl object-contain border border-slate-200" />
                            )}
                            <button
                              type="button"
                              onClick={() => { setCommentMediaFile(null); setCommentMediaPreview(null); }}
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-900"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsComposerOpen(false);
                            setNewComment("");
                            setCommentMediaFile(null);
                            setCommentMediaPreview(null);
                          }}
                          className="text-sm text-slate-500 dark:text-slate-300 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                        <Button
                          onClick={() => addComment()}
                          disabled={uploadingMedia || submittingComment || (!newComment.trim() && !commentMediaFile)}
                          className="rounded-full px-4"
                        >
                          {uploadingMedia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                          Post
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profile Modal */}
{profileModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeProfileModal}>
    <div className="relative h-[250px] w-[250px] rounded-3xl bg-white dark:bg-[#414141] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={closeProfileModal}
        className="absolute right-3 top-3 text-slate-500 dark:text-slate-300 hover:text-slate-900"
      >
        <X className="h-4 w-4" />
      </button>
      {selectedProfile && selectedProfile.id !== userId && (
        <div className="absolute left-3 top-3 flex items-center gap-1">
          <button
            type="button"
            disabled={blockLoading}
            onClick={() => isBlockedByMe
              ? unblockUser(selectedProfile.id)
              : blockUser(selectedProfile.id)}
            className={`transition disabled:opacity-50 ${isBlockedByMe ? "text-red-500 hover:text-red-700" : "text-slate-400 hover:text-red-500"}`}
            title={isBlockedByMe ? "Unblock user" : "Block user"}
          >
            {blockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>}
          </button>
          <button
            type="button"
            onClick={() => { setReportTarget({ type: "user", id: selectedProfile.id }); setReportReason("spam"); setReportDetails(""); }}
            className="text-slate-400 hover:text-orange-500 transition"
            title="Report user"
          >
            <Flag className="h-4 w-4" />
          </button>
        </div>
      )}
      {profileLoading ? (
        <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-300">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : selectedProfile ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <button type="button" onClick={() => setShowLargeAvatar(true)} className="mb-3">
            <Avatar className="h-20 w-20 overflow-hidden transition hover:scale-105">
              {selectedProfile.avatar_url ? (
                <img src={selectedProfile.avatar_url} alt={selectedProfile.username} className="h-full w-full object-cover" />
              ) : (
                <AvatarFallback>{initials(selectedProfile.username)}</AvatarFallback>
              )}
            </Avatar>
          </button>
          <p className="text-base font-semibold">{selectedProfile.username}</p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-300">
            {selectedProfile.bio?.trim() ? selectedProfile.bio : "No bio added yet."}
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-300">
            Member since{" "}
            {new Date(selectedProfile.created_at).toLocaleDateString([], { month: "long", year: "numeric" })}
          </p>
          {selectedProfile.id !== userId && (
            <button
              type="button"
              onClick={() => sendFriendRequest(selectedProfile.id)}
              disabled={friendRequestSent !== "none" ? true : undefined}
              className="mt-3 flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {friendRequestSent === "friends" ? (
                <>✓ Friends</>
              ) : friendRequestSent === "pending" ? (
                "Request pending..."
              ) : (
                <><Plus className="h-3 w-3" /> Add friend</>
              )}
            </button>
          )}
        </div>
      ) : null}
    </div>
  </div>
)}
    

      {/* Large Avatar Modal */}
      {showLargeAvatar && selectedProfile?.avatar_url && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowLargeAvatar(false)}>
          <img
            src={selectedProfile.avatar_url}
            alt={selectedProfile.username}
            className="max-h-[80vh] max-w-[80vw] rounded-3xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Full Media Modal */}
      {fullMediaUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={closeFullMedia}>
          <button
            type="button"
            onClick={closeFullMedia}
            className="absolute right-4 top-4 text-white hover:text-slate-200"
          >
            <X className="h-6 w-6" />
          </button>
          {fullMediaType === "video" ? (
            <video
              src={fullMediaUrl}
              controls
              autoPlay
              className="max-h-[85vh] max-w-[90vw] rounded-3xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={fullMediaUrl}
              alt={fullMediaType === "gif" ? "Full-size GIF" : "Full-size image"}
              className="max-h-[85vh] max-w-[90vw] rounded-3xl object-contain shadow-2xl"
            />
          )}
        </div>
      )}




      
  {/* Share Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setShowShareModal(false); setShareCopied(false); }}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl  p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setShowShareModal(false); setShareCopied(false); }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="mb-1 text-base font-semibold text-slate-900">Share this board</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-300">{board?.title}</p>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200  px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                {window.location.href}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  setShareCopied(true);
                  toast.success("Link copied to clipboard!");
                  setTimeout(() => setShareCopied(false), 2000);
                }}
                className="shrink-0 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
              >
                {shareCopied ? "Copied!" : "Copy"}
              </button>
            </div>
            <a
              href={'mailto:?subject=' + encodeURIComponent('Check out "' + (board?.title ?? '') + '"') + '&body=' + encodeURIComponent('I thought you might like this Circle:\n\n' + window.location.href)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200  px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:"
            >
              <Mail className="h-4 w-4" />
              Send via email
            </a>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setShowMembersModal(false); setInviteSearch(""); setInviteResults([]); }}
        >
          <div
            className="relative flex w-full max-w-md flex-col rounded-3xl bg-white dark:bg-[#2a2a2a] shadow-xl"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-5 py-4 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Members · {memberCount}</h2>
              <button type="button" onClick={() => { setShowMembersModal(false); setInviteSearch(""); setInviteResults([]); }} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>

            {isCreator && board?.visibility === "private" && (
              <div className="shrink-0 border-b border-slate-100 dark:border-slate-700 px-5 py-3 space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Invite someone</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by username..."
                    value={inviteSearch}
                    onChange={(e) => searchUsersToInvite(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1.5 pl-8 pr-8 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  {inviteSearch && (
                    <button type="button" onClick={() => { setInviteSearch(""); setInviteResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {inviteSearch && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                    {inviteSearchLoading ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...</div>
                    ) : inviteResults.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">No users found.</p>
                    ) : (
                      inviteResults.map((u) => (
                        <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                          <Avatar className="h-7 w-7 shrink-0 overflow-hidden">
                            {u.avatar_url ? <img src={u.avatar_url} alt={u.username} className="h-full w-full object-cover" /> : <AvatarFallback>{initials(u.username)}</AvatarFallback>}
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-white">@{u.username}</span>
                          <Button size="sm" className="shrink-0 rounded-2xl" disabled={invitingUserId === u.id} onClick={() => inviteUser(u.id, u.username)}>
                            {invitingUserId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Invite"}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {membersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-300" />
                </div>
              ) : members.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No members found.</p>
              ) : (
                <>
                  {members.map((member) => (
                    <div key={member.user_id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                      <button type="button" onClick={() => { setShowMembersModal(false); openProfile(member.user_id); }} className="shrink-0">
                        <Avatar className="h-9 w-9 overflow-hidden cursor-pointer transition hover:scale-105">
                          {member.avatar_url ? <img src={member.avatar_url} alt={member.username} className="h-full w-full object-cover" /> : <AvatarFallback>{initials(member.username)}</AvatarFallback>}
                        </Avatar>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          @{member.username}
                          {member.user_id === board?.creator_id && (
                            <span className="ml-1.5 rounded-full bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">creator</span>
                          )}
                        </p>
                      </div>
                      {isCreator && member.user_id !== userId && (
                        <button type="button" disabled={removingMemberId === member.user_id} onClick={() => removeMember(member.user_id)} className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition disabled:opacity-40" title="Remove member">
                          {removingMemberId === member.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  ))}
                  <div ref={membersLoadMoreRef} className="py-2 text-center">
                    {membersLoadingMore && <div className="flex items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading more...</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setReportTarget(null)}>
          <div className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-[#2a2a2a] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setReportTarget(null)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">
              Report {reportTarget.type === "comment" ? "comment" : "user"}
            </h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Help us understand what's wrong.</p>
            <div className="space-y-2 mb-4">
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="report-reason"
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

    </div>
  );
}