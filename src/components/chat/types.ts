export interface ChatMessage {
  id: string;
  author_id: string;
  author_type: 'influencer' | 'blogger' | 'admin';
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  image_urls: string[];
  mentioned_ids: string[];
  reply_to_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface ChatReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}
