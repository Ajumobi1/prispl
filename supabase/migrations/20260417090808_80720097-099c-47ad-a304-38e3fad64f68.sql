UPDATE auth.users
SET email = REPLACE(email, '@prisp.local', '@prsunitplatform.local')
WHERE email LIKE '%@prisp.local';