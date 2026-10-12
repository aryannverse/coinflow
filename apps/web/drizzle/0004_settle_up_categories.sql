INSERT INTO categories (user_id, name, emoji, color, kind, sort, system) VALUES
  (NULL, 'Settle up',          '🤝', '#9BA59F', 'expense', 1000, true),
  (NULL, 'Settle up received', '🤝', '#9BA59F', 'income',  1000, true)
ON CONFLICT ON CONSTRAINT categories_owner_name_kind DO NOTHING;
