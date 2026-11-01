-- =============================================================================
-- FORO del juego - Tablas y políticas de seguridad
-- =============================================================================

-- 1. Categorías del foro (creadas por admins)
CREATE TABLE IF NOT EXISTS forum_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Temas del foro (creados por usuarios)
CREATE TABLE IF NOT EXISTS forum_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  views INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Posts del foro (respuestas)
CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_forum_topics_category ON forum_topics(category_id, is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_topics_user ON forum_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_topic ON forum_posts(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON forum_posts(user_id);

-- Actualizar updated_at en topics
CREATE OR REPLACE FUNCTION update_forum_topic_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE forum_topics SET updated_at = now() WHERE id = NEW.topic_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forum_posts_timestamp ON forum_posts;
CREATE TRIGGER trg_forum_posts_timestamp
  AFTER INSERT OR UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_forum_topic_timestamp();

-- =============================================================================
-- RLS (Row Level Security)
-- =============================================================================

ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

-- Categorías: todos pueden leer, solo admins pueden crear/editar
CREATE POLICY "forum_categories_read_all" ON forum_categories
  FOR SELECT USING (is_active = true);

-- Temas: todos pueden leer, usuarios autenticados pueden crear
CREATE POLICY "forum_topics_read_all" ON forum_topics
  FOR SELECT USING (true);

CREATE POLICY "forum_topics_insert_auth" ON forum_topics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_topics_update_own" ON forum_topics
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "forum_topics_delete_own" ON forum_topics
  FOR DELETE USING (auth.uid() = user_id);

-- Posts: todos pueden leer, usuarios autenticados pueden crear
CREATE POLICY "forum_posts_read_all" ON forum_posts
  FOR SELECT USING (true);

CREATE POLICY "forum_posts_insert_auth" ON forum_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_posts_update_own" ON forum_posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "forum_posts_delete_own" ON forum_posts
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- Categorías por defecto
-- =============================================================================

INSERT INTO forum_categories (name, description, sort_order) VALUES
  ('General', 'Charlas generales sobre el juego', 1),
  ('Estrategia', 'Consejos, guías y estrategias', 2),
  ('Alianzas', 'Reclutamiento y diplomacia', 3),
  ('Mercado', 'Compra, venta e intercambios', 4),
  ('Sugerencias', 'Propón mejoras para el juego', 5)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- RPC: Incrementar vistas de un tema
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_forum_view(p_topic_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE forum_topics SET views = views + 1 WHERE id = p_topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
