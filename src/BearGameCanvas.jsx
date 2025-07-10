// FULL VERSION WITH LOCAL DAMAGE STATE AND KNOCKBACK
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
  const localPlayerStates = useRef({});
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

          if (!localPlayerStates.current[id]) {
            localPlayerStates.current[id] = { health: other.health, vx: 0, vy: 0 };
          }
          localPlayerStates.current[id].health = Math.max(0, other.health - 10);
          localPlayerStates.current[id].vx = Math.cos(angle) * 5;
          localPlayerStates.current[id].vy = Math.sin(angle) * 5;
        }
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') return;
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

            if (!localPlayerStates.current[id]) {
              localPlayerStates.current[id] = { health: other.health, vx: 0, vy: 0 };
            }
            localPlayerStates.current[id].health = Math.max(0, other.health - 30);
            localPlayerStates.current[id].vx = Math.cos(angle) * 10;
            localPlayerStates.current[id].vy = Math.sin(angle) * 10;
          }
        });
      }
      keys.current[e.key] = true;
    };

    const handleKeyUp = (e) => keys.current[e.key] = false;
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mousePosRef.current.x = e.clientX - rect.left;
      mousePosRef.current.y = e.clientY - rect.top;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);

    onValue(ref(db, 'players'), (snapshot) => {
      const data = snapshot.val() || {};
      const others = {};
      Object.entries(data).forEach(([id, player]) => {
        if (id !== playerId.current) others[id] = player;
      });
      otherPlayersRef.current = others;
    });

    const draw = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#3e5e36";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawBear = (id, player) => {
        const local = localPlayerStates.current[id];
        const health = local?.health ?? player.health;
        const slash = player.slash;
        const angle = player.angle;

        if (health <= 0) return;

        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(angle - Math.PI / 2);
        ctx.drawImage(bearImgRef.current, -40, -40, 80, 80);
        ctx.restore();

        ctx.fillStyle = "red";
        ctx.fillRect(player.x - 40, player.y - 70, 80, 5);
        ctx.fillStyle = "lime";
        ctx.fillRect(player.x - 40, player.y - 70, (health / 100) * 80, 5);

        if (slash && Date.now() - slash.timestamp < 300) {
          ctx.save();
          ctx.translate(slash.x, slash.y);
          ctx.rotate(slash.angle);
          ctx.strokeStyle = 'silver';
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const offsetY = -10 + i * 10;
            ctx.beginPath();
            ctx.moveTo(0, offsetY);
            ctx.lineTo(25, offsetY - 5);
            ctx.stroke();
          }
          ctx.restore();
        }
      };

      drawBear("you", playerRef.current);
      Object.entries(otherPlayersRef.current).forEach(([id, player]) => {
        drawBear(id, player);
      });
    };

    const update = () => {
      const player = playerRef.current;
      if (!chatActive && !isDead) {
        if (keys.current['w']) player.vy -= player.speed;
        if (keys.current['s']) player.vy += player.speed;
        if (keys.current['a']) player.vx -= player.speed;
        if (keys.current['d']) player.vx += player.speed;

        player.vx *= 0.85;
        player.vy *= 0.85;
        player.x += player.vx;
        player.y += player.vy;
      }

      const dx = mousePosRef.current.x - player.x;
      const dy = mousePosRef.current.y - player.y;
      player.angle = Math.atan2(dy, dx);

      if (clawTimeRef.current > 0) clawTimeRef.current--;
      if (dashCooldownRef.current > 0) dashCooldownRef.current--;

      syncToFirebase();
    };

    const loop = () => {
      update();
      draw();
      requestAnimationFrame(loop);
    };

    loop();
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}
