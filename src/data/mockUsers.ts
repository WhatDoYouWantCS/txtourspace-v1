import { User } from '../types';

// Let's create beautiful gradient avatars for users to keep the Apple iOS feel premium and clean.
export const getAvatarGradient = (username: string): string => {
  const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradients = [
    'linear-gradient(135deg, #FF5E62 0%, #FF9966 100%)', // Coral Sunset
    'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', // Minty Fresh
    'linear-gradient(135deg, #3a7bd5 0%, #3a6073 100%)', // Sea Blue
    'linear-gradient(135deg, #8A2387 0%, #E94057 50%, #F27121 100%)', // Premium Purple-Orange
    'linear-gradient(135deg, #00B4DB 0%, #0083B0 100%)', // Electric Blue
    'linear-gradient(135deg, #f12711 0%, #f5af19 100%)', // Sunlight Gold
    'linear-gradient(135deg, #aa076b 0%, #61045f 100%)', // Velvet Plum
    'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', // Classic Navy
  ];
  return gradients[hash % gradients.length];
};

export const MOCK_USERS: User[] = [];

export const getSimulatedResponse = (username: string, text: string): string => {
  return "Hey! Thanks for messaging.";
};
