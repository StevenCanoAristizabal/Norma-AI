import React from 'react';
import { X, ExternalLink, Download, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PdfViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ url, title, onClose }) => {
  const [isMaximized, setIsMaximized] = React.useState(false);

  const getEmbedUrl = (originalUrl: string) => {
    // Handle Google Drive links
    if (originalUrl.includes('drive.google.com')) {
      if (originalUrl.includes('/view')) {
        return originalUrl.replace(/\/view.*/, '/preview');
      }
      if (originalUrl.includes('id=')) {
        const fileId = originalUrl.split('id=')[1].split('&')[0];
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
    }
    // Handle direct PDF links
    if (originalUrl.toLowerCase().endsWith('.pdf')) {
      return `${originalUrl}#toolbar=0&navpanes=0&scrollbar=0`;
    }
    return originalUrl;
  };

  const getDownloadUrl = (originalUrl: string) => {
    if (originalUrl.includes('drive.google.com')) {
      let fileId = '';
      if (originalUrl.includes('/d/')) {
        fileId = originalUrl.split('/d/')[1].split('/')[0];
      } else if (originalUrl.includes('id=')) {
        fileId = originalUrl.split('id=')[1].split('&')[0];
      }
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }
    return originalUrl;
  };

  const downloadUrl = getDownloadUrl(url);
  const embedUrl = getEmbedUrl(url);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ 
          scale: 1, 
          opacity: 1, 
          y: 0,
          width: isMaximized ? '100%' : '90%',
          height: isMaximized ? '100%' : '85%'
        }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative max-w-6xl w-full transition-all duration-300 ${isMaximized ? 'm-0 rounded-none' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-lg">
              📄
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">{title}</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">Visor Normativo</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title={isMaximized ? "Minimizar" : "Maximizar"}
            >
              {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-brand-blue dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              title="Abrir en pestaña nueva"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors ml-2"
              title="Cerrar"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div className="flex-1 bg-slate-100 relative">
          <iframe
            src={embedUrl}
            className="w-full h-full border-none"
            title={title}
            allow="autoplay"
          />
          
          {/* Overlay mask to prevent iframe from capturing all interactions if needed, 
              though usually we want users to be able to scroll the PDF */}
        </div>

        {/* Footer/Actions */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            Solo para consulta interna. © 2026 Norma AI
          </p>
          <button 
            className="flex items-center gap-2 px-4 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
            onClick={() => window.open(downloadUrl, '_blank')}
          >
            <Download className="w-3 h-3" />
            Descargar Copia
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
