/**
 * API Base URL configuration.
 * 
 * In development (local):
 * - If you are using the proxy in package.json, this can remain empty string or relative path.
 * - However, to support standard deployment where frontend and backend are on different domains,
 *   we default to 'http://localhost:5000' if no env var is set.
 * 
 * In production (Vercel/Render):
 * - Set REACT_APP_API_URL environment variable to your backend URL (e.g., https://my-backend.onrender.com)
 */

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
