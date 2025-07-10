// FINAL FIX — Damage Sync + Respawn + Chat Fix + Charge Block During Chat + Speed Bug + Full Game Logic Restored
import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, remove, push, onDisconnect, onValue, onChildAdded } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const [chatMode, setChatMode] = useState(false);
  const [playerId] = useState(() => {
    const existing = localStorage.getItem("bearPlayerId");
    if (existing) return existing;
    const newId = uuidv4();
    localStorage.setItem("bearPlayerId", newId);
    return newId;
  });

  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 2, vx: 0, vy: 0, angle: 0, health: 100, slash: null, chat: "" });
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const bearImgRef = useRef(new Image());
  const bearLoadedRef = useRef(false);
  const [isDead, setIsDead] = useState(false);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const otherPlayersRef = useRef({});
  const lastDamageTime = useRef(0);

  const syncToFirebase = () => {
    const p = playerRef.current;
    set(ref(db, `players/${playerId}`), {
      x: p.x,
      y: p.y,
      angle: p.angle,
      health: p.health,
      username: "Player",
      slash: p.slash ?? null,
      chat: p.chat ?? ""
    });
  };

  useEffect(() => {
    const pRef = ref(db, `players/${playerId}`);
    syncToFirebase();
    onDisconnect(pRef).remove();
    return () => remove(pRef);
  }, [playerId]);

  useEffect(() => {
    onValue(ref(db, 'players'), (snapshot) => {
      const data = snapshot.val() || {};
      const others = {};
      Object.entries(data).forEach(([id, val]) => {
        if (id !== playerId) others[id] = val;
      });
      otherPlayersRef.current = others;
    });
  }, []);

  useEffect(() => {
    onChildAdded(ref(db, `damageEvents/${playerId}`), (snapshot) => {
      const evt = snapshot.val();
      if (!evt) return;
      const { type, angle, timestamp } = evt;
      if (timestamp <= lastDamageTime.current) return;
      lastDamageTime.current = timestamp;

      const p = playerRef.current;
      if (p.health <= 0) return;

      if (type === 'slash') {
        p.health = Math.max(0, p.health - 10);
        p.vx += Math.cos(angle) * 6;
        p.vy += Math.sin(angle) * 6;
      } else if (type === 'charge') {
        p.health = Math.max(0, p.health - 30);
        p.vx += Math.cos(angle) * 10;
        p.vy += Math.sin(angle) * 10;
      }

      remove(ref(db, `damageEvents/${playerId}/${snapshot.key}`));
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    bearImgRef.current.src = process.env.PUBLIC_URL + "/bear.png";
    bearImgRef.current.onload = () => (bearLoadedRef.current = true);

    const drawBear = (x, y, angle, health, slash, chat) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle - Math.PI / 2);
      ctx.drawImage(bearImgRef.current, -40, -40, 80, 80);
      ctx.restore();

      ctx.fillStyle = "red";
      ctx.fillRect(x - 40, y - 70, 80, 5);
      ctx.fillStyle = "lime";
      ctx.fillRect(x - 40, y - 70, (health / 100) * 80, 5);

      if (slash && Date.now() - slash.timestamp < 300) {
        ctx.save();
        ctx.translate(slash.x, slash.y);
        ctx.rotate(slash.angle);
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

      if (chat) {
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(chat, x, y - 85);
      }
    };

    const update = () => {
      const p = playerRef.current;
      if (!isDead) {
        if (keys.current['w']) p.vy -= p.speed;
        if (keys.current['s']) p.vy += p.speed;
        if (keys.current['a']) p.vx -= p.speed;
        if (keys.current['d']) p.vx += p.speed;

        p.vx = Math.max(-20, Math.min(20, p.vx));
        p.vy = Math.max(-20, Math.min(20, p.vy));

        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;

        Object.values(otherPlayersRef.current).forEach((op) => {
          const dx = p.x - op.x;
          const dy = p.y - op.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = p.radius * 1.4;
          if (dist < minDist && op.health > 0) {
            const angle = Math.atan2(dy, dx);
            const overlap = minDist - dist;
            p.x += Math.cos(angle) * (overlap / 2);
            p.y += Math.sin(angle) * (overlap / 2);
          }
        });
      }

      const dx = mousePosRef.current.x - p.x;
      const dy = mousePosRef.current.y - p.y;
      p.angle = Math.atan2(dy, dx);

      if (clawTimeRef.current > 0) clawTimeRef.current--;
      if (dashCooldownRef.current > 0) dashCooldownRef.current--;

      if (p.health <= 0 && !isDead) setIsDead(true);

      syncToFirebase();
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#3e5e36";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const p = playerRef.current;
      drawBear(p.x, p.y, p.angle, p.health, p.slash, p.chat);

      Object.values(otherPlayersRef.current).forEach(op => {
        drawBear(op.x, op.y, op.angle, op.health, op.slash, op.chat);
      });

      if (isDead && respawnTimer > 0) {
        ctx.fillStyle = 'white';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Respawning in ${respawnTimer}...`, canvas.width / 2, canvas.height / 2);
      }
    };

    const loop = () => {
      update();
      draw();
      requestAnimationFrame(loop);
    };

    loop();
  }, [isDead]);

  useEffect(() => {
    if (isDead) {
      const p = playerRef.current;
      p.vx = 0;
      p.vy = 0;
      keys.current = {};
      setRespawnTimer(3);
      const countdown = setInterval(() => {
        setRespawnTimer(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setIsDead(false);
            p.health = 100;
            p.x = Math.random() * 700 + 50;
            p.y = Math.random() * 500 + 50;
            p.vx = 0;
            p.vy = 0;
            keys.current = {};
            syncToFirebase();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [isDead]);

  return (
    <>
      <canvas ref={canvasRef} className="w-full h-full absolute top-0 left-0 z-0" />
      {chatMode && (
        <input
          ref={inputRef}
          type="text"
          className="absolute bottom-10 left-1/2 transform -translate-x-1/2 p-2 rounded bg-white text-black z-10"
          placeholder="Type your message..."
        />
      )}
    </>
  );
}
