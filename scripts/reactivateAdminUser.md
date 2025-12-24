# Reactivate Admin User

The admin user exists in the database but has `deleted_flag = true`. 

## Option 1: Update via Supabase Dashboard

1. Go to Supabase Dashboard → Table Editor → `users` table
2. Find the user with `email = 'admin@company.com'`
3. Edit the row and set `deleted_flag` to `false`
4. Save the changes

## Option 2: Update via SQL Query

Run this SQL query in Supabase SQL Editor:

```sql
UPDATE users 
SET deleted_flag = false,
    updated_time = NOW()
WHERE email = 'admin@company.com' 
  AND role = 'admin';
```

## Option 3: Use the API (if you have another admin account)

If you have access to another admin account, you can use the update user endpoint:

```bash
PATCH /admin/updateuser
{
  "user_id": 1,
  "deleted_flag": false
}
```

However, the current `updateUser` endpoint might not support updating `deleted_flag` directly.

## After Reactivating

Once `deleted_flag` is set to `false`, the login should work. The user can then login with:
- Email: `admin@company.com`
- Password: (the plain text password that was hashed to `$2b$10$g10hvh3ng10hvh1tg10hvhwg10hvh40g10hvh20g10hvh10g10hvhig10hvh3t`)

Note: The password hash shown is the bcrypt hash. You'll need to know the original plain text password to login, or reset it.






