# Password Setup Instructions

## Current Situation

The admin user (`admin@company.com`) has a **fake bcrypt hash** stored in the database. To use proper bcrypt hashing, you need to update the password.

## Option 1: Update Password via Script (Recommended)

1. **Edit the script**: Open `scripts/updateAdminPassword.js`
2. **Set your password**: Change `PLAIN_PASSWORD = 'admin123'` to your desired password
3. **Run the script**:
   ```bash
   cd Backend/expert-claims-backend
   node scripts/updateAdminPassword.js
   ```
4. **Update frontend**: Change `getPasswordForBackend()` to send plain passwords:
   ```typescript
   // In Login.tsx, change:
   const passwordToSend = getPasswordForBackend(formData.password, true);
   // To:
   const passwordToSend = formData.password; // Send plain password
   ```

## Option 2: Update via Supabase SQL

Run this SQL in Supabase SQL Editor (replace `'your_password_here'` with actual password):

```sql
-- First, generate bcrypt hash (you'll need to do this in Node.js or use online tool)
-- Then update:
UPDATE users 
SET password_hash = '$2b$10$YOUR_GENERATED_BCRYPT_HASH_HERE',
    updated_time = NOW()
WHERE email = 'admin@company.com' 
  AND role = 'admin';
```

To generate bcrypt hash, use Node.js:
```javascript
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('your_password_here', 10);
console.log(hash);
```

## Option 3: Update via Admin Panel (After Login)

1. Login with current fake hash system
2. Go to Admin Panel → User Management
3. Edit the admin user
4. Reset password (this will create proper bcrypt hash)

## After Updating Password

1. **Frontend**: Update `Login.tsx` to send plain passwords:
   ```typescript
   // Change all instances of:
   const passwordToSend = getPasswordForBackend(formData.password, true);
   // To:
   const passwordToSend = formData.password;
   ```

2. **Backend**: Already supports proper bcrypt comparison ✅

3. **Test**: Try logging in with the new password

## Security Notes

- ✅ Passwords are sent over HTTPS (secure)
- ✅ Backend uses bcrypt with 10 salt rounds
- ✅ Each password gets a unique hash (even same password = different hash)
- ✅ Backend compares plain password with stored hash using `bcrypt.compare()`

## Migration Path

1. **Phase 1** (Current): Support both fake hashes and real bcrypt
2. **Phase 2**: Update all existing users to real bcrypt hashes
3. **Phase 3**: Remove fake hash support






