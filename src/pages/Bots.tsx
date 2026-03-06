import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { listBots } from "../lib/api";
import { useApi } from "../hooks/useApi";
import BotCard from "../components/bots/BotCard";
import CreateBotModal from "../components/bots/CreateBotModal";
import Button from "../components/ui/Button";

export default function Bots() {
  const { data, loading, error, refetch } = useApi(listBots, [], 15_000);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Bots</h1>
          <p className="text-sm text-[oklch(50%_0.01_260)] mt-0.5">
            {data
              ? `${data.bots.length} Bot${data.bots.length !== 1 ? "s" : ""} configured`
              : "Loading…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowModal(true)}
          >
            <Plus size={14} />
            Create bot
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 px-4 py-3 text-sm text-[oklch(70%_0.18_25)]">
          {error}
        </div>
      )}

      {/* Bot list */}
      {data && data.bots.length > 0 ? (
        <div className="space-y-3">
          {data.bots.map((bot) => (
            <BotCard key={bot.name} bot={bot} onRefresh={refetch} />
          ))}
        </div>
      ) : !loading ? (
        <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-12 text-center">
          <p className="text-sm text-[oklch(45%_0.01_260)]">
            No bots configured.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={() => setShowModal(true)}
          >
            <Plus size={14} />
            Create first bot
          </Button>
        </div>
      ) : null}

      {showModal && (
        <CreateBotModal
          onClose={() => setShowModal(false)}
          onCreated={refetch}
        />
      )}
    </div>
  );
}
