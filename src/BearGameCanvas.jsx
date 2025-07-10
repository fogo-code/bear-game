// FULL VERSION WITH FIXES FOR GHOST BEARS, POSITION RESET, AND SMOOTHER KNOCKBACK
import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, onValue, remove, push, onDisconnect } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  const canvasRef = useRef(null);
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
  const bearImgRef = useRef(new Image());
  const bearLoadedRef = useRef(false);
  const hasSyncedRef = useRef(false);

  let lastSyncTime = 0;
  const syncToFirebase = () => {
    const now = Date.now();
    if (now - lastSyncTime < 150) return;
    lastSyncTime = now;
    const p = playerRef.current;
    set(ref(db, `players/${playerId.current}`), {
      x: p.x,
      y: p.y,
      angle: p.angle ?? 0,
      health: p.health,
      username: "Player",
      slash: p.slash ?? null
    });
    hasSyncedRef.current = true;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    bearImgRef.current.src = process.env.PUBLIC_URL + "/bear.png";
    bearImgRef.current.onload = () => (bearLoadedRef.current = true);

    const handleClick = () => {
      if (clawTimeRef.current > 0) return;
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

      Object.entries(otherPlayersRef.current).forEach(([id, other]) => {
        const dx = other.x - slash.x;
        const dy = other.y - slash.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 50) {
          if (!localPlayerStates.current[id]) localPlayerStates.current[id] = { health: 100, vx: 0, vy: 0, x: other.x, y: other.y };
          localPlayerStates.current[id].health = Math.max(0, (localPlayerStates.current[id].health ?? 100) - 10);
          localPlayerStates.current[id].vx = Math.cos(angle) * 5;
          localPlayerStates.current[id].vy = Math.sin(angle) * 5;
        }
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'e' && dashCooldownRef.current <= 0) {
        const p = playerRef.current;
        const angle = p.angle;
        p.vx += Math.cos(angle) * 10;
        p.vy += Math.sin(angle) * 10;
        dashCooldownRef.current = 60;

        Object.entries(otherPlayersRef.current).forEach(([id, other]) => {
          const dx = other.x - p.x;
          const dy = other.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 60) {
            if (!localPlayerStates.current[id]) localPlayerStates.current[id] = { health: 100, vx: 0, vy: 0, x: other.x, y: other.y };
            localPlayerStates.current[id].health = Math.max(0, (localPlayerStates.current[id].health ?? 100) - 30);
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
      if (!hasSyncedRef.current) return;
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

      const drawBear = (id, p) => {
        const state = localPlayerStates.current[id] || {};
        const health = state.health ?? p.health;

        ctx.save();
        ctx.translate(p.x, p.y);
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
        ctx.fillRect(p.x - 40, p.y - 70, 80, 5);
        ctx.fillStyle = "lime";
        ctx.fillRect(p.x - 40, p.y - 70, (health / 100) * 80, 5);
      };

      drawBear("you", playerRef.current);
      Object.entries(otherPlayersRef.current).forEach(([id, p]) => drawBear(id, p));
    };

    const update = () => {
      const p = playerRef.current;
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
        if (state) {
          state.x = (state.x ?? other.x) + (state.vx ?? 0);
          state.y = (state.y ?? other.y) + (state.vy ?? 0);
          state.vx *= 0.9;
          state.vy *= 0.9;
          other.x = state.x;
          other.y = state.y;

          const dx = p.x - other.x;
          const dy = p.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = p.radius * 1.6;
          if (dist < minDist) {
            const angle = Math.atan2(dy, dx);
            const overlap = minDist - dist;
            p.x += Math.cos(angle) * (overlap / 2);
            p.y += Math.sin(angle) * (overlap / 2);
          }
        }
      });

      const dx = mousePosRef.current.x - p.x;
      const dy = mousePosRef.current.y - p.y;
      p.angle = Math.atan2(dy, dx);

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
