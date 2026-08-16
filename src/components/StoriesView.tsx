import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Heart, Send, X, Clock, Book, Smile, Eye, Users, Image, MessageSquare, AtSign, ChevronLeft, ChevronRight, User as UserIcon, Phone, Lock } from 'lucide-react';
import { Story, User, Message, Chat, ChatRequest } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface StoriesViewProps {
  stories: Story[];
  users: User[];
  currentUser: User;
  chats: Chat[];
  chatRequests: ChatRequest[];
  onAddStory: (text: string, bgColor: string, image?: string, mentions?: string[]) => void;
  onLikeStory: (storyId: string) => void;
  onReplyStory: (storyId: string, text: string) => void;
  onViewStory?: (storyId: string) => void;
  onOpenChat?: (userId: string) => void;
  onViewUserProfile?: (userId: string) => void;
}

const SPOTIFY_BG_PRESETS = [
  'linear-gradient(135deg, #1DB954 0%, #191414 100%)', // Spotify Green
  'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)', // Vibrant Sunset
  'linear-gradient(135deg, #8A2387 0%, #E94057 50%, #F27121 100%)', // Instagram-like
  'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', // Ocean Blue
  'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)', // Bubblegum Pink
  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', // Neon Green Grad
  'linear-gradient(135deg, #6441A5 0%, #2a0845 100%)', // Purple Velvet
];

export default function StoriesView({
  stories,
  users,
  currentUser,
  chats,
  chatRequests,
  onAddStory,
  onLikeStory,
  onReplyStory,
  onViewStory,
  onOpenChat,
  onViewUserProfile
}: StoriesViewProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [storyType, setStoryType] = useState<'photo' | 'text'>('photo');
  const [storyText, setStoryText] = useState('');
  const [selectedBg, setSelectedBg] = useState(SPOTIFY_BG_PRESETS[0]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  
  // Active story viewer state
  const [selectedAlbumCreatorId, setSelectedAlbumCreatorId] = useState<string | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Swipe gesture tracking
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Clean and filter active stories (within 24hr expiration window and connected status)
  const isWithin24Hours = (isoString: string) => {
    const createdTime = new Date(isoString).getTime();
    const now = Date.now();
    return now - createdTime < 24 * 60 * 60 * 1000;
  };

  const activeStories = stories.filter(s => {
    if (!isWithin24Hours(s.createdAt)) return false;
    
    // Always show our own stories
    if (s.creatorId === currentUser.uid) return true;

    // Check if unfriended
    const isUnfriended = (currentUser.unfriendedUsers || []).includes(s.creatorId) || 
                         (users.find(u => u.uid === s.creatorId)?.unfriendedUsers || []).includes(currentUser.uid);
    if (isUnfriended) return false;

    // Check if blocked
    const isBlocked = (currentUser.blockedUsers || []).includes(s.creatorId) || 
                      (users.find(u => u.uid === s.creatorId)?.blockedUsers || []).includes(currentUser.uid);
    if (isBlocked) return false;

    // Must be a chat friend (accepted request or active chat)
    const hasAcceptedRequest = chatRequests && chatRequests.some(r => 
      r.status === 'accepted' && 
      ((r.senderId === currentUser.uid && r.receiverId === s.creatorId) ||
       (r.senderId === s.creatorId && r.receiverId === currentUser.uid))
    );

    const hasChatConnection = chats && chats.some(c => 
      !c.isGroup && c.members.includes(currentUser.uid) && c.members.includes(s.creatorId)
    );

    return !!(hasAcceptedRequest || hasChatConnection);
  });

  // Group active stories by creatorId (one dedicated user album per user)
  const storyAlbums = useMemo(() => {
    const groups: { [creatorId: string]: Story[] } = {};
    
    // Sort stories chronologically (oldest to newest) inside each album
    const sortedActiveStories = [...activeStories].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    sortedActiveStories.forEach(s => {
      if (!groups[s.creatorId]) {
        groups[s.creatorId] = [];
      }
      groups[s.creatorId].push(s);
    });

    const albums = Object.entries(groups).map(([creatorId, creatorStories]) => {
      const latestStory = creatorStories[creatorStories.length - 1];
      return {
        creatorId,
        creatorName: latestStory.creatorId === currentUser.uid ? "Your Story" : latestStory.creatorName,
        creatorImage: latestStory.creatorImage,
        stories: creatorStories,
        latestStoryCreatedAt: latestStory.createdAt
      };
    }).sort((a, b) => new Date(b.latestStoryCreatedAt).getTime() - new Date(a.latestStoryCreatedAt).getTime());

    // Move current user's album to the very top (first element) of the albums list
    const myAlbumIndex = albums.findIndex(a => a.creatorId === currentUser.uid);
    if (myAlbumIndex > -1) {
      const [myAlbum] = albums.splice(myAlbumIndex, 1);
      albums.unshift(myAlbum);
    }

    return albums;
  }, [activeStories, currentUser.uid]);

  const viewerStories = useMemo(() => {
    if (!selectedAlbumCreatorId) return [];
    return storyAlbums.find(a => a.creatorId === selectedAlbumCreatorId)?.stories || [];
  }, [selectedAlbumCreatorId, storyAlbums]);

  // Auto-advance active story
  useEffect(() => {
    if (activeStoryIndex === null || showViewersSheet || selectedProfileUser || isPaused || viewerStories.length === 0) return;
    
    const timer = setTimeout(() => {
      if (activeStoryIndex < viewerStories.length - 1) {
        setActiveStoryIndex(activeStoryIndex + 1);
      } else {
        setActiveStoryIndex(null); // close at the end
        setSelectedAlbumCreatorId(null);
      }
    }, 5000); // 5s per story

    return () => clearTimeout(timer);
  }, [activeStoryIndex, viewerStories.length, showViewersSheet, selectedProfileUser, isPaused]);

  const currentActiveStory = activeStoryIndex !== null && viewerStories[activeStoryIndex] ? viewerStories[activeStoryIndex] : null;

  // Trigger onViewStory when story is opened
  useEffect(() => {
    if (currentActiveStory && currentActiveStory.creatorId !== currentUser.uid && onViewStory) {
      onViewStory(currentActiveStory.storyId);
    }
  }, [currentActiveStory?.storyId, currentUser.uid, onViewStory]);

  const triggerVibrate = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const handlePostStory = (e: React.FormEvent) => {
    e.preventDefault();
    if (storyType === 'photo' && !selectedImage) {
      alert('Please select or upload an image for your photo story!');
      return;
    }
    if (storyType === 'text' && !storyText.trim()) return;

    const bgToUse = storyType === 'photo' ? 'linear-gradient(135deg, #111 0%, #000 100%)' : selectedBg;
    const imgToUse = storyType === 'photo' ? selectedImage : undefined;

    onAddStory(storyText.trim(), bgToUse, imgToUse || undefined, selectedMentions);
    setStoryText('');
    setSelectedImage(null);
    setImageUrlInput('');
    setShowUrlField(false);
    setSelectedMentions([]);
    setShowMentionPicker(false);
    setShowAddModal(false);
    triggerVibrate();
  };

  const handleLike = (storyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const story = stories.find(s => s.storyId === storyId);
    if (story && story.creatorId === currentUser.uid) {
      alert("You cannot like your own story status.");
      return;
    }
    onLikeStory(storyId);
    triggerVibrate();
  };

  const handleSendReply = (e: React.FormEvent, storyId: string) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    onReplyStory(storyId, replyText.trim());
    setReplyText('');
    alert('Story reply sent as a secure chat message!');
    triggerVibrate();
  };

  const handlePreviousStory = () => {
    if (activeStoryIndex !== null && activeStoryIndex > 0) {
      setActiveStoryIndex(activeStoryIndex - 1);
    }
  };

  const handleNextStory = () => {
    if (activeStoryIndex !== null) {
      if (activeStoryIndex < viewerStories.length - 1) {
        setActiveStoryIndex(activeStoryIndex + 1);
      } else {
        setActiveStoryIndex(null);
        setSelectedAlbumCreatorId(null);
      }
    }
  };

  // Touch gesture handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Horizontal swipe threshold: 45px
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 45) {
      if (deltaX < 0) {
        handleNextStory(); // Swiped left -> next story
      } else {
        handlePreviousStory(); // Swiped right -> prev story
      }
    } else if (deltaY > 60 && Math.abs(deltaY) > Math.abs(deltaX)) {
      // Swiped down -> close story viewer
      setActiveStoryIndex(null);
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  return (
    <div className="flex flex-col h-full bg-black transition-colors duration-300">
      
      {/* Stories Page Header */}
      <div className="p-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Stories</span>
            <span className="text-xs bg-[#1DB954]/15 text-[#1DB954] rounded-full px-2 py-0.5 font-bold border border-[#1DB954]/20 animate-pulse">
              Live
            </span>
          </h1>
          <p className="text-xs text-[#8E8E93] mt-1">
            Status updates that vanish in 24 hours. Swipe to move and view them.
          </p>
        </div>
      </div>

      {/* Stories list network panel */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        
        {/* Your Story Row/Card */}
        <div className="bg-[#121212] border border-[#262626] rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="relative">
              {currentUser.profileImage.startsWith('data:') ? (
                <img 
                  src={currentUser.profileImage} 
                  alt={currentUser.fullName} 
                  className="w-12 h-12 rounded-full object-cover border-2 border-[#1DB954]" 
                />
              ) : (
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-base font-bold"
                  style={{ background: getAvatarGradient(currentUser.profileImage) }}
                >
                  {currentUser.fullName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1DB954] rounded-full flex items-center justify-center text-white border-2 border-black">
                <Plus className="w-3.5 h-3.5" />
              </span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Your Story Status</h3>
              <p className="text-[11px] text-[#8E8E93] mt-0.5">Share photos, text and mention contacts.</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md active:scale-95"
          >
            Create Status
          </button>
        </div>

        {/* Stories list title */}
        <div className="text-[10px] font-bold text-[#8E8E93] tracking-wider uppercase pl-1 flex items-center gap-1.5 pt-2">
          <Clock className="w-3.5 h-3.5" />
          <span>Recent Updates ({storyAlbums.length} Albums)</span>
        </div>

        {storyAlbums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4 border border-[#262626] bg-[#0A0A0A] rounded-3xl">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1E] border border-[#262626] flex items-center justify-center mb-3">
              <Book className="w-5 h-5 text-zinc-500" />
            </div>
            <h3 className="text-sm font-semibold text-white">No active stories</h3>
            <p className="text-xs text-[#8E8E93] max-w-[220px] mt-1 leading-relaxed">
              When users post status updates, they will appear here. Be the first to share!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {storyAlbums.map((album) => {
              const coverStory = album.stories[album.stories.length - 1];
              const isLiked = coverStory.likes.includes(currentUser.uid);
              return (
                <div
                  key={album.creatorId}
                  onClick={() => {
                    setSelectedAlbumCreatorId(album.creatorId);
                    setActiveStoryIndex(0); // Open album starting with the first story
                    setShowViewersSheet(false);
                  }}
                  className="relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all border border-[#262626] group"
                  style={coverStory.image ? { backgroundImage: `url(${coverStory.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: coverStory.bgColor }}
                >
                  {/* Album Badge */}
                  <span className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-md bg-[#1DB954]/25 text-[#1DB954] font-bold text-[9px] border border-[#1DB954]/30 shadow-sm">
                    {album.stories.length} status{album.stories.length > 1 ? 'es' : ''}
                  </span>

                  {/* Hover dark tint or backdrop blur overlay */}
                  <div className={`absolute inset-0 transition-colors ${coverStory.image ? 'bg-black/35 backdrop-blur-[1px] group-hover:bg-black/45' : 'bg-black/10 group-hover:bg-black/20'}`} />

                  {/* Gradient overlays for readability */}
                  <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/60 to-transparent p-2.5 flex items-center gap-1.5">
                    {album.creatorImage.startsWith('data:') ? (
                      <img 
                        src={album.creatorImage} 
                        alt={album.creatorName} 
                        className="w-6 h-6 rounded-full object-cover" 
                      />
                    ) : (
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                        style={{ background: getAvatarGradient(album.creatorImage) }}
                      >
                        {album.creatorName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[11px] font-bold text-white truncate">{album.creatorName}</span>
                  </div>

                  {/* Central Text content */}
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <p className="text-center font-bold text-sm tracking-tight text-white leading-snug line-clamp-4 drop-shadow-md">
                      {coverStory.text}
                    </p>
                  </div>

                  {/* Mentions preview tag */}
                  {coverStory.mentions && coverStory.mentions.length > 0 && (
                    <div className="absolute top-10 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-md border border-white/10 text-[9px] font-bold text-[#1DB954]">
                      <AtSign className="w-2.5 h-2.5" />
                      <span>{coverStory.mentions.length}</span>
                    </div>
                  )}

                  {/* Bottom interactions preview */}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between text-white text-[10px]">
                    <span className="text-zinc-300">
                      {new Date(coverStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={(e) => handleLike(coverStory.storyId, e)}
                      className="flex items-center gap-1 p-1 hover:scale-110 active:scale-95 transition-all text-white"
                    >
                      <Heart className={`w-3.5 h-3.5 ${isLiked ? 'text-red-500 fill-red-500' : 'text-zinc-300'}`} />
                      {coverStory.creatorId === currentUser.uid && (
                        <span>{coverStory.likes.length}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ================= MODAL: ADD STORY ================= */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-[#121212] border border-[#262626] rounded-3xl overflow-hidden p-5 relative shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-[#1C1C1E] text-zinc-400 hover:text-white border border-[#262626] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h2 className="text-base font-bold text-white mb-0.5">Create Story Status</h2>
              <p className="text-xs text-[#8E8E93] mb-3.5">Share photos, captions, and mention contacts.</p>

              {/* Story Type Selector Tabs */}
              <div className="flex bg-[#1C1C1E] p-1 rounded-xl border border-[#262626] mb-3">
                <button
                  type="button"
                  onClick={() => setStoryType('photo')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    storyType === 'photo' ? 'bg-[#1DB954] text-black shadow-md' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Image className="w-3.5 h-3.5" />
                  <span>Photo Story</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStoryType('text')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    storyType === 'text' ? 'bg-[#1DB954] text-black shadow-md' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Book className="w-3.5 h-3.5" />
                  <span>Text Status</span>
                </button>
              </div>

              <form onSubmit={handlePostStory} className="space-y-3">
                {storyType === 'photo' ? (
                  <div className="space-y-2.5">
                    {/* Photo Uploader / URL toggle */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <span>Select Photo</span>
                        <button
                          type="button"
                          onClick={() => setShowUrlField(!showUrlField)}
                          className="text-[#1DB954] hover:underline cursor-pointer"
                        >
                          {showUrlField ? 'Upload File' : 'Use Image URL'}
                        </button>
                      </div>

                      {showUrlField ? (
                        <div className="flex gap-1.5">
                          <input
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            value={imageUrlInput}
                            onChange={(e) => setImageUrlInput(e.target.value)}
                            className="flex-1 bg-[#1C1C1E] border border-[#262626] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (imageUrlInput.trim()) {
                                setSelectedImage(imageUrlInput.trim());
                              }
                            }}
                            className="px-3 py-1.5 bg-[#1DB954] text-black text-xs font-bold rounded-xl cursor-pointer"
                          >
                            Set
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setSelectedImage(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="hidden"
                            id="story-photo-upload"
                          />
                          <label
                            htmlFor="story-photo-upload"
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#1C1C1E] border border-[#262626] hover:bg-[#2C2C2E] rounded-xl text-xs font-semibold text-zinc-300 cursor-pointer transition-colors"
                          >
                            <Image className="w-4 h-4 text-[#1DB954]" />
                            <span>{selectedImage ? 'Change Selected Photo' : 'Choose Photo File...'}</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Photo Preview with WhatsApp style caption input */}
                    <div className="relative aspect-[3/4] bg-[#1C1C1E] border border-[#262626] rounded-2xl overflow-hidden flex flex-col justify-end p-3">
                      {selectedImage ? (
                        <img 
                          src={selectedImage} 
                          alt="Story preview" 
                          className="absolute inset-0 w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                          <Image className="w-8 h-8 text-zinc-600 mb-2" />
                          <p className="text-xs text-zinc-500">No photo selected yet</p>
                        </div>
                      )}

                      {/* WhatsApp Style Caption Box */}
                      <div className="relative z-10 w-full bg-black/75 backdrop-blur-md rounded-2xl border border-white/10 p-2">
                        <input
                          type="text"
                          maxLength={120}
                          placeholder="Add a caption..."
                          value={storyText}
                          onChange={(e) => setStoryText(e.target.value)}
                          className="w-full bg-transparent text-white text-xs font-medium placeholder-zinc-400 outline-none px-2"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Background preset selector */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Background Color</label>
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
                        {SPOTIFY_BG_PRESETS.map((preset, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => setSelectedBg(preset)}
                            className={`w-7 h-7 rounded-full flex-shrink-0 cursor-pointer border transition-all ${
                              selectedBg === preset ? 'border-white scale-110' : 'border-transparent'
                            }`}
                            style={{ background: preset }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Text Status Editor Box */}
                    <div 
                      className="aspect-[3/4] rounded-2xl flex flex-col items-center justify-center p-5 relative border border-[#262626] overflow-hidden"
                      style={{ background: selectedBg }}
                    >
                      <textarea
                        required
                        maxLength={140}
                        placeholder="Type your status here..."
                        value={storyText}
                        onChange={(e) => setStoryText(e.target.value)}
                        className="w-full bg-transparent text-center text-white font-bold text-base leading-snug border-none outline-none resize-none placeholder-white/60 focus:ring-0 placeholder-center z-10"
                        rows={4}
                      />
                      <span className="absolute bottom-3 right-3 text-[10px] font-semibold text-white/70 z-10">
                        {140 - storyText.length} left
                      </span>
                    </div>
                  </div>
                )}

                {/* ================= MENTIONS PICKER IN STORY ================= */}
                <div className="space-y-2 pt-1 border-t border-[#262626]">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowMentionPicker(!showMentionPicker)}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#1DB954] hover:underline cursor-pointer"
                    >
                      <AtSign className="w-3.5 h-3.5" />
                      <span>{showMentionPicker ? 'Done Tagging' : 'Mention Contacts'}</span>
                    </button>
                    {selectedMentions.length > 0 && (
                      <span className="text-[10px] font-bold text-zinc-400">
                        {selectedMentions.length} tagged
                      </span>
                    )}
                  </div>

                  {/* Selected Mentions Badges */}
                  {selectedMentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMentions.map(username => (
                        <span 
                          key={username}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/40 text-[#1DB954] text-[10px] font-bold"
                        >
                          <span>@{username}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedMentions(prev => prev.filter(u => u !== username))}
                            className="hover:text-white cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Mention Picker List */}
                  {showMentionPicker && (
                    <div className="p-2.5 bg-[#1C1C1E] border border-[#262626] rounded-2xl space-y-2 max-h-36 overflow-y-auto no-scrollbar">
                      <input
                        type="text"
                        placeholder="Search contact to tag..."
                        value={mentionSearch}
                        onChange={(e) => setMentionSearch(e.target.value)}
                        className="w-full bg-[#121212] border border-[#262626] rounded-xl px-2.5 py-1 text-xs text-white placeholder-zinc-500 outline-none"
                      />
                      <div className="space-y-1">
                        {users.filter(u => u.uid !== currentUser.uid && (
                          u.fullName.toLowerCase().includes(mentionSearch.toLowerCase()) ||
                          u.username.toLowerCase().includes(mentionSearch.toLowerCase())
                        )).map(u => {
                          const isTagged = selectedMentions.includes(u.username);
                          return (
                            <button
                              key={u.uid}
                              type="button"
                              onClick={() => {
                                if (isTagged) {
                                  setSelectedMentions(prev => prev.filter(name => name !== u.username));
                                } else {
                                  setSelectedMentions(prev => [...prev, u.username]);
                                }
                              }}
                              className={`w-full p-1.5 rounded-xl flex items-center justify-between text-xs font-semibold cursor-pointer transition-colors ${
                                isTagged ? 'bg-[#1DB954]/20 text-[#1DB954]' : 'hover:bg-[#2C2C2E] text-zinc-300'
                              }`}
                            >
                              <span className="truncate">{u.fullName} (@{u.username})</span>
                              {isTagged ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={storyType === 'photo' ? !selectedImage : !storyText.trim()}
                  className="w-full py-2.5 bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-40 text-black font-bold rounded-xl transition-all cursor-pointer shadow-md text-xs"
                >
                  Post Story
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= MODAL: STORY VIEWER MODAL ================= */}
      <AnimatePresence>
        {currentActiveStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center select-none"
          >
            <div 
              className="w-full max-w-sm h-full flex flex-col relative overflow-hidden bg-black" 
              style={currentActiveStory.image ? {} : { background: currentActiveStory.bgColor }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onMouseDown={() => setIsPaused(true)}
              onMouseUp={() => setIsPaused(false)}
            >
              
              {/* Photo Story Image */}
              {currentActiveStory.image && (
                <img 
                  src={currentActiveStory.image} 
                  alt="Story content" 
                  className="absolute inset-0 w-full h-full object-cover z-0"
                  referrerPolicy="no-referrer"
                />
              )}
              
              {/* TOP progress indicators */}
              <div className="absolute top-3 inset-x-4 flex gap-1 z-20">
                {viewerStories.map((_, index) => (
                  <div key={index} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
                    <div 
                      className={`h-full bg-white transition-all duration-[5000ms] ease-linear ${
                        index < (activeStoryIndex || 0) ? 'w-full' :
                        index === activeStoryIndex ? (isPaused ? 'w-full opacity-60' : 'w-full animate-pulse') : 'w-0'
                      }`}
                    />
                  </div>
                ))}
              </div>

              {/* Header profile details (WhatsApp style: tap to open Creator Profile) */}
              <div className="absolute top-7 inset-x-4 flex items-center justify-between z-20 text-white">
                <div 
                  onClick={() => {
                    const creator = users.find(u => u.uid === currentActiveStory.creatorId);
                    if (creator) setSelectedProfileUser(creator);
                  }}
                  className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 cursor-pointer hover:bg-black/70 active:scale-95 transition-all"
                  title="View creator profile"
                >
                  {currentActiveStory.creatorImage.startsWith('data:') ? (
                    <img src={currentActiveStory.creatorImage} alt={currentActiveStory.creatorName} className="w-7 h-7 rounded-full object-cover border border-white/20" />
                  ) : (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: getAvatarGradient(currentActiveStory.creatorImage) }}>
                      {currentActiveStory.creatorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold leading-none flex items-center gap-1">
                      <span>{currentActiveStory.creatorId === currentUser.uid ? "Your Story" : currentActiveStory.creatorName}</span>
                      <span className="text-[10px] text-[#1DB954]">›</span>
                    </h4>
                    <span className="text-[9px] text-zinc-300">
                      {new Date(currentActiveStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* WhatsApp style: Go to chat button right in header if viewing another user's story */}
                  {currentActiveStory.creatorId !== currentUser.uid && onOpenChat && (
                    <button
                      onClick={() => {
                        onOpenChat(currentActiveStory.creatorId);
                        setActiveStoryIndex(null);
                      }}
                      className="p-1.5 px-3 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs flex items-center gap-1 cursor-pointer shadow-md transition-all active:scale-95"
                      title="Open chat"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>
                  )}

                  <button
                    onClick={() => setActiveStoryIndex(null)}
                    className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white cursor-pointer border border-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tap Left / Right Overlay Touch Areas for story navigation */}
              <div 
                onClick={handlePreviousStory}
                className="absolute left-0 inset-y-16 w-1/3 z-10 cursor-pointer"
                title="Tap for previous story"
              />
              <div 
                onClick={handleNextStory}
                className="absolute right-0 inset-y-16 w-2/3 z-10 cursor-pointer"
                title="Tap for next story"
              />

              {/* Story Content Workspace */}
              <div className="flex-1 flex flex-col justify-center items-center px-6 pt-20 pb-24 z-20 relative pointer-events-none">
                {!currentActiveStory.image ? (
                  <p className="text-center font-bold text-2xl tracking-tight text-white leading-snug drop-shadow-lg">
                    {currentActiveStory.text}
                  </p>
                ) : (
                  currentActiveStory.text && (
                    <div className="mt-auto mb-2 w-full max-w-[90%] bg-black/75 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-white text-sm font-medium text-center shadow-2xl">
                      {currentActiveStory.text}
                    </div>
                  )
                )}

                {/* Mentions in Story Viewer */}
                {currentActiveStory.mentions && currentActiveStory.mentions.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5 pointer-events-auto z-20">
                    {currentActiveStory.mentions.map(username => {
                      const mentionedUser = users.find(u => u.usernameLower === username.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
                      return (
                        <button
                          key={username}
                          type="button"
                          onClick={() => {
                            if (mentionedUser) {
                              setSelectedProfileUser(mentionedUser);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-[#1DB954]/50 text-[#1DB954] text-xs font-bold shadow-lg hover:bg-[#1DB954]/20 cursor-pointer transition-all"
                        >
                          <AtSign className="w-3 h-3" />
                          <span>{username}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Liking status bar / My story views details */}
              <div className="p-4 bg-gradient-to-t from-black/85 to-transparent flex flex-col gap-3.5 z-20">
                {currentActiveStory.creatorId === currentUser.uid ? (
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between text-white">
                      <button 
                        type="button"
                        onClick={() => setShowViewersSheet(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold transition-all cursor-pointer"
                      >
                        <Eye className="w-4 h-4 text-emerald-400" />
                        <span>{currentActiveStory.views?.length || 0} Views</span>
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => handleLike(currentActiveStory.storyId, e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold transition-all cursor-pointer"
                      >
                        <Heart className={`w-4 h-4 ${currentActiveStory.likes.includes(currentUser.uid) ? 'text-red-500 fill-red-500' : 'text-white'}`} />
                        <span>{currentActiveStory.likes.includes(currentUser.uid) ? 'Liked' : 'Like'} ({currentActiveStory.likes.length})</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400 text-center italic">
                      This is your story status. Tap "Views" to see who has viewed it.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-white">
                      <div className="flex items-center gap-1 text-zinc-400">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold">Likes Private</span>
                      </div>
                      
                      <button
                        onClick={(e) => handleLike(currentActiveStory.storyId, e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold transition-all cursor-pointer"
                      >
                        <Heart className={`w-4 h-4 ${currentActiveStory.likes.includes(currentUser.uid) ? 'text-red-500 fill-red-500' : 'text-white'}`} />
                        <span>{currentActiveStory.likes.includes(currentUser.uid) ? 'Liked' : 'Like'}</span>
                      </button>
                    </div>

                    {/* Reply section: direct message reply */}
                    <form onSubmit={(e) => handleSendReply(e, currentActiveStory.storyId)} className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        placeholder={currentActiveStory.creatorId === currentUser.uid ? "Comment on your story..." : `Reply to ${currentActiveStory.creatorName}...`}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="flex-1 bg-white/10 border border-white/20 rounded-xl py-2.5 px-4 text-xs text-white placeholder-white/60 outline-none focus:bg-white/15"
                      />
                      <button
                        type="submit"
                        className="p-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full transition-all active:scale-95 cursor-pointer shadow-md"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </>
                )}
              </div>

              {/* ================= BOTTOM SHEET: STORY VIEWERS ================= */}
              <AnimatePresence>
                {showViewersSheet && currentActiveStory.creatorId === currentUser.uid && (
                  <motion.div 
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                    className="absolute bottom-0 inset-x-0 bg-[#121212] border-t border-[#262626] rounded-t-3xl max-h-[55%] flex flex-col z-30 shadow-2xl pointer-events-auto"
                  >
                    {/* Drawer Header */}
                    <div className="p-4 pb-2 border-b border-[#262626] flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-[#1DB954]" />
                        <span>Story Viewers ({currentActiveStory.views?.length || 0})</span>
                      </h4>
                      <button 
                        type="button"
                        onClick={() => setShowViewersSheet(false)}
                        className="p-1.5 rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] text-zinc-400 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Drawer Body - Viewers List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar">
                      {(!currentActiveStory.views || currentActiveStory.views.length === 0) ? (
                        <div className="py-12 text-center text-zinc-500 text-xs leading-relaxed max-w-[200px] mx-auto">
                          No views yet. When your active contacts view this story status, they will appear here!
                        </div>
                      ) : (
                        currentActiveStory.views.map(viewerId => {
                          const viewer = users.find(u => u.uid === viewerId);
                          if (!viewer) return null;
                          const isViewerCustomImg = viewer.profileImage.startsWith('data:');
                          const hasLiked = currentActiveStory.likes.includes(viewerId);
                          return (
                            <div 
                              key={viewerId} 
                              onClick={() => setSelectedProfileUser(viewer)}
                              className="flex items-center justify-between py-1 px-1.5 rounded-xl hover:bg-[#1C1C1E] cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                {isViewerCustomImg ? (
                                  <img src={viewer.profileImage} alt={viewer.fullName} className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: getAvatarGradient(viewer.profileImage) }}>
                                    {viewer.fullName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-bold text-white">{viewer.fullName}</p>
                                  <p className="text-[10px] text-[#8E8E93]">@{viewer.username}</p>
                                </div>
                              </div>
                              {hasLiked && (
                                <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ================= MODAL: CREATOR / TAGGED USER PROFILE (WHATSAPP STYLE) ================= */}
              <AnimatePresence>
                {selectedProfileUser && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/85 backdrop-blur-md z-40 flex items-center justify-center p-4 pointer-events-auto"
                    onClick={() => setSelectedProfileUser(null)}
                  >
                    <motion.div
                      initial={{ scale: 0.92, y: 15 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.92, y: 15 }}
                      className="w-full max-w-xs bg-[#1A1A1C] border border-[#2A2A2E] rounded-3xl p-5 shadow-2xl text-center space-y-4 relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedProfileUser(null)}
                        className="absolute top-3 right-3 p-1.5 rounded-full bg-[#2A2A2E] text-zinc-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      {/* Avatar */}
                      <div className="pt-2">
                        {selectedProfileUser.profileImage.startsWith('data:') ? (
                          <img src={selectedProfileUser.profileImage} alt={selectedProfileUser.fullName} className="w-16 h-16 rounded-full object-cover mx-auto shadow-md border border-white/20" />
                        ) : (
                          <div 
                            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto shadow-md"
                            style={{ background: getAvatarGradient(selectedProfileUser.profileImage) }}
                          >
                            {selectedProfileUser.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <h3 className="text-sm font-bold text-white mt-2">{selectedProfileUser.fullName}</h3>
                        <p className="text-[11px] text-[#1DB954] font-semibold">@{selectedProfileUser.username}</p>
                        {selectedProfileUser.bio && (
                          <p className="text-xs text-zinc-400 mt-2 italic px-2">"{selectedProfileUser.bio}"</p>
                        )}
                      </div>

                      {/* Phone & Status Info */}
                      <div className="bg-[#121214] border border-[#262626] rounded-xl p-3 text-left space-y-1.5 text-xs">
                        <div className="flex justify-between text-zinc-400">
                          <span>Phone:</span>
                          <span className="text-white font-medium">{selectedProfileUser.phone || 'Private'}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Status:</span>
                          <span className={selectedProfileUser.online ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                            {selectedProfileUser.online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2 pt-1">
                        {onOpenChat && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChat(selectedProfileUser.uid);
                              setSelectedProfileUser(null);
                              setActiveStoryIndex(null);
                            }}
                            className="w-full py-2.5 bg-[#1DB954] hover:bg-[#1ed760] active:scale-95 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Go to Chat</span>
                          </button>
                        )}

                        {onViewUserProfile && (
                          <button
                            type="button"
                            onClick={() => {
                              onViewUserProfile(selectedProfileUser.uid);
                              setSelectedProfileUser(null);
                              setActiveStoryIndex(null);
                            }}
                            className="w-full py-2 bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                          >
                            View Full Profile
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}