// FINAL FIX — Damage Sync + Respawn + Charge Fix + Hide Dead Bear
import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, remove, push, onDisconnect, onValue, get } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  const canvasRef = useRef(null);
  const [playerId] = useState(() => {
    const existing = localStorage.getItem("bearPlayerId");
    if (existing) return existing;
    const newId = uuidv4();
    localStorage.setItem("bearPlayerId", newId);
    return newId;
  });

  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 2, vx: 0, vy: 0, angle: 0, health: 100, slash: null });
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const bearImgRef = useRef(new Image());
  const bearLoadedRef = useRef(false);
  const [isDead, setIsDead] = useState(false);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const otherPlayersRef = useRef({});

  const syncToFirebase = () => {
    const p = playerRef.current;
    set(ref(db, `players/${playerId}`), {
      x: p.x,
      y: p.y,
      angle: p.angle,
      health: p.health,
      username: "Player",
      slash: p.slash ?? null
    });
  };

  useEffect(() => {
    const pRef = ref(db, `players/${playerId}`);
    syncToFirebase();
    onDisconnect(pRef).remove();
    return () => remove(pRef);
  }, [playerId]);

  useEffect(() => {
    if (isDead) {
      setRespawnTimer(3);
      const countdown = setInterval(() => {
        setRespawnTimer(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setIsDead(false);
            const p = playerRef.current;
            p.health = 100;
            p.x = Math.random() * 700 + 50;
            p.y = Math.random() * 500 + 50;
            p.vx = 0;
            p.vy = 0;
            keys.current = {}; // Reset all keys to prevent stuck movement
            syncToFirebase();
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

    const sendDamage = async (id, type, angle) => {
      const damageRef = push(ref(db, `damageEvents/${id}`));
      await set(damageRef, {
        from: playerId,
        type,
        angle,
        timestamp: Date.now()
      });
    };

    const pollDamage = () => {
      const dmgRef = ref(db, `damageEvents/${playerId}`);
      get(dmgRef).then(snapshot => {
        const events = snapshot.val();
        if (!events) return;
        Object.entries(events).forEach(([key, evt]) => {
          const { type, angle } = evt;
          const p = playerRef.current;
          if (type === 'slash') {
            p.health = Math.max(0, p.health - 10);
            p.vx += Math.cos(angle) * 6;
            p.vy += Math.sin(angle) * 6;
          } else if (type === 'charge') {
            p.health = Math.max(0, p.health - 30);
            p.vx += Math.cos(angle) * 10;
            p.vy += Math.sin(angle) * 10;
          }
          remove(ref(db, `damageEvents/${playerId}/${key}`));
        });
      });
    };
    const pollInterval = setInterval(pollDamage, 100);

    const handleClick = () => {
      if (clawTimeRef.current > 0 || isDead) return;
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
        if (dist < 60 && op.health > 0) {
          sendDamage(id, "slash", angle);
        }
      });
    };

    const handleKeyDown = (e) => {
      if (isDead) return;
      if (e.key === 'e' && dashCooldownRef.current <= 0) {
        const p = playerRef.current;
        const angle = p.angle;
        dashCooldownRef.current = 60;

        Object.entries(otherPlayersRef.current).forEach(([id, op]) => {
          const dx = op.x - p.x;
          const dy = op.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 65 && op.health > 0) {
            sendDamage(id, "charge", angle);
          }
        });

        p.vx += Math.cos(angle) * 10;
        p.vy += Math.sin(angle) * 10;
      }
      keys.current[e.key] = true;
    };

    const handleKeyUp = (e) => keys.current[e.key] = false;
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    onValue(ref(db, 'players'), (snapshot) => {
      const data = snapshot.val() || {};
      const others = {};
      Object.entries(data).forEach(([id, val]) => {
        if (id !== playerId && val.health > 0) {
          others[id] = val;
        }
      });
      otherPlayersRef.current = others;
    });

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);

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
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#3e5e36";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawBear = (x, y, angle, health, slash) => {
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
      };

      const p = playerRef.current;
      if (!isDead) {
        drawBear(p.x, p.y, p.angle, p.health, p.slash);
      }
      Object.values(otherPlayersRef.current).forEach(op => {
        drawBear(op.x, op.y, op.angle, op.health, op.slash);
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
    return () => clearInterval(pollInterval);
  }, [isDead, playerId]);

  return <canvas ref={canvasRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}
