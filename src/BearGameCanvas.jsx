import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, onValue, remove, push, onDisconnect } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  useEffect(() => {
    if (!isDead || respawnCountdown !== null) return;

    let countdown = 3;
    setRespawnCountdown(countdown);

    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        setRespawnCountdown(null);
        setIsDead(false);
        playerRef.current.health = 100;
        playerRef.current.x = Math.random() * 700 + 50;
        playerRef.current.y = Math.random() * 500 + 50;
        chatMessageRef.current = null;
        lastChatRef.current = null;
        playerRef.current.slash = null;
        syncToFirebase();
      } else {
        setRespawnCountdown(countdown);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isDead, respawnCountdown]);
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const playerId = useRef(
    localStorage.getItem("bearPlayerId") || (() => {
      const id = uuidv4();
      localStorage.setItem("bearPlayerId", id);
      return id;
    })()
  );

  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 4, angle: 0, health: 100, slash: null });
  const otherPlayersRef = useRef({});
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const slashPosRef = useRef({ x: 0, y: 0, angle: 0 });
  const bearImgRef = useRef(new Image());
  const bearLoadedRef = useRef(false);
  const chatMessageRef = useRef(null);
  const chatTimerRef = useRef(0);
  const [inputValue, setInputValue] = useState("");
  const lastChatRef = useRef(null);
  const [chatActive, setChatActive] = useState(false);
  const [respawnCountdown, setRespawnCountdown] = useState(null);
  const [isDead, setIsDead] = useState(false);

  let lastSyncTime = 0;
  const syncToFirebase = () => {
    if (isDead && playerRef.current.health <= 0) return;
    const now = Date.now();
    if (now - lastSyncTime < 150) return;
    lastSyncTime = now;
    const p = playerRef.current;
    const data = {
      x: p.x,
      y: p.y,
      angle: p.angle ?? 0,
      health: p.health,
      chat: chatMessageRef.current ?? lastChatRef.current ?? "",
      username: "Player",
      slash: p.slash ?? null
    };
    const playerRefPath = ref(db, `players/${playerId.current}`);
    onDisconnect(playerRefPath).remove();
    set(playerRefPath, data);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const localPlayerId = playerId.current;
    bearImgRef.current.src = process.env.PUBLIC_URL + "/bear.png";
    bearImgRef.current.onload = () => {
      bearLoadedRef.current = true;
      syncToFirebase();
    };

    const handleClick = () => {
      if (chatActive || clawTimeRef.current > 0 || isDead) return;
      const player = playerRef.current;
      const mouse = mousePosRef.current;
      const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      const slash = {
        x: player.x + Math.cos(angle) * (player.radius + 5),
        y: player.y + Math.sin(angle) * (player.radius + 5),
        angle,
        timestamp: Date.now()
      };
      slashPosRef.current = slash;
      playerRef.current.slash = slash;
      clawTimeRef.current = 10;
      syncToFirebase();
      Object.entries(otherPlayersRef.current).forEach(([id, other]) => {
        const dx = other.x - slash.x;
        const dy = other.y - slash.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 40 && other.health > 0) {
          push(ref(db, `damageEvents/${id}`), {
            from: localPlayerId,
            angle,
            timestamp: Date.now()
          });
        }
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        if (!chatActive) {
          setChatActive(true);
          keys.current = {};
          setTimeout(() => inputRef.current?.focus(), 0);
        }
        return;
      }

      if (!chatActive && document.activeElement !== inputRef.current) {
        keys.current[e.key] = true;
      }
    };

    const handleKeyUp = (e) => { keys.current[e.key] = false; };
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mousePosRef.current.x = e.clientX - rect.left;
      mousePosRef.current.y = e.clientY - rect.top;
    };
    const handleBeforeUnload = () => {
      remove(ref(db, `players/${localPlayerId}`));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("beforeunload", handleBeforeUnload);

    onValue(ref(db, 'players'), (snapshot) => {
      const data = snapshot.val() || {};
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([id]) => id !== localPlayerId)
      );
      otherPlayersRef.current = filtered;
      if (data[localPlayerId]?.health <= 0 && playerRef.current.health > 0 && !isDead && respawnCountdown === null) {
        playerRef.current.health = 0;
        setIsDead(true);
        syncToFirebase();
      }
    });

    onValue(ref(db, `damageEvents/${localPlayerId}`), (snapshot) => {
      const events = snapshot.val();
      if (!events) return;
      Object.entries(events).forEach(([id, event]) => {
        const damage = event.type === 'charge' ? 30 : 10;
        playerRef.current.health = Math.max(0, playerRef.current.health - damage);
        playerRef.current.x += Math.cos(event.angle) * 100;
        playerRef.current.y += Math.sin(event.angle) * 100;
        set(ref(db, `damageEvents/${localPlayerId}/${id}`), null);
        chatMessageRef.current = null;
        lastChatRef.current = null;
        playerRef.current.slash = null;
        console.log("✅ Player respawned");
        syncToFirebase();
      });
    });

    const gameLoop = () => {
      update();
      draw();
      requestAnimationFrame(gameLoop);
    };
    gameLoop();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      remove(ref(db, `players/${localPlayerId}`));
    };
  }, []);


  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute top-0 left-0 z-0"></canvas>
      {chatActive && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputValue.trim()) {
              chatMessageRef.current = inputValue.trim();
              lastChatRef.current = inputValue.trim();
              chatTimerRef.current = 180;
              setInputValue("");
              syncToFirebase();
            }
            setChatActive(false);
            keys.current = {};
          }}
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10"
        >
          <input
            ref={inputRef}
            type="text"
            className="p-2 rounded border border-gray-400 bg-white text-black"
            placeholder="Type your message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </form>
      )}
      {respawnCountdown !== null && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 text-white text-4xl font-bold">
          Respawning in {respawnCountdown}...
        </div>
      )}
    </div>
  );
}
