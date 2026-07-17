import { useState, useEffect } from 'react';
import { commentService } from '../../services/commentService';
import type { Comment } from '../../services/commentService';
import { useAuth } from '../../contexts/AuthProvider';

export const CommentsThread = ({ transactionId, campId }: { transactionId: string, campId: string }) => {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!transactionId) return;
    const unsubscribe = commentService.subscribeToComments(transactionId, (data) => {
      setComments(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [transactionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !user || !profile) return;
    
    setSubmitting(true);
    setError('');
    try {
      await commentService.addComment(
        transactionId,
        campId,
        user.uid,
        profile.name,
        newText.trim()
      );
      setNewText('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4 text-slate-500">Loading comments...</div>;

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex-1 overflow-y-auto space-y-4 max-h-[400px] pr-2">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No comments yet.</div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-slate-900">{c.authorName}</span>
                <span className="text-xs text-slate-400">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.text}</p>
            </div>
          ))
        )}
      </div>

      <div className="pt-4 border-t border-slate-200 mt-auto">
        {error && <div className="mb-2 text-sm text-rose-600">{error}</div>}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !newText.trim()}
            className="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </form>
      </div>
    </div>
  );
};
