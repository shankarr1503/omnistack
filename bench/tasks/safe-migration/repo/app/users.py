def get_user(db, user_id):
    return db.fetch_one("SELECT id, email, name FROM users WHERE id = %s", [user_id])

def rename_user(db, user_id, new_name):
    db.execute("UPDATE users SET name = %s, updated_at = now() WHERE id = %s", [new_name, user_id])
