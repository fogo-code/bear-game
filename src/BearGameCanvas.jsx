import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, onValue, remove, push, onDisconnect } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const playerId = useRef(
    localStorage.getItem("bearPlayerId") || (() => {
      const id = uuidv4();
      localStorage.setItem("bearPlayerId", id);
      return id;
    })()
  );

  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 2, vx: 0, vy: 0, angle: 0, health: 100, slash: null });
  const otherPlayersRef = useRef({});
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const dashCooldownRef = useRef(0);
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

  useEffect(() => {
    if (!isDead) return;

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
  }, [isDead]);

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
    const ctx = canvas.getContext("2d");
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
            from: playerId.current,
            angle,
            type: 'slash',
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

        if (e.key === 'e' && dashCooldownRef.current <= 0) {
          const player = playerRef.current;
          const angle = player.angle;
          player.vx += Math.cos(angle) * 10;
          player.vy += Math.sin(angle) * 10;
          dashCooldownRef.current = 60;
          syncToFirebase();

          Object.entries(otherPlayersRef.current).forEach(([id, other]) => {
            const dx = other.x - player.x;
            const dy = other.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 50 && other.health > 0) {
              push(ref(db, `damageEvents/${id}`), {
                from: playerId.current,
                angle,
                type: 'charge',
                timestamp: Date.now()
              });
            }
          });
        }
      }
    };

    // ... rest of the existing handlers, update, draw, etc.

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClick);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute top-0 left-0 z-0"></canvas>
    </div>
  );
}
