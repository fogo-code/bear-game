// FINAL CLEANED VERSION WITH GHOST FIX, COLLISION, SLASH & CHARGE DAMAGE, AND RESPAWN
import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, onValue, remove, onDisconnect } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  const canvasRef = useRef(null);
  const playerId = useRef(localStorage.getItem("bearPlayerId") || (() => {
    const id = uuidv4();
    localStorage.setItem("bearPlayerId", id);
    return id;
  })());

  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 2, vx: 0, vy: 0, angle: 0, health: 100, slash: null });
  const otherPlayersRef = useRef({});
  const localPlayerStates = useRef({});
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const bearImgRef = useRef(new Image());
  const bearLoadedRef = useRef(false);
  const [isDead, setIsDead] = useState(false);
  const [respawnTimer, setRespawnTimer] = useState(0);

  const syncToFirebase = () => {
    const p = playerRef.current;
    set(ref(db, `players/${playerId.current}`), {
      x: p.x,
      y: p.y,
      angle: p.angle ?? 0,
      health: p.health,
      username: "Player",
      slash: p.slash ?? null
    });
  };

  useEffect(() => {
    if (isDead) {
      setRespawnTimer(3);
      const countdown = setInterval(() => {
        setRespawnTimer(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setIsDead(false);
            playerRef.current.health = 100;
            playerRef.current.x = Math.random() * 700 + 50;
            playerRef.current.y = Math.random() * 500 + 50;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [isDead]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    bearImgRef.current.src = process.env.PUBLIC_URL + "/bear.png";
    bearImgRef.current.onload = () => (bearLoadedRef.current = true);

    const handleClick = () => {
      if (clawTimeRef.current > 0 || isDead) return;
      const player = playerRef.current;
      const mouse = mousePosRef.current;
      const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      const slash = {
        x: player.x + Math.cos(angle) * (player.radius + 5),
        y: player.y + Math.sin(angle) * (player.radius + 5),
        angle,
        timestamp: Date.now()
      };
      player.slash = slash;
      clawTimeRef.current = 10;

      Object.entries(otherPlayersRef.current).forEach(([id]) => {
        const state = localPlayerStates.current[id];
        if (!state || state.health <= 0) return;
        const dx = state.x - slash.x;
        const dy = state.y - slash.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 50 && Date.now() - (state._lastHit || 0) > 300) {
          state.health = Math.max(0, state.health - 10);
          state.vx += Math.cos(angle) * 6;
          state.vy += Math.sin(angle) * 6;
          state._lastHit = Date.now();
        }
      });
    };

    const handleKeyDown = (e) => {
      if (isDead) return;
      if (e.key === 'e' && dashCooldownRef.current <= 0) {
        const p = playerRef.current;
        const angle = p.angle;
        p.vx += Math.cos(angle) * 10;
        p.vy += Math.sin(angle) * 10;
        dashCooldownRef.current = 60;

        Object.entries(otherPlayersRef.current).forEach(([id]) => {
          const state = localPlayerStates.current[id];
          if (!state || state.health <= 0) return;
          const dx = state.x - p.x;
          const dy = state.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 60 && Date.now() - (state._lastCharge || 0) > 500) {
            state.health = Math.max(0, state.health - 30);
            state.vx += Math.cos(angle) * 12;
            state.vy += Math.sin(angle) * 12;
            state._lastCharge = Date.now();
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
        if (id !== playerId.current) {
          if (!localPlayerStates.current[id]) {
            localPlayerStates.current[id] = { ...player, vx: 0, vy: 0 };
          }
          others[id] = player;
        }
      });
      otherPlayersRef.current = others;
    });

    const draw = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#3e5e36";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawBear = (id, p) => {
        const state = localPlayerStates.current[id] || p;
        const health = state.health ?? p.health;
        const x = state.x ?? p.x;
        const y = state.y ?? p.y;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.angle - Math.PI / 2);
        ctx.drawImage(bearImgRef.current, -40, -40, 80, 80);
        ctx.restore();

        if (p.slash && Date.now() - p.slash.timestamp < 300) {
          ctx.save();
          ctx.translate(p.slash.x, p.slash.y);
          ctx.rotate(p.slash.angle);
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(0, -10 + i * 10);
            ctx.lineTo(25, -15 + i * 10);
            ctx.stroke();
          }
          ctx.restore();
        }

        ctx.fillStyle = "red";
        ctx.fillRect(x - 40, y - 70, 80, 5);
        ctx.fillStyle = "lime";
        ctx.fillRect(x - 40, y - 70, (health / 100) * 80, 5);
      };

      drawBear("you", playerRef.current);
      Object.entries(otherPlayersRef.current).forEach(([id, p]) => drawBear(id, p));

      if (isDead && respawnTimer > 0) {
        ctx.fillStyle = 'white';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Respawning in ${respawnTimer}...`, canvas.width / 2, canvas.height / 2);
      }
    };

    const update = () => {
      const p = playerRef.current;
      if (!isDead) {
        if (keys.current['w']) p.vy -= p.speed;
        if (keys.current['s']) p.vy += p.speed;
        if (keys.current['a']) p.vx -= p.speed;
        if (keys.current['d']) p.vx += p.speed;

        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;

        Object.entries(otherPlayersRef.current).forEach(([id, other]) => {
          const state = localPlayerStates.current[id];
          if (!state) return;
          const dx = p.x - state.x;
          const dy = p.y - state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = p.radius * 1.6;
          if (dist < minDist) {
            const angle = Math.atan2(dy, dx);
            const overlap = minDist - dist;
            p.x += Math.cos(angle) * (overlap / 2);
            p.y += Math.sin(angle) * (overlap / 2);
            state.x -= Math.cos(angle) * (overlap / 2);
            state.y -= Math.sin(angle) * (overlap / 2);
          }
        });
      }

      Object.entries(localPlayerStates.current).forEach(([id, state]) => {
        state.vx *= 0.9;
        state.vy *= 0.9;
        state.x += state.vx;
        state.y += state.vy;
      });

      const dx = mousePosRef.current.x - p.x;
      const dy = mousePosRef.current.y - p.y;
      p.angle = Math.atan2(dy, dx);

      if (clawTimeRef.current > 0) clawTimeRef.current--;
      if (dashCooldownRef.current > 0) dashCooldownRef.current--;

      if (p.health <= 0 && !isDead) setIsDead(true);

      syncToFirebase();
    };

    const loop = () => {
      update();
      draw();
      requestAnimationFrame(loop);
    };

    loop();
    onDisconnect(ref(db, `players/${playerId.current}`)).remove();
    return () => remove(ref(db, `players/${playerId.current}`));
  }, [isDead]);

  return <canvas ref={canvasRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}
