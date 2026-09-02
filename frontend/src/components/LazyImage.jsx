import React from 'react';
import { getFirstImage } from '../utils/formatters';

const LazyImage = ({ src, className, alt, fallback: Fallback }) => {
  const image = getFirstImage(src);

  const Placeholder = () => (
    <div className={`${className} bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center border border-slate-200/60 shadow-inner overflow-hidden relative group`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.8),transparent)] opacity-50" />
      {Fallback ? (
        <Fallback size={28} className="text-slate-300 relative z-10 group-hover:scale-110 transition-transform duration-500" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-white/50 backdrop-blur-sm flex items-center justify-center relative z-10">
          <div className="w-4 h-4 bg-slate-200 rounded-sm rotate-45" />
        </div>
      )}
    </div>
  );

  return image ? (
    <img 
      src={image} 
      alt={alt} 
      className={`${className} transition-opacity duration-700 ease-in-out`}
      onLoad={(e) => { e.target.style.opacity = 1; }}
      style={{ opacity: 0 }}
    />
  ) : <Placeholder />;
};

export default LazyImage;
