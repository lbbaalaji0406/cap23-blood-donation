import { useState, useEffect, useRef } from 'react';
import { storageService } from '../../services/storageService';
import type { Attachment } from '../../services/storageService';
import { useAuth } from '../../contexts/AuthProvider';

export const AttachmentsList = ({ transactionId, campId }: { transactionId: string, campId: string }) => {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!transactionId) return;
    const unsubscribe = storageService.subscribeToAttachments(transactionId, (data) => {
      setAttachments(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [transactionId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    // Validations (Cloudinary preset restricts, but we check here too for UX)
    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Only JPG, PNG, and PDF are allowed.');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large. Maximum size is 5MB.');
      return;
    }

    setUploading(true);
    setError('');
    
    try {
      await storageService.uploadFile(transactionId, campId, file, user.uid);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) return <div className="p-4 text-slate-500">Loading attachments...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-slate-700">Attached Documents</h3>
        <div>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange} 
            className="hidden" 
            accept=".jpg,.jpeg,.png,.pdf"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 text-sm font-medium shadow-sm disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>
      </div>
      
      {error && <div className="text-sm text-rose-600 bg-rose-50 p-3 rounded">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {attachments.length === 0 ? (
          <div className="col-span-full text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            No attachments yet.
          </div>
        ) : (
          attachments.map(att => (
            <div key={att.id} className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <a 
                  href={att.storageUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800 truncate block"
                  title={att.fileName}
                >
                  {att.fileName}
                </a>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>{formatSize(att.size)}</span>
                  <span>&bull;</span>
                  <span>{new Date(att.uploadedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
