# Quick Start Guide - LibraSaaS Role Dashboards

Get the dashboards running in minutes.

## ✅ Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- Existing LibraSaaS project setup

## 🚀 Setup Steps

### 1. Install Dependencies (if not already installed)
```bash
pnpm install swr
```

### 2. Verify File Structure
All files are already created in your project:
```
✓ app/dashboard/library/[libraryId]/page.tsx
✓ app/dashboard/member/[libraryId]/page.tsx
✓ app/api/libraries/[libraryId]/books/route.ts
✓ components/dashboard/library/*.tsx
✓ components/dashboard/member/*.tsx
✓ hooks/use-library.ts
✓ hooks/use-session.ts
✓ components/role-guard.tsx
✓ lib/api.ts
✓ lib/types.ts
```

### 3. Start Dev Server
```bash
pnpm dev
```

### 4. Test the Dashboards

#### LibraryAdmin Dashboard
```
http://localhost:3000/dashboard/library/lib-001
```

Features to test:
- [ ] Stats cards load correctly
- [ ] Search books (try "gatsby")
- [ ] Filter by category
- [ ] Click "Add Book" button
- [ ] Fill form and submit
- [ ] Edit/Delete actions (in dropdown)
- [ ] Recent transactions table

#### Member Dashboard
```
http://localhost:3000/dashboard/member/lib-001
```

Features to test:
- [ ] Search for books (try "gatsby")
- [ ] Click "Borrow" button
- [ ] View "My Books" section
- [ ] Click "Renew" button
- [ ] Edit profile
- [ ] Save profile changes

## 🔧 Configuration

### Mock Session (Default)
Currently using mock user:
```tsx
// hooks/use-session.ts
const mockUser = {
  id: '1',
  email: 'user@librasaas.com',
  name: 'John Doe',
  role: 'libraryAdmin',
  libraryId: 'lib-001',
}
```

**To test with different roles:**
1. Open `hooks/use-session.ts`
2. Change `role: 'libraryAdmin'` to `'member'` or `'superadmin'`
3. Change `libraryId: 'lib-001'` to test isolation

### Mock Data
Mock API responses are in:
- `app/api/libraries/[libraryId]/stats/route.ts`
- `app/api/libraries/[libraryId]/books/route.ts`
- `app/api/libraries/[libraryId]/transactions/route.ts`
- `app/api/users/[userId]/route.ts`

**To add more mock books:**
```tsx
// In app/api/libraries/[libraryId]/books/route.ts
const MOCK_BOOKS = {
  'lib-001': [
    {
      id: 'book-new',
      title: 'Your Book Title',
      author: 'Author Name',
      isbn: '978-0000000000',
      category: 'Fiction',
      available: 5,
      total: 5,
    },
    // ... more books
  ],
}
```

## 🎯 Common Tasks

### Change Role for Testing
```tsx
// hooks/use-session.ts - Line 20
role: 'member' // Change this
```

### Add Toast Notification
```tsx
import { useToast } from '@/hooks/use-toast'

const { toast } = useToast()

// In event handler:
toast({
  title: 'Success',
  description: 'Book borrowed successfully!',
})

// Error toast:
toast({
  title: 'Error',
  description: 'Failed to borrow book',
  variant: 'destructive',
})
```

### Access User Info
```tsx
import { useSession } from '@/hooks/use-session'

const { user } = useSession()

console.log(user?.role)     // 'libraryAdmin'
console.log(user?.libraryId) // 'lib-001'
```

### Get libraryId in Component
```tsx
import { useLibrary } from '@/hooks/use-library'

const { libraryId } = useLibrary()

// Use in API calls:
const { data } = useSWR(
  `/api/libraries/${libraryId}/books`
)
```

## 📡 API Response Examples

### Get Stats
```bash
curl http://localhost:3000/api/libraries/lib-001/stats
```

Response:
```json
{
  "totalBooks": 523,
  "totalMembers": 120,
  "overdueBooks": 8,
  "totalFines": 2500
}
```

### Search Books
```bash
curl "http://localhost:3000/api/libraries/lib-001/books/search?q=gatsby"
```

Response:
```json
[
  {
    "id": "book-1",
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "isbn": "978-0743273565",
    "category": "Fiction",
    "available": 3,
    "total": 5
  }
]
```

### Get User Profile
```bash
curl http://localhost:3000/api/users/1
```

Response:
```json
{
  "id": "1",
  "name": "John Doe",
  "email": "john@librasaas.com",
  "phone": "+91-9876543210",
  "address": "123 Main St, City, Country",
  "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=John",
  "membershipDate": "2023-01-15"
}
```

## 🔐 Role-Based Access

### LibraryAdmin Dashboard (Only Admin)
```tsx
<RoleGuard allowedRoles={['libraryAdmin', 'superadmin']}>
  {/* Dashboard content */}
</RoleGuard>
```

If wrong role → Redirects to `/unauthorized`

### Member Dashboard (All Roles)
```tsx
<RoleGuard allowedRoles={['member', 'libraryAdmin', 'superadmin']}>
  {/* Dashboard content */}
</RoleGuard>
```

## 🛠 Troubleshooting

### "libraryId not found" Error
**Problem:** Page shows error about missing libraryId
**Solution:** 
1. Check URL: `http://localhost:3000/dashboard/library/lib-001`
2. Verify libraryId matches mock data (currently `lib-001`)
3. Check route params: `[libraryId]` should be in path

### "Cannot find module" Error
**Problem:** Import error for a component
**Solution:**
1. Run `pnpm install` again
2. Check file path spelling
3. Restart dev server: `pnpm dev`

### Stats Cards Show 0
**Problem:** Stats not loading correctly
**Solution:**
1. Open Network tab in browser DevTools
2. Check `/api/libraries/lib-001/stats` response
3. Verify mock data in `route.ts` has `lib-001` key

### Toast Notifications Not Showing
**Problem:** Toast messages don't appear
**Solution:**
1. Check import: `import { useToast } from '@/hooks/use-toast'`
2. Verify `<Toaster />` is in root layout
3. Check browser console for errors

### SWR Not Caching
**Problem:** Data fetches every time
**Solution:**
1. Check SWR options: `revalidateOnFocus: false`
2. Verify `dedupingInterval: 30000` is set
3. Use `mutate()` to manually revalidate

## 📚 Documentation Files

- **DASHBOARD_IMPLEMENTATION.md** - Complete feature guide
- **ARCHITECTURE.md** - System design & data flows
- **QUICK_START.md** - This file

## 🚀 Next Steps (For Production)

1. **Replace Mock Auth**
   ```tsx
   // hooks/use-session.ts
   // Import from your auth provider
   // Remove mock user
   ```

2. **Connect Real Database**
   ```tsx
   // app/api/libraries/[libraryId]/books/route.ts
   // Replace MOCK_BOOKS with database queries
   const books = await db.books.findMany({
     where: { libraryId }
   })
   ```

3. **Add Form Validation**
   ```bash
   pnpm add zod react-hook-form
   ```

4. **Implement Error Boundaries**
   ```tsx
   // Create error.tsx files
   // Wrap components with ErrorBoundary
   ```

5. **Add Real Auth Headers**
   ```tsx
   // lib/api.ts
   const headers = {
     'Authorization': `Bearer ${token}`,
   }
   ```

## 📞 Support

For issues or questions:
1. Check the ARCHITECTURE.md file
2. Review DASHBOARD_IMPLEMENTATION.md
3. Check console logs in DevTools
4. Verify mock data in API routes

## ✨ Features Included

**LibraryAdmin Dashboard:**
- ✓ Stats cards (Books, Members, Overdue, Fines)
- ✓ Books table with search & filter
- ✓ Add/Edit/Delete books
- ✓ Recent transactions view
- ✓ Loading states & empty states
- ✓ Responsive design

**Member Dashboard:**
- ✓ Search books in real-time
- ✓ Borrow books
- ✓ View my borrowed books
- ✓ Renew books
- ✓ Edit profile
- ✓ Save profile changes
- ✓ Responsive design

**Shared Features:**
- ✓ Role-based access control
- ✓ Multi-tenant architecture
- ✓ Toast notifications
- ✓ Dark mode support
- ✓ TypeScript types
- ✓ SWR caching
- ✓ Loading skeletons
- ✓ Error handling

---

**Ready to go!** Your dashboards are fully functional with mock data. 🎉
