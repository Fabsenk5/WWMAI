# Feature Wishlist Implementation Guide

Use this guide to reimplement the Feature Wishlist in your WWMAI project.

## 1. Backend Setup (Drizzle ORM & Express)

### Database Schema
Add this to your Drizzle schema definition.
```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const featureWishes = pgTable('feature_wishes', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    status: text('status', { enum: ['pending', 'completed'] }).default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    createdBy: uuid('created_by'), // Optional: requires User table reference
});
```

### Controller (`featureWishlistController.ts`)
Logic for CRUD operations. Replace `db` and `featureWishes` imports with your actual paths.

```typescript
import { Request, Response } from 'express';
import { db } from '../db';
import { featureWishes } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

const ADMIN_EMAIL = 'fabiank5@hotmail.com'; // Adjust or env var

export const featureWishlistController = {
    getAllWishes: async (req: Request, res: Response) => {
        try {
            const wishes = await db.select()
                .from(featureWishes)
                .orderBy(desc(featureWishes.createdAt));
            res.json(wishes);
        } catch (error) {
            res.status(500).json({ message: 'Failed to fetch wishes' });
        }
    },

    createWish: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            // Admin Check
            if (!user || user.email !== ADMIN_EMAIL) {
                return res.status(403).json({ message: 'Only admin can create wishes' });
            }
            const { title } = req.body;
            const [newWish] = await db.insert(featureWishes).values({
                title,
                status: 'pending',
                createdBy: user.id
            }).returning();
            res.status(201).json(newWish);
        } catch (error) {
            res.status(500).json({ message: 'Failed to create wish' });
        }
    },

    updateWishStatus: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user || user.email !== ADMIN_EMAIL) {
                return res.status(403).json({ message: 'Only admin can update wishes' });
            }
            const { id } = req.params;
            const { status } = req.body;
            const [updatedWish] = await db.update(featureWishes)
                .set({ status })
                .where(eq(featureWishes.id, id))
                .returning();
            res.json(updatedWish);
        } catch (error) {
            res.status(500).json({ message: 'Failed to update wish' });
        }
    },

    deleteWish: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user || user.email !== ADMIN_EMAIL) {
                return res.status(403).json({ message: 'Only admin can delete wishes' });
            }
            const { id } = req.params;
            await db.delete(featureWishes).where(eq(featureWishes.id, id));
            res.json({ message: 'Wish deleted' });
        } catch (error) {
            res.status(500).json({ message: 'Failed to delete wish' });
        }
    }
};
```

### Routes
```typescript
router.get('/feature-wishes', featureWishlistController.getAllWishes);
router.post('/feature-wishes', featureWishlistController.createWish);
router.put('/feature-wishes/:id/status', featureWishlistController.updateWishStatus);
router.delete('/feature-wishes/:id', featureWishlistController.deleteWish);
```

---

## 2. Frontend Implementation

### The Button (Styled)
Place this where you want the entry point (e.g., Header).
```tsx
import { Button } from '@/components/ui/button';

<Button
  variant="default"
  size="sm"
  onClick={() => window.location.href = '/feature-wishlist'}
  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0 text-xs h-7 px-2"
>
  Wishlist
</Button>
```

### The Page (`FeatureWishlist.tsx`)
Requires `lucide-react` icons and `shadcn/ui` components (`Button`, `Input`, `Checkbox`).

```tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2, CheckCircle2, Circle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
// import { api } from '@/lib/api'; // Your API client
// import { useAuth } from '@/contexts/AuthContext'; // Your Auth hook

interface Wish {
    id: string;
    title: string;
    status: 'pending' | 'completed';
    createdAt: string;
}

const ADMIN_EMAIL = 'fabiank5@hotmail.com'; // Adjust

export function FeatureWishlist() {
    const { user } = useAuth();
    const [wishes, setWishes] = useState<Wish[]>([]);
    const [loading, setLoading] = useState(true);
    const [newItem, setNewItem] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isAdmin = user?.email === ADMIN_EMAIL;

    useEffect(() => {
        fetchWishes();
    }, []);

    const fetchWishes = async () => {
        try {
            const { data } = await api.get('/feature-wishes');
            setWishes(data);
        } catch (error) {
            toast.error('Failed to load wishlist');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newItem.trim()) return;
        setIsSubmitting(true);
        try {
            await api.post('/feature-wishes', { title: newItem });
            setNewItem('');
            toast.success('Wish added!');
            fetchWishes();
        } catch (error) {
            toast.error('Failed to add wish');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (wish: Wish) => {
        if (!isAdmin) return;
        const newStatus = wish.status === 'pending' ? 'completed' : 'pending';
        setWishes(prev => prev.map(w => w.id === wish.id ? { ...w, status: newStatus } : w));
        try {
            await api.put(`/feature-wishes/${wish.id}/status`, { status: newStatus });
        } catch (error) {
            fetchWishes(); // Revert on error
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this wish?')) return;
        try {
            await api.delete(`/feature-wishes/${id}`);
            setWishes(prev => prev.filter(w => w.id !== id));
            toast.success('Deleted');
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Header */}
            <div className="flex items-center p-4 border-b">
                <Button variant="ghost" size="icon" onClick={() => window.location.href = '/'}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="ml-2 font-semibold">Feature Wishlist</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Hero Card */}
                <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-6 rounded-xl border border-indigo-500/20">
                    <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent mb-2">
                        Dream Big!
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Here is a list of features we are planning or dreaming about.
                    </p>
                </div>

                {/* Admin Input */}
                {isAdmin && (
                    <div className="flex gap-2">
                        <Input
                            placeholder="Add a new feature idea..."
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <Button
                            onClick={handleAdd}
                            disabled={isSubmitting || !newItem.trim()}
                            className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0"
                        >
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                )}

                {/* List */}
                <div className="space-y-3">
                    {wishes.map((wish) => (
                        <div
                            key={wish.id}
                            className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${wish.status === 'completed'
                                    ? 'bg-muted/30 border-transparent opacity-70'
                                    : 'bg-card border-border'
                                }`}
                        >
                            <button
                                onClick={() => handleToggleStatus(wish)}
                                disabled={!isAdmin}
                                className={`mt-0.5 ${isAdmin ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
                            >
                                {wish.status === 'completed' ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : (
                                    <Circle className="w-5 h-5 text-muted-foreground" />
                                )}
                            </button>

                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${wish.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                    {wish.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {new Date(wish.createdAt).toLocaleDateString()}
                                </p>
                            </div>

                            {isAdmin && (
                                <button
                                    onClick={() => handleDelete(wish.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```
