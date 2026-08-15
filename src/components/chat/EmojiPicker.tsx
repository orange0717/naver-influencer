'use client';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '💯', '✨', '👀', '💪', '🤔', '😭', '😊'];

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full right-0 mb-2 bg-surface border border-border rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1 z-20">
      {EMOJIS.map(e => (
        <button
          key={e}
          type="button"
          onClick={() => { onPick(e); onClose(); }}
          className="w-8 h-8 flex items-center justify-center text-lg hover:bg-bg rounded transition"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
