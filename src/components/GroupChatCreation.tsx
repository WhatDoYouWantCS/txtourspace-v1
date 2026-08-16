import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Image as ImageIcon, Camera, CheckSquare, Square, Info } from 'lucide-react';
import { User, Chat } from '../types';
import { getAvatarGradient } from '../data/mockUsers';
import ImageCropperModal from './ImageCropperModal';

interface GroupChatCreationProps {
  users: User[];
  chats: Chat[];
  currentUser: User;
  onClose: () => void;
  onCreateGroup: (name: string, imageSeed: string, memberIds: string[]) => void;
}

export default function GroupChatCreation({
  users,
  chats,
  currentUser,
  onClose,
  onCreateGroup
}: GroupChatCreationProps) {
  const [groupName, setGroupName] = useState('');
  const [imageSeed, setImageSeed] = useState('group_' + Math.floor(Math.random() * 1000));
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Get active contacts (members of private chats we are in)
  const getContacts = (): User[] => {
    const contactIds = new Set<string>();
    
    chats.forEach(chat => {
      if (!chat.isGroup) {
        // Find other member
        const otherId = chat.members.find(id => id !== currentUser.uid);
        if (otherId) contactIds.add(otherId);
      }
    });

    return users.filter(u => contactIds.has(u.uid));
  };

  const contacts = getContacts();

  const handleToggleMember = (uid: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(uid) 
        ? prev.filter(id => id !== uid) 
        : [...prev, uid]
    );
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 300;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setCustomImage(compressedDataUrl);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!groupName.trim()) {
      setError('Please provide a group conversation name.');
      return;
    }

    if (selectedMemberIds.length === 0) {
      setError('Please select at least one group member.');
      return;
    }

    // Pass the image seed or base64 upload
    const finalImage = customImage || imageSeed;
    
    // Create group (includes current user auto-added)
    onCreateGroup(groupName.trim(), finalImage, selectedMemberIds);
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-black transition-colors duration-300">
      
      {/* Header bar */}
      <div className="p-5 flex items-center justify-between bg-[#0A0A0A] border-b border-[#262626]">
        <span className="text-sm font-semibold text-white">New Group Conversation</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] text-[#8E8E93] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
        
        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Group Info Input Card */}
        <div className="bg-[#1C1C1E] rounded-3xl p-5 border border-[#262626] flex flex-col items-center gap-4">
          
          {/* Group Avatar Config */}
          <div className="relative group cursor-pointer" onClick={() => setShowCropper(true)}>
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-md overflow-hidden border border-[#262626]"
              style={{
                background: customImage ? 'none' : getAvatarGradient(imageSeed)
              }}
            >
              {customImage ? (
                <img src={customImage} alt="Group preview" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-10 h-10 text-white" />
              )}
            </div>

            {/* Custom file/url cropper cover trigger */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowCropper(true); }}
              className="absolute bottom-0 right-0 w-7 h-7 bg-zinc-900 text-white rounded-full flex items-center justify-center cursor-pointer border border-[#262626] shadow-sm hover:scale-110 transition-transform"
              title="Set group picture (Upload or URL)"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[10px] text-[#8E8E93] text-center">
            {customImage ? 'Custom group picture set' : 'Click cover or camera icon to upload file or paste URL'}
          </p>

          <div className="w-full">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93] pl-1 block mb-1.5">Group Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Design Board, Project Sync"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 px-4 text-sm outline-none text-white transition-colors placeholder-[#8E8E93]"
            />
          </div>
        </div>

        {/* Members Selection List */}
        <div className="bg-[#1C1C1E] rounded-3xl p-5 border border-[#262626]">
          <div className="flex items-center justify-between mb-3 border-b border-[#262626] pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">Select group members</span>
            <span className="text-xs font-semibold text-[#3B82F6]">{selectedMemberIds.length} selected</span>
          </div>

          {contacts.length === 0 ? (
            <div className="py-8 text-center text-[#8E8E93]">
              <div className="w-9 h-9 rounded-full bg-black border border-[#262626] flex items-center justify-center mx-auto mb-2">
                <Info className="w-5 h-5 text-[#8E8E93]" />
              </div>
              <p className="text-xs">No active contacts available.</p>
              <p className="text-[11px] text-[#8E8E93] max-w-[200px] mx-auto mt-1">
                You can only add users who have already accepted your contact requests.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1 no-scrollbar">
              {contacts.map((contact) => {
                const isSelected = selectedMemberIds.includes(contact.uid);
                const isCustom = contact.profileImage.startsWith('data:');

                return (
                  <div
                    key={contact.uid}
                    onClick={() => handleToggleMember(contact.uid)}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-black border border-transparent hover:border-[#262626] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isCustom ? (
                        <img 
                          src={contact.profileImage} 
                          alt={contact.fullName} 
                          className="w-9 h-9 rounded-full object-cover shadow-sm border border-black/5" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-inner"
                          style={{ background: getAvatarGradient(contact.profileImage) }}
                        >
                          {contact.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate">
                          {contact.fullName}
                        </h4>
                        <p className="text-[10px] text-[#8E8E93]">@{contact.username}</p>
                      </div>
                    </div>

                    <div className="text-[#3B82F6] pr-1 flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 fill-[#3B82F6]/10 text-[#3B82F6]" />
                      ) : (
                        <Square className="w-5 h-5 text-[#262626]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Submit creation button */}
        <button
          type="submit"
          disabled={selectedMemberIds.length === 0 || !groupName.trim()}
          className="w-full bg-gradient-to-br from-[#0A84FF] to-[#0070E0] disabled:opacity-40 text-white rounded-2xl py-4 text-sm font-semibold shadow-md active:scale-98 transition-all cursor-pointer"
        >
          Create Group Conversation
        </button>

      </form>

      <AnimatePresence>
        {showCropper && (
          <ImageCropperModal
            title="Set Group Picture"
            initialImage={customImage}
            aspectRatio="square"
            onClose={() => setShowCropper(false)}
            onCropComplete={(croppedBase64) => {
              setCustomImage(croppedBase64);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
