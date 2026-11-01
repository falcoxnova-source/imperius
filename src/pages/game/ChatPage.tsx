import { MessagesSquare } from 'lucide-react';
import { PublicChat } from '../../components/game/PublicChat';

/**
 * Pagina dedicada al chat publico global.
 * Existe para que el chat sea accesible con un solo clic desde el menu y
 * desde la Vista General, sin tener que entrar a Mensajes -> Publico.
 */
export function ChatPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessagesSquare className="w-7 h-7 text-cyber-blue" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-orbitron font-bold text-white">
            Chat Público
          </h1>
          <p className="text-sm text-gray-400">
            Habla con todos los jugadores del universo en tiempo real.
          </p>
        </div>
      </div>

      <PublicChat />
    </div>
  );
}
