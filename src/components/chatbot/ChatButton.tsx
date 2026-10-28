import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RobotIcon } from './RobotIcon';
import { ChatWindow } from './ChatWindow';

interface ChatButtonProps {
  profileName?: string;
}

export const ChatButton: React.FC<ChatButtonProps> = ({ profileName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <>
      <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 select-none">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white shadow-xl shadow-sky-900/20 hover:shadow-2xl hover:shadow-sky-500/35 border-2 border-sky-400/50 hover:border-sky-500 flex items-center justify-center p-1.5 transition-all duration-200 cursor-pointer group"
          aria-label={isOpen ? "Close FallTrack AI" : "Open FallTrack AI Assistant"}
          title={isOpen ? "Close FallTrack AI" : "Open FallTrack AI"}
        >
          {/* Subtle ambient pulse ring when closed */}
          {!isOpen && (
            <span className="absolute -inset-1 rounded-full bg-sky-400/25 group-hover:bg-sky-400/40 animate-pulse pointer-events-none" />
          )}

          {/* Full-fill circular Mascot Icon with transparent background */}
          <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
            {!imgError ? (
              <img
                src="/chatbot-logo.png?v=2"
                alt="FallTrack AI"
                className="w-full h-full object-contain filter drop-shadow-sm group-hover:scale-110 transition-transform duration-200"
                onError={() => setImgError(true)}
              />
            ) : (
              <RobotIcon size={32} variant="blue" />
            )}
          </div>

          {/* Online Status Dot */}
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-500 border-2 border-white rounded-full shadow-xs" />
        </motion.button>
      </div>

      <ChatWindow 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
        profileName={profileName} 
      />
    </>
  );
};
