export type Profile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  created_at: string;
};

export type BoardMember = {
  id?: string;
  board_id?: string;
  user_id: string;
  last_seen_at?: string | null;
};

export type BoardProfileRelation =
  | {
      id?: string;
      username: string;
      avatar_url?: string | null;
      bio?: string | null;
      created_at?: string;
    }
  | {
      id?: string;
      username: string;
      avatar_url?: string | null;
      bio?: string | null;
      created_at?: string;
    }[]
  | null;

export type BoardRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  created_at: string;
  profiles?: BoardProfileRelation;
  board_members?: BoardMember[];
};

export type BoardCommentLikeRow = {
  id: string;
  comment_id: string;
  user_id: string;
};

export type BoardCommentRow = {
  id: string;
  board_id: string;
  author_id: string;
  parent_comment_id: string | null;
  content: string | null;
  media_url?: string | null;
  media_type?: "image" | "gif" | null;
  created_at: string;
  profiles: BoardProfileRelation;
  board_comment_likes: BoardCommentLikeRow[];
};

