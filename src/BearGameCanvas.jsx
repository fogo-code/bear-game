// FINAL FULL WORKING CODE
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

  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 1.2, vx: 0, vy: 0, angle: 0, health: 100, slash: null, chat: "", chargeTime: 0 });
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const isDeadRef = useRef(false);
  const respawnCounterRef = useRef(0);
  const [isDead, setIsDead] = useState(false);
  const otherPlayersRef = useRef({});
  const lastDamageTime = useRef(0);
  const bearImageRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.src = '/bear.png';
    img.onload = () => { bearImageRef.current = img; };
  }, []);

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
    const damageRef = ref(db, `damageEvents/${playerId}`);
    onChildAdded(damageRef, (snap) => {
      const dmg = snap.val();
      if (!dmg) return;
      const now = Date.now();
      if (now - lastDamageTime.current < 100) return;
      const p = playerRef.current;
      if (isDeadRef.current) return;

      if (dmg.type === "slash") {
        p.health = Math.max(0, p.health - 30);
        p.vx += Math.cos(dmg.angle) * 5;
        p.vy += Math.sin(dmg.angle) * 5;
      } else if (dmg.type === "charge") {
        p.health = Math.max(0, p.health - 50);
        p.vx += Math.cos(dmg.angle) * 12;
        p.vy += Math.sin(dmg.angle) * 12;
      }
      lastDamageTime.current = now;
      set(ref(db, `damageEvents/${playerId}/${snap.key}`), null);
    });

    const playersRef = ref(db, 'players');
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      delete data[playerId];
      otherPlayersRef.current = data;
    });
  }, [playerId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!chatMode) keys.current[e.key.toLowerCase()] = true;

      if (e.key === 'e' && dashCooldownRef.current <= 0 && !chatMode && !isDeadRef.current) {
        const p = playerRef.current;
        const angle = p.angle;
        p.vx += Math.cos(angle) * 10;
        p.vy += Math.sin(angle) * 10;
        dashCooldownRef.current = 60;
        p.chargeTime = Date.now();

        Object.entries(otherPlayersRef.current).forEach(([id, op]) => {
          const dx = op.x - p.x;
          const dy = op.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 70) {
            const damageRef = push(ref(db, `damageEvents/${id}`));
            set(damageRef, {
              from: playerId,
              type: "charge",
              angle,
              timestamp: Date.now()
            });
          }
        });
      }
    };

    const handleKeyUp = (e) => {
      keys.current[e.key.toLowerCase()] = false;
    };

    const handleMouseMove = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      mousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const handleClick = () => {
      if (chatMode || clawTimeRef.current > 0 || isDeadRef.current) return;
      const p = playerRef.current;
      const angle = Math.atan2(mousePosRef.current.y - p.y, mousePosRef.current.x - p.x);
      const slash = {
        x: p.x + Math.cos(angle) * (p.radius + 5),
        y: p.y + Math.sin(angle) * (p.radius + 5),
        angle,
        timestamp: Date.now()
      };
      p.slash = slash;
      clawTimeRef.current = 10;

      Object.entries(otherPlayersRef.current).forEach(([id, op]) => {
        const dx = op.x - slash.x;
        const dy = op.y - slash.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 60) {
          const damageRef = push(ref(db, `damageEvents/${id}`));
          set(damageRef, {
            from: playerId,
            type: "slash",
            angle,
            timestamp: Date.now()
          });
        }
      });
    };

    const handleChatKey = (e) => {
      if (e.key === 'Enter') {
        if (!chatMode) {
          setChatMode(true);
          setTimeout(() => inputRef.current?.focus(), 10);
        } else {
          const message = inputRef.current?.value || "";
          playerRef.current.chat = message;
          syncToFirebase();
          inputRef.current.value = "";
          setChatMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleChatKey);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleChatKey);
    };
  }, [chatMode]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');

    const loop = () => {
      const p = playerRef.current;

      if (!isDeadRef.current) {
        if (keys.current['w']) p.vy -= p.speed;
        if (keys.current['s']) p.vy += p.speed;
        if (keys.current['a']) p.vx -= p.speed;
        if (keys.current['d']) p.vx += p.speed;
      }

      Object.values(otherPlayersRef.current).forEach(op => {
        const dx = op.x - p.x;
        const dy = op.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const overlap = p.radius * 2 - dist;
        if (overlap > 0) {
          const angle = Math.atan2(dy, dx);
          const pushX = Math.cos(angle) * overlap * 0.5;
          const pushY = Math.sin(angle) * overlap * 0.5;
          p.x -= pushX;
          p.y -= pushY;
        }
      });

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.9;
      p.vy *= 0.9;

      p.x = Math.max(p.radius, Math.min(p.x, window.innerWidth - p.radius));
      p.y = Math.max(p.radius, Math.min(p.y, window.innerHeight - p.radius));

      if (clawTimeRef.current > 0) clawTimeRef.current--;
      if (dashCooldownRef.current > 0) dashCooldownRef.current--;

      p.angle = Math.atan2(mousePosRef.current.y - p.y, mousePosRef.current.x - p.x);

      if (p.health <= 0 && !isDeadRef.current) {
        isDeadRef.current = true;
        setIsDead(true);
        respawnCounterRef.current = 180;
        p.chat = "I died!";
      }

      if (isDeadRef.current) {
        if (respawnCounterRef.current <= 0) {
          p.health = 100;
          p.x = Math.random() * (window.innerWidth - 200) + 100;
          p.y = Math.random() * (window.innerHeight - 200) + 100;
          p.vx = 0;
          p.vy = 0;
          p.chat = "";
          isDeadRef.current = false;
          setIsDead(false);
        } else {
          respawnCounterRef.current--;
        }
      }

      syncToFirebase();

      ctx.fillStyle = "#1b3b1b";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      if (p.slash && Date.now() - p.slash.timestamp < 150) {
        const s = p.slash;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + Math.cos(s.angle) * 20, s.y + Math.sin(s.angle) * 20);
        ctx.stroke();
      }

      if (bearImageRef.current) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle - Math.PI / 2);
        ctx.drawImage(bearImageRef.current, -40, -40, 80, 80);
        ctx.restore();
      }

      ctx.fillStyle = "red";
      ctx.fillRect(p.x - 40, p.y - 60, 80, 6);
      ctx.fillStyle = "lime";
      ctx.fillRect(p.x - 40, p.y - 60, 80 * (p.health / 100), 6);
      ctx.fillStyle = "white";
      ctx.font = "14px Arial";
      ctx.fillText(p.chat, p.x - 30, p.y - 70);

      Object.values(otherPlayersRef.current).forEach((op) => {
        ctx.save();
        ctx.translate(op.x, op.y);
        ctx.rotate(op.angle - Math.PI / 2);
        if (bearImageRef.current) {
          ctx.drawImage(bearImageRef.current, -40, -40, 80, 80);
        }
        ctx.restore();

        ctx.fillStyle = "red";
        ctx.fillRect(op.x - 40, op.y - 60, 80, 6);
        ctx.fillStyle = "lime";
        ctx.fillRect(op.x - 40, op.y - 60, 80 * (op.health / 100), 6);
        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.fillText(op.chat || "", op.x - 30, op.y - 70);
      });

      requestAnimationFrame(loop);
    };

    loop();
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} style={{ display: 'block' }} />
      {chatMode && (
        <input
          ref={inputRef}
          type="text"
          style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}
          placeholder="Type your message..."
        />
      )}
    </div>
  );
}
