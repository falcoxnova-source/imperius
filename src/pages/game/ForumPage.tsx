import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Plus, ArrowLeft, Pin, Lock, Eye, Clock, User, Send, Trash2, Edit3, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatRelativeDate } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { resolveAvatarUrl } from '../../lib/avatar';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ForumCategory {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

interface ForumTopic {
  id: string;
  category_id: string;
  user_id: string;
  title: string;
  is_pinned: boolean;
  is_locked: boolean;
  views: number;
  created_at: string;
  updated_at: string;
  author?: { username: string; avatar_url: string | null };
  reply_count?: number;
  last_post_at?: string;
  last_post_by?: string;
}

interface ForumPost {
  id: string;
  topic_id: string;
  user_id: string;
  content: string;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  author?: { username: string; avatar_url: string | null };
}

type View = 'categories' | 'topics' | 'thread';

// ─── Página principal ────────────────────────────────────────────────────────

export function ForumPage() {
  const { t } = useI18n();
  const [view, setView] = useState<View>('categories');
  const [selectedCategory, setSelectedCategory] = useState<ForumCategory | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<ForumTopic | null>(null);

  const goToTopics = (cat: ForumCategory) => {
    setSelectedCategory(cat);
    setView('topics');
  };

  const goToThread = (topic: ForumTopic) => {
    setSelectedTopic(topic);
    setView('thread');
  };

  const goBack = () => {
    if (view === 'thread') {
      setView('topics');
      setSelectedTopic(null);
    } else if (view === 'topics') {
      setView('categories');
      setSelectedCategory(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {view !== 'categories' && (
          <button onClick={goBack} className="p-2 hover:bg-space-600 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
        )}
        <h1 className="font-orbitron text-xl sm:text-2xl text-white flex items-center gap-2">
          <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8 text-cyber-blue flex-shrink-0" />
          Foro
        </h1>
      </div>

      {view === 'categories' && <CategoryList onSelect={goToTopics} />}
      {view === 'topics' && selectedCategory && (
        <TopicList category={selectedCategory} onSelect={goToThread} />
      )}
      {view === 'thread' && selectedTopic && (
        <ThreadView topic={selectedTopic} onBack={goBack} />
      )}
    </div>
  );
}

// ─── Lista de categorías ─────────────────────────────────────────────────────

function CategoryList({ onSelect }: { onSelect: (cat: ForumCategory) => void }) {
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(() => {
    setLoading(true);
    setError(null);
    supabase
      .from('forum_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error: err }) => {
        if (err) { setError('El foro no está disponible aún. Ejecuta la migración SQL en Supabase.'); setLoading(false); return; }
        if (data) setCategories(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Error al cargar el foro. Verifica que las tablas existan en Supabase.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-glass p-6 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-cyber-yellow mx-auto" />
        <p className="text-gray-300">{error}</p>
        <button onClick={loadCategories} className="btn-secondary text-sm px-4 py-2 inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat)}
          className="card-glass p-4 text-left hover:border-cyber-blue/40 transition-all group"
        >
          <h3 className="font-orbitron text-white group-hover:text-cyber-blue transition-colors">
            {cat.name}
          </h3>
          {cat.description && (
            <p className="text-sm text-gray-400 mt-1">{cat.description}</p>
          )}
        </button>
      ))}
      {categories.length === 0 && (
        <p className="text-center text-gray-500 py-8">No hay categorías aún.</p>
      )}
    </div>
  );
}

// ─── Lista de temas ──────────────────────────────────────────────────────────

function TopicList({
  category,
  onSelect,
}: {
  category: ForumCategory;
  onSelect: (topic: ForumTopic) => void;
}) {
  const { profile } = useAuthStore();
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadTopics = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('forum_topics')
      .select('*, author:profiles!forum_topics_user_id_fkey(username, avatar_url)')
      .eq('category_id', category.id)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    if (err) { setError('Error al cargar los temas.'); setLoading(false); return; }
    if (!data) { setLoading(false); return; }

    // Get reply counts and last post info
    const topicIds = data.map((t) => t.id);
    const { data: counts } = await supabase
      .from('forum_posts')
      .select('topic_id')
      .in('topic_id', topicIds);

    const countMap: Record<string, number> = {};
    counts?.forEach((p) => {
      countMap[p.topic_id] = (countMap[p.topic_id] || 0) + 1;
    });

    const enriched = data.map((t) => ({
      ...t,
      reply_count: countMap[t.id] || 0,
    }));

    setTopics(enriched);
    setLoading(false);
  }, [category.id]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`forum_topics_${category.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics', filter: `category_id=eq.${category.id}` }, () => loadTopics())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [category.id, loadTopics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-glass p-6 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-cyber-yellow mx-auto" />
        <p className="text-gray-300">{error}</p>
        <button onClick={loadTopics} className="btn-secondary text-sm px-4 py-2 inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-orbitron text-lg text-white">{category.name}</h2>
        {profile && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-cyber-blue/20 text-cyber-blue rounded-lg hover:bg-cyber-blue/30 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo tema
          </button>
        )}
      </div>

      {showCreate && (
        <CreateTopicForm
          categoryId={category.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadTopics(); }}
        />
      )}

      {topics.map((topic) => (
        <button
          key={topic.id}
          onClick={() => onSelect(topic)}
          className="card-glass p-3 sm:p-4 text-left hover:border-cyber-blue/40 transition-all group w-full"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {topic.is_pinned && <Pin className="w-3.5 h-3.5 text-cyber-yellow flex-shrink-0" />}
                {topic.is_locked && <Lock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
                <h3 className="font-semibold text-white group-hover:text-cyber-blue transition-colors truncate text-sm sm:text-base">
                  {topic.title}
                </h3>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {(topic.author as any)?.username || '...'}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  {topic.reply_count || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {topic.views}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeDate(topic.updated_at)}
                </span>
              </div>
            </div>
          </div>
        </button>
      ))}

      {topics.length === 0 && !showCreate && (
        <p className="text-center text-gray-500 py-8">No hay temas en esta categoría. ¡Sé el primero en crear uno!</p>
      )}
    </div>
  );
}

// ─── Vista de hilo (posts) ───────────────────────────────────────────────────

function ThreadView({ topic, onBack }: { topic: ForumTopic; onBack: () => void }) {
  const { profile } = useAuthStore();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('forum_posts')
      .select('*, author:profiles!forum_posts_user_id_fkey(username, avatar_url)')
      .eq('topic_id', topic.id)
      .order('created_at', { ascending: true });

    if (err) { setError('Error al cargar los mensajes.'); setLoading(false); return; }
    if (data) setPosts(data);
    setLoading(false);

    // Increment view count
    supabase.rpc('increment_forum_view', { p_topic_id: topic.id }).then();
  }, [topic.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`forum_posts_${topic.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_posts', filter: `topic_id=eq.${topic.id}` }, () => loadPosts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [topic.id, loadPosts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-glass p-6 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-cyber-yellow mx-auto" />
        <p className="text-gray-300">{error}</p>
        <button onClick={loadPosts} className="btn-secondary text-sm px-4 py-2 inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          {topic.is_pinned && <Pin className="w-4 h-4 text-cyber-yellow" />}
          {topic.is_locked && <Lock className="w-4 h-4 text-gray-500" />}
          <h2 className="font-orbitron text-lg sm:text-xl text-white">{topic.title}</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Por {(topic.author as any)?.username} · {formatRelativeDate(topic.created_at)} · {topic.views} visitas
        </p>
      </div>

      <div className="space-y-3">
        {posts.map((post) => (
          <div key={post.id} className="card-glass p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              {resolveAvatarUrl(post.author?.avatar_url) ? (
                <img src={resolveAvatarUrl(post.author?.avatar_url)!} alt="" className="w-7 h-7 rounded-full object-cover border border-cyber-blue/30" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-cyber-blue/20 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-cyber-blue" />
                </div>
              )}
              <div>
                <span className="text-sm text-white font-medium">{post.author?.username || '...'}</span>
                <span className="text-xs text-gray-500 ml-2">{formatRelativeDate(post.created_at)}</span>
                {post.is_edited && <span className="text-xs text-gray-600 ml-1">(editado)</span>}
              </div>
              {profile && profile.id === post.user_id && (
                <div className="ml-auto flex gap-1">
                  <button className="p-1 hover:bg-space-600 rounded text-gray-500 hover:text-gray-300 transition-colors" title="Editar">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400 transition-colors" title="Eliminar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{post.content}</p>
          </div>
        ))}
      </div>

      {posts.length === 0 && (
        <p className="text-center text-gray-500 py-8">No hay respuestas aún. ¡Sé el primero en responder!</p>
      )}

      {!topic.is_locked && profile && (
        <ReplyForm topicId={topic.id} onReplied={loadPosts} />
      )}

      {topic.is_locked && (
        <div className="flex items-center gap-2 text-sm text-gray-500 justify-center py-2">
          <Lock className="w-4 h-4" />
          Este tema está cerrado. No se pueden añadir respuestas.
        </div>
      )}
    </div>
  );
}

// ─── Formulario: Crear tema ──────────────────────────────────────────────────

function CreateTopicForm({
  categoryId,
  onClose,
  onCreated,
}: {
  categoryId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuthStore();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !title.trim() || !content.trim()) return;

    setSaving(true);
    setError('');

    // Crear el tema
    const { data: topic, error: topicError } = await supabase
      .from('forum_topics')
      .insert({ category_id: categoryId, user_id: profile.id, title: title.trim() })
      .select('id')
      .single();

    if (topicError || !topic) {
      setError('Error al crear el tema.');
      setSaving(false);
      return;
    }

    // Crear el primer post
    const { error: postError } = await supabase
      .from('forum_posts')
      .insert({ topic_id: topic.id, user_id: profile.id, content: content.trim() });

    if (postError) {
      setError('Error al crear el contenido.');
      setSaving(false);
      return;
    }

    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="card-glass p-4 space-y-3">
      <h3 className="font-orbitron text-white">Nuevo tema</h3>
      <input
        type="text"
        placeholder="Título del tema..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input-cyber"
        maxLength={120}
        required
      />
      <textarea
        placeholder="Escribe tu mensaje..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="input-cyber min-h-[100px] resize-y"
        maxLength={5000}
        required
      />
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="btn-cyber text-sm px-4 py-2">
          {saving ? 'Creando...' : 'Crear tema'}
        </button>
      </div>
    </form>
  );
}

// ─── Formulario: Responder ───────────────────────────────────────────────────

function ReplyForm({ topicId, onReplied }: { topicId: string; onReplied: () => void }) {
  const { profile } = useAuthStore();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !content.trim()) return;

    setSaving(true);
    setError('');

    const { error: postError } = await supabase
      .from('forum_posts')
      .insert({ topic_id: topicId, user_id: profile.id, content: content.trim() });

    if (postError) {
      setError('Error al publicar la respuesta.');
      setSaving(false);
      return;
    }

    setContent('');
    setSaving(false);
    onReplied();
  };

  return (
    <form onSubmit={handleSubmit} className="card-glass p-3 sm:p-4 space-y-3">
      <h3 className="font-orbitron text-sm text-white flex items-center gap-2">
        <Send className="w-4 h-4 text-cyber-blue" />
        Responder
      </h3>
      <textarea
        placeholder="Escribe tu respuesta..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="input-cyber min-h-[80px] resize-y"
        maxLength={5000}
        required
      />
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-cyber text-sm px-4 py-2 flex items-center gap-2">
          <Send className="w-4 h-4" />
          {saving ? 'Publicando...' : 'Publicar'}
        </button>
      </div>
    </form>
  );
}
