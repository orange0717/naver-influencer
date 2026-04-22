'use client';

interface Props {
  messageId: string;
  reactions: { emoji: string; users: string[] }[];
  currentUserId: string | null;
  onToggle: (emoji: string) => void;
}

export default function ReactionBar({ reactions, currentUserId, onToggle }: Props) {
  if (reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map(({ emoji, users }) => {
        const mine = currentUserId ? users.includes(currentUserId) : false;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            className={`text-xs px-2 py-0.5 rounded-full border transition ${
              mine
                ? 'bg-accent/20 border-accent text-text'
                : 'bg-bg border-border text-dim hover:border-accent/50'
            }`}
          >
            <span>{emoji}</span> <span className="ml-1 font-semibold">{users.length}</span>
          </button>
        );
      })}
    </div>
  );
}
