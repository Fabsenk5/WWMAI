import { v4 as uuidv4 } from 'uuid';

// Rename playerId to userId for consistency
export const getUserId = () => {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = uuidv4(); // Generate a new UUID
    localStorage.setItem('userId', userId); // Store it in localStorage
  }
  return userId;
};